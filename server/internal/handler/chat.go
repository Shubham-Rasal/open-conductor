package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	appMiddleware "github.com/Shubham-Rasal/open-conductor/server/internal/middleware"
	agentpkg "github.com/Shubham-Rasal/open-conductor/server/pkg/agent"
	db "github.com/Shubham-Rasal/open-conductor/server/pkg/db/generated"
)

// ── Tool session registry ─────────────────────────────────────────────────────
// Each agentic chat session gets a short-lived token that the CLI agent can use
// to call workspace tool endpoints without needing JWT auth.

type toolSession struct {
	workspaceID pgtype.UUID
	store       *Store
	streamID    string // routes plan_proposal events back to the originating chat tab
}

var (
	toolSessionsMu sync.RWMutex
	toolSessions   = map[string]toolSession{}
)

func registerToolSession(token string, wsID pgtype.UUID, s *Store, streamID string) {
	toolSessionsMu.Lock()
	toolSessions[token] = toolSession{workspaceID: wsID, store: s, streamID: streamID}
	toolSessionsMu.Unlock()
}

func unregisterToolSession(token string) {
	toolSessionsMu.Lock()
	delete(toolSessions, token)
	toolSessionsMu.Unlock()
}

func lookupToolSession(token string) (toolSession, bool) {
	toolSessionsMu.RLock()
	defer toolSessionsMu.RUnlock()
	s, ok := toolSessions[token]
	return s, ok
}

// ── Routes ────────────────────────────────────────────────────────────────────

func RegisterChatRoutes(r chi.Router, s *Store) {
	r.Route("/workspaces/{workspaceId}/messages", func(r chi.Router) {
		r.Get("/", listWorkspaceMessages(s))
		r.Post("/", postWorkspaceMessage(s))
		r.Post("/plan", postWorkspacePlan(s))
	})
}

// RegisterToolRoutes registers the unauthenticated (token-gated) tool endpoints
// that the CLI agent uses during agentic chat sessions.
func RegisterToolRoutes(r chi.Router) {
	r.Route("/tool/{token}", func(r chi.Router) {
		r.Get("/issues", toolListIssues)
		r.Post("/issues", toolCreateIssue)
		r.Patch("/issues/{issueId}/assign", toolAssignIssue)
		r.Get("/agents", toolListAgents)
		r.Post("/propose_issues", toolProposeIssues)
	})
}

// ── Message list ──────────────────────────────────────────────────────────────

func listWorkspaceMessages(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		if !wsID.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}
		limit := int32(50)
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
				limit = int32(n)
			}
		}
		offset := int32(0)
		if v := r.URL.Query().Get("offset"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n >= 0 {
				offset = int32(n)
			}
		}
		msgs, err := s.Q.ListWorkspaceMessages(r.Context(), db.ListWorkspaceMessagesParams{
			WorkspaceID: wsID,
			Limit:       limit,
			Offset:      offset,
		})
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"messages": msgs})
	}
}

// ── Post message ──────────────────────────────────────────────────────────────

type historyMsg struct {
	Role    string `json:"role"`    // "user" | "assistant"
	Content string `json:"content"`
}

type postMessageRequest struct {
	Content              string       `json:"content"`
	RespondWithAssistant *bool        `json:"respond_with_assistant"`
	History              []historyMsg `json:"history,omitempty"`
}

