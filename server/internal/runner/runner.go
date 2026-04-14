// Package runner implements the in-process task execution loop.
// Each Runner watches a single agent's task queue, claims tasks, spawns the
// configured CLI backend (claude, opencode, codex), and reports results back
// to the database + WebSocket clients.
package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	agentpkg "github.com/Shubham-Rasal/open-conductor/server/pkg/agent"
	db "github.com/Shubham-Rasal/open-conductor/server/pkg/db/generated"
)

// Registry manages all active runners and prevents duplicates.
type Registry struct {
	mu      sync.Mutex
	running map[string]context.CancelFunc // keyed by agent UUID string
}

var Global = &Registry{running: make(map[string]context.CancelFunc)}

// Start launches a runner for agentID if one isn't already running.
func (reg *Registry) Start(parentCtx context.Context, q *db.Queries, agentID pgtype.UUID, provider string, broadcast func([]byte)) {
	key := fmt.Sprintf("%x", agentID.Bytes)
	reg.mu.Lock()
	if _, exists := reg.running[key]; exists {
		reg.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(parentCtx)
	reg.running[key] = cancel
	reg.mu.Unlock()

	r := &Runner{q: q, agentID: agentID, provider: provider, broadcast: broadcast}
	go func() {
		defer func() {
			reg.mu.Lock()
			delete(reg.running, key)
			reg.mu.Unlock()
		}()
		r.loop(ctx)
	}()

	slog.Info("runner started", "agent_id", key, "provider", provider)
}

// IsRunning reports whether a task runner goroutine is active for this agent.
func (reg *Registry) IsRunning(agentID pgtype.UUID) bool {
	if !agentID.Valid {
		return false
	}
	key := fmt.Sprintf("%x", agentID.Bytes)
	reg.mu.Lock()
	defer reg.mu.Unlock()
	_, ok := reg.running[key]
	return ok
}

// Stop cancels the runner for agentID (if running).
func (reg *Registry) Stop(agentID pgtype.UUID) {
	key := fmt.Sprintf("%x", agentID.Bytes)
	reg.mu.Lock()
	defer reg.mu.Unlock()
	if cancel, ok := reg.running[key]; ok {
		cancel()
	}
}

// Runner claims and executes tasks for one agent.
type Runner struct {
	q         *db.Queries
	agentID   pgtype.UUID
	provider  string
	broadcast func([]byte)
}

func (r *Runner) loop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		task, err := r.q.ClaimAgentTask(ctx, r.agentID)
		if err != nil {
			// No task available — sleep and retry
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
			}
			continue
		}

		r.executeTask(ctx, task)
	}
}

