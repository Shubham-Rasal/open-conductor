// Package runner implements the in-process task execution loop.
// Each Runner watches a single agent runtime (agent + workspace), claims tasks with
// workspace-scoped concurrency, and runs LocalExecutor or RemoteExecutor.
package runner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	agentpkg "github.com/Shubham-Rasal/open-conductor/server/pkg/agent"
	db "github.com/Shubham-Rasal/open-conductor/server/pkg/db/generated"
)

// Registry manages active runners (one per agent runtime — unique by runtime row id).
type Registry struct {
	mu      sync.Mutex
	running map[string]context.CancelFunc // keyed by runtime UUID hex
}

var Global = &Registry{running: make(map[string]context.CancelFunc)}

// Start launches a worker pool for one runtime if not already running.
func (reg *Registry) Start(parentCtx context.Context, q *db.Queries, runtimeID, agentID, workspaceID pgtype.UUID, provider, workspaceType string, connectionURL *string, broadcast func([]byte)) {
	key := fmt.Sprintf("%x", runtimeID.Bytes)
	reg.mu.Lock()
	if _, exists := reg.running[key]; exists {
		reg.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(parentCtx)
	reg.running[key] = cancel
	reg.mu.Unlock()

	workDir := ""
	if wsRow, err := q.GetWorkspace(parentCtx, workspaceID); err == nil && wsRow.WorkingDirectory != nil {
		workDir = strings.TrimSpace(*wsRow.WorkingDirectory)
		if strings.HasPrefix(workDir, "~/") {
			if home, err := os.UserHomeDir(); err == nil {
				workDir = filepath.Join(home, strings.TrimPrefix(workDir, "~/"))
			}
		}
	}

	ex := newExecutor(provider, workspaceType, connectionURL, workDir, slog.Default())
	r := &Runner{
		q:               q,
		runtimeID:       runtimeID,
		agentID:         agentID,
		workspaceID:     workspaceID,
		provider:        provider,
		workspaceType:   workspaceType,
		connectionURL:   connectionURL,
		executor:        ex,
		broadcast:       broadcast,
		concurrentTasks: atomic.Int32{},
	}
	go func() {
		defer func() {
			reg.mu.Lock()
			delete(reg.running, key)
			reg.mu.Unlock()
		}()
		r.loop(ctx)
	}()

	slog.Info("runner started", "runtime_id", key, "agent_id", fmt.Sprintf("%x", agentID.Bytes), "provider", provider)
}

// IsRunning reports whether a runner is active for this runtime id.
func (reg *Registry) IsRunning(runtimeID pgtype.UUID) bool {
	if !runtimeID.Valid {
		return false
	}
	key := fmt.Sprintf("%x", runtimeID.Bytes)
	reg.mu.Lock()
	defer reg.mu.Unlock()
	_, ok := reg.running[key]
	return ok
}

// Stop cancels the runner for the given runtime id (if running).
func (reg *Registry) Stop(runtimeID pgtype.UUID) {
	key := fmt.Sprintf("%x", runtimeID.Bytes)
	reg.mu.Lock()
	defer reg.mu.Unlock()
	if cancel, ok := reg.running[key]; ok {
		cancel()
	}
}

// Runner claims and executes tasks for one agent runtime.
type Runner struct {
	q               *db.Queries
	runtimeID       pgtype.UUID
	agentID         pgtype.UUID
	workspaceID     pgtype.UUID
	provider        string
	workspaceType   string
	connectionURL   *string
	executor        Executor
	broadcast       func([]byte)
	concurrentTasks atomic.Int32
}

func (r *Runner) loop(ctx context.Context) {
	ag, err := r.q.GetAgent(ctx, r.agentID)
	if err != nil {
		slog.Error("runner loop: get agent", "err", err)
		return
	}
	n := int(ag.MaxConcurrentTasks)
	if n < 1 {
		n = 1
	}
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r.workerLoop(ctx)
		}()
	}
	wg.Wait()
}

func (r *Runner) workerLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		task, err := r.q.ClaimAgentTask(ctx, db.ClaimAgentTaskParams{
			AgentID:     r.agentID,
			WorkspaceID: r.workspaceID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				select {
				case <-ctx.Done():
					return
				case <-time.After(2 * time.Second):
				}
				continue
			}
			slog.Warn("claim task", "err", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
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

	if r.concurrentTasks.Add(1) == 1 {
		r.setAgentStatus(ctx, "working")
	}
	defer func() {
		if r.concurrentTasks.Add(-1) == 0 {
			r.setAgentStatus(ctx, "idle")
		}
	}()

	r.setIssueStatus(ctx, task, "in_progress")
	r.broadcastEvent("task:stage", map[string]any{
		"task_id":  taskIDStr,
		"issue_id": issueIDStr,
		"stage":    "dispatched",
	})

	wsRow, wsErr := r.q.GetWorkspace(ctx, r.workspaceID)
	workDir := ""
	if wsErr == nil && wsRow.WorkingDirectory != nil {
		workDir = strings.TrimSpace(*wsRow.WorkingDirectory)
		if strings.HasPrefix(workDir, "~/") {
			if home, err := os.UserHomeDir(); err == nil {
				workDir = filepath.Join(home, strings.TrimPrefix(workDir, "~/"))
			}
		}
	}

	prompt, err := r.buildPrompt(ctx, task, workDir)
	if err != nil {
		slog.Error("build prompt", "err", err)
		r.setIssueStatus(ctx, task, "blocked")
		r.failTask(ctx, task.ID, issueIDStr, err.Error())
		return
	}

	agentRow, err := r.q.GetAgent(ctx, r.agentID)
	if err != nil {
		r.setIssueStatus(ctx, task, "blocked")
		r.failTask(ctx, task.ID, issueIDStr, "agent not found")
		return
	}

	lastSession, _ := r.q.GetLastCompletedSession(ctx, db.GetLastCompletedSessionParams{
		AgentID:     r.agentID,
		WorkspaceID: r.workspaceID,
	})

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
	if workDir != "" {
		opts.Cwd = workDir
	}

	session, err := r.executor.Execute(execCtx, prompt, opts)
	if err != nil {
		slog.Error("executor execute", "err", err)
		r.setIssueStatus(ctx, task, "blocked")
		r.failTask(ctx, task.ID, issueIDStr, err.Error())
		return
	}

	_, _ = r.q.StartTask(ctx, task.ID)
	r.broadcastEvent("task:stage", map[string]any{
		"task_id":  taskIDStr,
		"issue_id": issueIDStr,
		"stage":    "running",
	})
	slog.Info("task running", "task_id", taskIDStr)

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

func (r *Runner) buildPrompt(ctx context.Context, task db.AgentTaskQueue, workDir string) (string, error) {
	if !task.IssueID.Valid {
		return "Complete the assigned task.", nil
	}

	issue, err := r.q.GetIssueForTask(ctx, task.ID)
	if err != nil {
		return "", fmt.Errorf("get issue: %w", err)
	}

	var sb strings.Builder
	sb.WriteString("You are working on issue")
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

	if workDir != "" {
		sb.WriteString(fmt.Sprintf("Complete this task. Use %q as the working directory for all file operations.\n", workDir))
	} else {
		sb.WriteString("Complete this task. Work in the current directory.")
	}
	return sb.String(), nil
}