func postWorkspaceMessage(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		if !wsID.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}
		var req postMessageRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Content) == "" {
			http.Error(w, "content is required", http.StatusBadRequest)
			return
		}
		userID := appMiddleware.GetUserID(r)
		authorID := parseUUID(userID)
		if !authorID.Valid {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		userMsg, err := s.Q.CreateWorkspaceMessage(r.Context(), db.CreateWorkspaceMessageParams{
			WorkspaceID: wsID,
			AuthorType:  "user",
			AuthorID:    authorID,
			Content:     strings.TrimSpace(req.Content),
			Metadata:    nil,
		})
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		broadcastEvent("chat:message", map[string]any{
			"workspace_id": formatUUID(wsID),
			"message":      workspaceMessageJSON(userMsg),
		})

		respond := true
		if req.RespondWithAssistant != nil {
			respond = *req.RespondWithAssistant
		}
		if !respond {
			writeJSON(w, map[string]any{"message": workspaceMessageJSON(userMsg)})
			return
		}

		ws, err := s.Q.GetWorkspace(r.Context(), wsID)
		if err != nil {
			writeJSON(w, map[string]any{"message": workspaceMessageJSON(userMsg)})
			return
		}

		b := make([]byte, 16)
		_, _ = rand.Read(b)
		streamID := hex.EncodeToString(b)
		go runWorkspaceAssistant(context.Background(), s, ws, userMsg, streamID, req.History)

		writeJSON(w, map[string]any{
			"message":   workspaceMessageJSON(userMsg),
			"stream_id": streamID,
		})
	}
}

func workspaceMessageJSON(m db.WorkspaceMessage) map[string]any {
	out := map[string]any{
		"id":           formatUUID(m.ID),
		"workspace_id": formatUUID(m.WorkspaceID),
		"author_type":  m.AuthorType,
		"content":      m.Content,
		"created_at":   m.CreatedAt.Time,
	}
	if m.AuthorID.Valid {
		out["author_id"] = formatUUID(m.AuthorID)
	}
	if len(m.Metadata) > 0 {
		var meta any
		if json.Unmarshal(m.Metadata, &meta) == nil {
			out["metadata"] = meta
		}
	}
	return out
}

// ── Agentic assistant runner ───────────────────────────────────────────────────