func uuidStr(u pgtype.UUID) string {
	b := u.Bytes
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func (r *Runner) setAgentStatus(ctx context.Context, status string) {
	_ = r.q.UpdateAgentStatusOnly(ctx, db.UpdateAgentStatusOnlyParams{
		ID:     r.agentID,
		Status: status,
	})
	r.broadcastEvent("agent:status", map[string]any{
		"agent_id": uuidStr(r.agentID),
		"status":   status,
	})
}

func (r *Runner) executeTask(ctx context.Context, task db.AgentTaskQueue) {
	taskIDStr := uuidStr(task.ID)
	agentIDStr := uuidStr(task.AgentID)
	var issueIDStr string
	if task.IssueID.Valid {
		issueIDStr = uuidStr(task.IssueID)
	}

	slog.Info("executing task", "task_id", taskIDStr, "agent_id", agentIDStr)

	// Mark agent as working + move issue → in_progress
	r.setAgentStatus(ctx, "working")
	r.setIssueStatus(ctx, task, "in_progress")
	r.broadcastEvent("task:stage", map[string]any{
		"task_id":  taskIDStr,
		"issue_id": issueIDStr,
		"stage":    "dispatched",
	})

	defer func() {
		r.setAgentStatus(ctx, "idle")
	}()

	// Build prompt from the issue
	prompt, err := r.buildPrompt(ctx, task)
	if err != nil {
		slog.Error("build prompt", "err", err)
		r.setIssueStatus(ctx, task, "blocked")
		r.failTask(ctx, task.ID, issueIDStr, err.Error())
		return
	}

	// Get agent details (instructions = system prompt)
	agentRow, err := r.q.GetAgent(ctx, r.agentID)
	if err != nil {
		r.setIssueStatus(ctx, task, "blocked")
		r.failTask(ctx, task.ID, issueIDStr, "agent not found")
		return
	}

	// Get last session ID for resume
	lastSession, _ := r.q.GetLastCompletedSession(ctx, r.agentID)

	// Build and execute backend
	backend, err := agentpkg.New(r.provider, agentpkg.Config{
		Logger: slog.Default(),
	})
	if err != nil {
		r.setIssueStatus(ctx, task, "blocked")
		r.failTask(ctx, task.ID, issueIDStr, fmt.Sprintf("unknown provider %q", r.provider))
		return
	}

	execCtx, cancel := context.WithTimeout(ctx, 30*time.Minute)
	defer cancel()

	opts := agentpkg.ExecOptions{
		SystemPrompt: agentRow.Instructions,
		Timeout:      30 * time.Minute,
	}
	if agentRow.Model != nil && *agentRow.Model != "" {
		opts.Model = *agentRow.Model
	}
	if lastSession != nil && *lastSession != "" {
		opts.ResumeSessionID = *lastSession
	}

	session, err := backend.Execute(execCtx, prompt, opts)
	if err != nil {
		slog.Error("backend execute", "err", err)
		r.setIssueStatus(ctx, task, "blocked")
		r.failTask(ctx, task.ID, issueIDStr, err.Error())
		return
	}

	// Mark task as running
	_, _ = r.q.StartTask(ctx, task.ID)
	r.broadcastEvent("task:stage", map[string]any{
		"task_id":  taskIDStr,
		"issue_id": issueIDStr,
		"stage":    "running",
	})
	slog.Info("task running", "task_id", taskIDStr)

	// Stream messages to WS clients
	for msg := range session.Messages {
		switch msg.Type {
		case agentpkg.MessageText:
			if msg.Content != "" {
				r.broadcastEvent("task:message", map[string]any{
					"task_id":  taskIDStr,
					"issue_id": issueIDStr,
					"content":  msg.Content,
					"kind":     "text",
				})
			}
		case agentpkg.MessageToolUse:
			r.broadcastEvent("task:message", map[string]any{
				"task_id":  taskIDStr,
				"issue_id": issueIDStr,
				"content":  fmt.Sprintf("Using tool: %s", msg.Tool),
				"kind":     "tool",
				"tool":     msg.Tool,
			})
		case agentpkg.MessageStatus:
			r.broadcastEvent("task:message", map[string]any{
				"task_id":  taskIDStr,
				"issue_id": issueIDStr,
				"content":  msg.Status,
				"kind":     "status",
			})
		}
	}

	// Collect result
	result := <-session.Result
	if result.Status == "completed" {
		sessionID := result.SessionID
		output := result.Output
		workDir := ""
		branch := ""
		_, _ = r.q.CompleteTask(ctx, db.CompleteTaskParams{
			ID:         task.ID,
			Output:     &output,
			SessionID:  &sessionID,
			WorkDir:    &workDir,
			BranchName: &branch,
		})
		// Move issue → in_review so a human can verify the work
		r.setIssueStatus(ctx, task, "in_review")
		r.broadcastEvent("task:stage", map[string]any{
			"task_id":    taskIDStr,
			"issue_id":   issueIDStr,
			"stage":      "completed",
			"session_id": sessionID,
			"output":     output,
		})
		slog.Info("task completed", "task_id", taskIDStr, "session_id", sessionID)
	} else {
		errMsg := result.Error
		if errMsg == "" {
			errMsg = result.Status
		}
		// Move issue → blocked so it's visible that intervention is needed
		r.setIssueStatus(ctx, task, "blocked")
		r.failTask(ctx, task.ID, issueIDStr, errMsg)
	}
}

func (r *Runner) failTask(ctx context.Context, taskID pgtype.UUID, issueIDStr string, errMsg string) {
	_, _ = r.q.FailTask(ctx, db.FailTaskParams{ID: taskID, ErrorMessage: &errMsg})
	r.broadcastEvent("task:stage", map[string]any{
		"task_id":  uuidStr(taskID),
		"issue_id": issueIDStr,
		"stage":    "failed",
		"error":    errMsg,
	})
	slog.Error("task failed", "task_id", uuidStr(taskID), "error", errMsg)
}

// setIssueStatus updates the issue row status and broadcasts an issue:updated event.
func (r *Runner) setIssueStatus(ctx context.Context, task db.AgentTaskQueue, status string) {
	if !task.IssueID.Valid {
		return
	}
	updated, err := r.q.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{
		ID:     task.IssueID,
		Status: status,
	})
	if err != nil {
		slog.Warn("update issue status", "err", err, "status", status)
		return
	}
	r.broadcastEvent("issue:updated", updated)
}

func (r *Runner) broadcastEvent(eventType string, payload any) {
	if r.broadcast == nil {
		return
	}
	b, _ := json.Marshal(map[string]any{"type": eventType, "payload": payload})
	r.broadcast(b)
}

func (r *Runner) buildPrompt(ctx context.Context, task db.AgentTaskQueue) (string, error) {
	if !task.IssueID.Valid {
		return "Complete the assigned task.", nil
	}

	issue, err := r.q.GetIssueForTask(ctx, task.ID)
	if err != nil {
		return "", fmt.Errorf("get issue: %w", err)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("You are working on issue"))
	if issue.Number != nil {
		sb.WriteString(fmt.Sprintf(" #%d", *issue.Number))
	}
	sb.WriteString(fmt.Sprintf(": %s\n\n", issue.Title))

	if issue.Description != nil && *issue.Description != "" {
		sb.WriteString(*issue.Description)
		sb.WriteString("\n\n")
	}

	comments, _ := r.q.ListCommentsForIssue(ctx, issue.ID)
	if len(comments) > 0 {
		sb.WriteString("Previous comments:\n")
		for _, c := range comments {
			sb.WriteString(fmt.Sprintf("- [%s] %s\n", c.AuthorType, c.Content))
		}
		sb.WriteString("\n")
	}

	sb.WriteString("Complete this task. Work in the current directory.")
	return sb.String(), nil
}