func runWorkspaceAssistant(ctx context.Context, s *Store, ws db.Workspace, userMsg db.WorkspaceMessage, streamID string, history []historyMsg) {
	tool, path := pickChatAgent(ctx)
	if path == "" {
		slog.Warn("workspace chat: no agent CLI found")
		broadcastEvent("chat:stream", map[string]any{
			"workspace_id": formatUUID(ws.ID),
			"stream_id":    streamID,
			"kind":         "text",
			"delta":        "[No coding agent CLI found on PATH. Install claude, codex, or opencode.]",
			"done":         true,
		})
		return
	}

	cfg := agentpkg.Config{
		ExecutablePath: path,
		Logger:         slog.Default(),
	}
	backend, err := agentpkg.New(tool.Provider, cfg)
	if err != nil {
		broadcastEvent("chat:stream", map[string]any{
			"workspace_id": formatUUID(ws.ID),
			"stream_id":    streamID,
			"kind":         "text",
			"delta":        err.Error(),
			"done":         true,
		})
		return
	}

	cwd := ""
	if ws.WorkingDirectory != nil {
		cwd = strings.TrimSpace(*ws.WorkingDirectory)
		if strings.HasPrefix(cwd, "~/") {
			if home, err := os.UserHomeDir(); err == nil {
				cwd = home + strings.TrimPrefix(cwd, "~")
			}
		}
	}

	// Fetch workspace context: issues + agents
	issues, _ := s.Q.ListIssues(ctx, ws.ID)
	agents, _ := s.Q.ListAgents(ctx, ws.ID)

	var issuesCtx strings.Builder
	if len(issues) == 0 {
		issuesCtx.WriteString("  (no issues yet)\n")
	}
	for _, iss := range issues {
		desc := ""
		if iss.Description != nil {
			desc = " — " + *iss.Description
		}
		num := ""
		if iss.Number != nil {
			num = fmt.Sprintf("#%d ", *iss.Number)
		}
		issuesCtx.WriteString(fmt.Sprintf("  %s[%s] %s (%s)%s\n", num, iss.Status, iss.Title, iss.Priority, desc))
	}

	var agentsCtx strings.Builder
	if len(agents) == 0 {
		agentsCtx.WriteString("  (no agents connected)\n")
	}
	for _, ag := range agents {
		agentsCtx.WriteString(fmt.Sprintf("  id=%s  name=%q  status=%s\n", formatUUID(ag.ID), ag.Name, ag.Status))
	}

	// Per-session tool token
	tb := make([]byte, 16)
	_, _ = rand.Read(tb)
	toolToken := hex.EncodeToString(tb)
	registerToolSession(toolToken, ws.ID, s, streamID)
	defer unregisterToolSession(toolToken)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	baseURL := fmt.Sprintf("http://localhost:%s/tool/%s", port, toolToken)

	systemPrompt := fmt.Sprintf(`You are a conversational planning assistant for the software workspace %q.

## Behaviour rules
1. ALWAYS reply with natural language first — explain your thinking, analysis, or suggestions clearly.
2. Keep replies concise and readable (markdown lists/headers are fine).
3. Do NOT silently run tools without explaining what you are doing in plain text.
4. When you have developed a sufficiently concrete plan (after back-and-forth discussion), call propose_issues to surface the issues for the user to review and add. Do this on your own judgment — you do not need to wait for an explicit "generate issues" command.
5. Only create issues directly (POST /issues) if the user explicitly asks you to create them right now.

## Current backlog
%s
## Connected agents
%s
## Available workspace tools (use curl, all pre-authenticated)

List issues:
  curl -s '%s/issues'

Propose a set of issues for user review (call this when you have a concrete plan):
  curl -s -X POST '%s/propose_issues' \
    -H 'Content-Type: application/json' \
    -d '[{"title":"…","description":"…","priority":"medium","suggested_assignee":"agent"},…]'
  (priority: no_priority | low | medium | high | urgent)
  (suggested_assignee: agent | member)

Create an issue directly (only when user explicitly asks):
  curl -s -X POST '%s/issues' \
    -H 'Content-Type: application/json' \
    -d '{"title":"…","description":"…","priority":"medium","status":"backlog","assignee_type":"agent"}'

Assign an issue to an agent:
  curl -s -X PATCH '%s/issues/{issue_id}/assign' \
    -H 'Content-Type: application/json' \
    -d '{"agent_id":"…"}'

List agents (to get IDs for assignment):
  curl -s '%s/agents'`,
		ws.Name,
		issuesCtx.String(),
		agentsCtx.String(),
		baseURL, baseURL, baseURL, baseURL, baseURL, baseURL,
	)

	execCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()

	opts := agentpkg.ExecOptions{
		Cwd:          cwd,
		SystemPrompt: systemPrompt,
		Timeout:      10 * time.Minute,
		MaxTurns:     20,
	}
	// Build prompt — prepend conversation history so the agent has full context
	// when continuing an existing chat thread.
	var promptBuilder strings.Builder
	if len(history) > 0 {
		promptBuilder.WriteString("<conversation_history>\n")
		for _, h := range history {
			role := "User"
			if h.Role == "assistant" {
				role = "Assistant"
			}
			promptBuilder.WriteString(role + ": " + strings.TrimSpace(h.Content) + "\n\n")
		}
		promptBuilder.WriteString("</conversation_history>\n\nContinuing the conversation above.\n\n")
	}
	promptBuilder.WriteString(userMsg.Content)
	fullPrompt := promptBuilder.String()

	session, err := backend.Execute(execCtx, fullPrompt, opts)
	if err != nil {
		broadcastEvent("chat:stream", map[string]any{
			"workspace_id": formatUUID(ws.ID),
			"stream_id":    streamID,
			"kind":         "text",
			"delta":        err.Error(),
			"done":         true,
		})
		return
	}

	var full strings.Builder
	for msg := range session.Messages {
		switch msg.Type {
		case agentpkg.MessageText:
			if msg.Content != "" {
				full.WriteString(msg.Content)
				broadcastEvent("chat:stream", map[string]any{
					"workspace_id": formatUUID(ws.ID),
					"stream_id":    streamID,
					"kind":         "text",
					"delta":        msg.Content,
				})
			}
		case agentpkg.MessageThinking:
			if msg.Content != "" {
				broadcastEvent("chat:stream", map[string]any{
					"workspace_id": formatUUID(ws.ID),
					"stream_id":    streamID,
					"kind":         "thinking",
					"delta":        msg.Content,
				})
			}
		case agentpkg.MessageToolUse:
			inputJSON, _ := json.Marshal(msg.Input)
			broadcastEvent("chat:stream", map[string]any{
				"workspace_id": formatUUID(ws.ID),
				"stream_id":    streamID,
				"kind":         "tool_use",
				"tool":         msg.Tool,
				"call_id":      msg.CallID,
				"input":        string(inputJSON),
			})
		case agentpkg.MessageToolResult:
			broadcastEvent("chat:stream", map[string]any{
				"workspace_id": formatUUID(ws.ID),
				"stream_id":    streamID,
				"kind":         "tool_result",
				"tool":         msg.Tool,
				"call_id":      msg.CallID,
				"output":       msg.Output,
			})
		}
	}

	res := <-session.Result
	text := full.String()
	if res.Output != "" && text == "" {
		text = res.Output
	}
	if res.Error != "" && text == "" {
		text = "[Agent error] " + res.Error
	}

	// If the agent emitted its full text only in res.Output (not via streaming
	// MessageText events), broadcast it now so the frontend can display it.
	if text != "" && full.Len() == 0 {
		broadcastEvent("chat:stream", map[string]any{
			"workspace_id": formatUUID(ws.ID),
			"stream_id":    streamID,
			"kind":         "text",
			"delta":        text,
		})
	}

	meta, _ := json.Marshal(map[string]any{"provider": tool.Provider, "status": res.Status})
	assistantMsg, err := s.Q.CreateWorkspaceMessage(ctx, db.CreateWorkspaceMessageParams{
		WorkspaceID: ws.ID,
		AuthorType:  "assistant",
		AuthorID:    pgtype.UUID{Valid: false},
		Content:     text,
		Metadata:    meta,
	})
	if err != nil {
		slog.Error("save assistant message", "err", err)
		return
	}
	broadcastEvent("chat:message", map[string]any{
		"workspace_id": formatUUID(ws.ID),
		"message":      workspaceMessageJSON(assistantMsg),
	})
	broadcastEvent("chat:stream", map[string]any{
		"workspace_id": formatUUID(ws.ID),
		"stream_id":    streamID,
		"kind":         "text",
		"delta":        "",
		"done":         true,
	})
}

func pickChatAgent(ctx context.Context) (agentpkg.DetectedTool, string) {
	tools := agentpkg.DetectAll(ctx, nil)
	order := []string{"claude", "codex", "opencode"}
	for _, want := range order {
		for _, t := range tools {
			if t.Provider == want && t.Available && t.Path != "" {
				return t, t.Path
			}
		}
	}
	for _, t := range tools {
		if t.Available && t.Path != "" {
			return t, t.Path
		}
	}
	return agentpkg.DetectedTool{}, ""
}

// ── Plan endpoint ─────────────────────────────────────────────────────────────

type proposedIssue struct {
	Title             string  `json:"title"`
	Description       *string `json:"description"`
	Priority          string  `json:"priority"`
	SuggestedAssignee string  `json:"suggested_assignee"` // "agent" | "member"
}

type postPlanRequest struct {
	Goal string `json:"goal"`
}

func postWorkspacePlan(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		if !wsID.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}
		var req postPlanRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Goal) == "" {
			http.Error(w, "goal is required", http.StatusBadRequest)
			return
		}

		ws, err := s.Q.GetWorkspace(r.Context(), wsID)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		tool, path := pickChatAgent(r.Context())
		if path == "" {
			writeJSON(w, map[string]any{"issues": []proposedIssue{}, "error": "no agent CLI available"})
			return
		}

		cfg := agentpkg.Config{ExecutablePath: path, Logger: slog.Default()}
		backend, err := agentpkg.New(tool.Provider, cfg)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		cwd := ""
		if ws.WorkingDirectory != nil {
			cwd = strings.TrimSpace(*ws.WorkingDirectory)
			if strings.HasPrefix(cwd, "~/") {
				if home, err := os.UserHomeDir(); err == nil {
					cwd = home + strings.TrimPrefix(cwd, "~")
				}
			}
		}

		prompt := `You must respond with ONLY valid JSON (no markdown fence): an array of objects, each with:
"title" (string, required),
"description" (string or null),
"priority" (one of: no_priority, low, medium, high, urgent),
"suggested_assignee" (either "agent" or "member").

Break down this goal into 3-8 concrete issues for a coding team.

Goal:
` + strings.TrimSpace(req.Goal)

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
		defer cancel()
		opts := agentpkg.ExecOptions{Cwd: cwd, Timeout: 5 * time.Minute, MaxTurns: 4}
		session, err := backend.Execute(ctx, prompt, opts)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var out strings.Builder
		for msg := range session.Messages {
			if msg.Type == agentpkg.MessageText && msg.Content != "" {
				out.WriteString(msg.Content)
			}
		}
		res := <-session.Result
		text := out.String()
		if res.Output != "" {
			text = res.Output
		}
		text = strings.TrimSpace(text)
		if strings.HasPrefix(text, "```") {
			lines := strings.Split(text, "\n")
			if len(lines) > 2 {
				text = strings.Join(lines[1:len(lines)-1], "\n")
			}
			text = strings.TrimSpace(text)
		}

		var issues []proposedIssue
		if err := json.Unmarshal([]byte(text), &issues); err != nil {
			writeJSON(w, map[string]any{
				"issues": []proposedIssue{},
				"raw":    text,
				"error":  "could not parse model output as JSON",
			})
			return
		}
		writeJSON(w, map[string]any{"issues": issues})
	}
}

// ── Tool endpoints ─────────────────────────────────────────────────────────────
// These are called by the CLI agent via curl during agentic sessions.

func toolListIssues(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	sess, ok := lookupToolSession(token)
	if !ok {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}
	issues, err := sess.store.Q.ListIssues(r.Context(), sess.workspaceID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	type issueOut struct {
		ID          string  `json:"id"`
		Number      *int32  `json:"number"`
		Title       string  `json:"title"`
		Description *string `json:"description"`
		Status      string  `json:"status"`
		Priority    string  `json:"priority"`
		Assignee    string  `json:"assignee"`
	}
	out := make([]issueOut, 0, len(issues))
	for _, iss := range issues {
		assignee := "unassigned"
		if iss.AssigneeType != nil {
			assignee = *iss.AssigneeType
			if *iss.AssigneeType == "agent" && iss.AgentAssigneeID.Valid {
				assignee = "agent:" + formatUUID(iss.AgentAssigneeID)
			}
		}
		out = append(out, issueOut{
			ID:          formatUUID(iss.ID),
			Number:      iss.Number,
			Title:       iss.Title,
			Description: iss.Description,
			Status:      iss.Status,
			Priority:    iss.Priority,
			Assignee:    assignee,
		})
	}
	writeJSON(w, out)
}

func toolCreateIssue(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	sess, ok := lookupToolSession(token)
	if !ok {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	var req struct {
		Title        string  `json:"title"`
		Description  *string `json:"description"`
		Priority     string  `json:"priority"`
		Status       string  `json:"status"`
		AssigneeType string  `json:"assignee_type"`
		AgentID      string  `json:"agent_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Title) == "" {
		http.Error(w, "title is required", http.StatusBadRequest)
		return
	}
	if req.Priority == "" {
		req.Priority = "no_priority"
	}
	if req.Status == "" {
		req.Status = "backlog"
	}

	num, err := sess.store.Q.NextIssueNumber(r.Context(), sess.workspaceID)
	if err != nil {
		num = 1
	}

	assigneeType := &req.AssigneeType
	if req.AssigneeType == "" {
		assigneeType = nil
	}
	agentID := parseUUID(req.AgentID)

	iss, err := sess.store.Q.CreateIssue(r.Context(), db.CreateIssueParams{
		WorkspaceID:     sess.workspaceID,
		Number:          &num,
		Title:           strings.TrimSpace(req.Title),
		Description:     req.Description,
		Status:          req.Status,
		Priority:        req.Priority,
		AssigneeType:    assigneeType,
		AgentAssigneeID: agentID,
		UserAssigneeID:  pgtype.UUID{Valid: false},
		CreatedByID:     pgtype.UUID{Valid: false},
	})
	if err != nil {
		http.Error(w, "create failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	broadcastEvent("issue:created", map[string]any{
		"workspace_id": formatUUID(sess.workspaceID),
		"issue": map[string]any{
			"id":       formatUUID(iss.ID),
			"number":   iss.Number,
			"title":    iss.Title,
			"status":   iss.Status,
			"priority": iss.Priority,
		},
	})

	writeJSON(w, map[string]any{
		"id":     formatUUID(iss.ID),
		"number": iss.Number,
		"title":  iss.Title,
		"status": iss.Status,
	})
}

func toolAssignIssue(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	sess, ok := lookupToolSession(token)
	if !ok {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	issueID := parseUUID(chi.URLParam(r, "issueId"))
	if !issueID.Valid {
		http.Error(w, "invalid issue id", http.StatusBadRequest)
		return
	}

	var req struct {
		AgentID string `json:"agent_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AgentID == "" {
		http.Error(w, "agent_id is required", http.StatusBadRequest)
		return
	}

	agentID := parseUUID(req.AgentID)
	if !agentID.Valid {
		http.Error(w, "invalid agent_id", http.StatusBadRequest)
		return
	}

	assigneeType := "agent"
	_, err := sess.store.Q.UpdateIssue(r.Context(), db.UpdateIssueParams{
		ID:              issueID,
		AssigneeType:    &assigneeType,
		AgentAssigneeID: agentID,
		UserAssigneeID:  pgtype.UUID{Valid: false},
	})
	if err != nil {
		http.Error(w, "update failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	broadcastEvent("issue:updated", map[string]any{
		"workspace_id": formatUUID(sess.workspaceID),
		"issue_id":     formatUUID(issueID),
	})

	writeJSON(w, map[string]any{"ok": true})
}

func toolProposeIssues(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	sess, ok := lookupToolSession(token)
	if !ok {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	var issues []proposedIssue
	if err := json.NewDecoder(r.Body).Decode(&issues); err != nil || len(issues) == 0 {
		http.Error(w, "expected non-empty JSON array of issues", http.StatusBadRequest)
		return
	}

	// Broadcast a plan_proposal stream event so the frontend can render the
	// interactive issues card inline in the chat conversation.
	broadcastEvent("chat:stream", map[string]any{
		"workspace_id": formatUUID(sess.workspaceID),
		"stream_id":    sess.streamID,
		"kind":         "plan_proposal",
		"issues":       issues,
	})

	writeJSON(w, map[string]any{"ok": true, "count": len(issues)})
}

func toolListAgents(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	sess, ok := lookupToolSession(token)
	if !ok {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	agents, err := sess.store.Q.ListAgents(r.Context(), sess.workspaceID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	type agentOut struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Status string `json:"status"`
		Model  string `json:"model,omitempty"`
	}
	out := make([]agentOut, 0, len(agents))
	for _, ag := range agents {
		model := ""
		if ag.Model != nil {
			model = *ag.Model
		}
		out = append(out, agentOut{
			ID:     formatUUID(ag.ID),
			Name:   ag.Name,
			Status: string(ag.Status),
			Model:  model,
		})
	}
	writeJSON(w, out)
}
