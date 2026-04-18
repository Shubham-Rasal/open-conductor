package handler

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	appMiddleware "github.com/Shubham-Rasal/open-conductor/server/internal/middleware"
	agentpkg "github.com/Shubham-Rasal/open-conductor/server/pkg/agent"
	db "github.com/Shubham-Rasal/open-conductor/server/pkg/db/generated"
)

// ── Assistant tool session (no auth / no secret token) ────────────────────────
// While a planning chat stream is active, the CLI agent may call workspace-scoped
// URLs. Stream id in the path ties propose_* events to the correct chat tab.

type assistantToolSession struct {
	workspaceID string
	store       *Store
	streamID    string
}

var (
	assistantToolSessionsMu sync.RWMutex
	assistantToolSessions   = map[string]assistantToolSession{} // keyed by chat stream_id
)

func registerAssistantToolSession(streamID string, wsID string, s *Store) {
	assistantToolSessionsMu.Lock()
	assistantToolSessions[streamID] = assistantToolSession{workspaceID: wsID, store: s, streamID: streamID}
	assistantToolSessionsMu.Unlock()
}

func unregisterAssistantToolSession(streamID string) {
	assistantToolSessionsMu.Lock()
	delete(assistantToolSessions, streamID)
	assistantToolSessionsMu.Unlock()
}

func lookupAssistantToolSession(streamID string) (assistantToolSession, bool) {
	assistantToolSessionsMu.RLock()
	defer assistantToolSessionsMu.RUnlock()
	sess, ok := assistantToolSessions[streamID]
	return sess, ok
}

// ── Assistant stream cancellation (Stop button) ───────────────────────────────

type chatStreamCancel struct {
	workspaceID string
	cancel      context.CancelFunc
}

var (
	chatStreamCancelsMu sync.Mutex
	chatStreamCancels   = map[string]chatStreamCancel{}
)

func registerChatStreamCancel(streamID string, workspaceID string, cancel context.CancelFunc) {
	chatStreamCancelsMu.Lock()
	chatStreamCancels[streamID] = chatStreamCancel{workspaceID: workspaceID, cancel: cancel}
	chatStreamCancelsMu.Unlock()
}

func unregisterChatStreamCancel(streamID string) {
	chatStreamCancelsMu.Lock()
	delete(chatStreamCancels, streamID)
	chatStreamCancelsMu.Unlock()
}

func takeChatStreamCancel(streamID string, workspaceID string) (context.CancelFunc, bool) {
	chatStreamCancelsMu.Lock()
	defer chatStreamCancelsMu.Unlock()
	ent, ok := chatStreamCancels[streamID]
	if !ok {
		return nil, false
	}
	if ent.workspaceID != workspaceID {
		return nil, false
	}
	delete(chatStreamCancels, streamID)
	return ent.cancel, true
}

// ── Routes ────────────────────────────────────────────────────────────────────

func RegisterChatRoutes(r chi.Router, s *Store) {
	r.Route("/workspaces/{workspaceId}/messages", func(r chi.Router) {
		r.Get("/", listWorkspaceMessages(s))
		r.Post("/", postWorkspaceMessage(s))
		r.Post("/cancel", postCancelWorkspaceChatStream(s))
		r.Post("/plan", postWorkspacePlan(s))
	})
}

// RegisterAssistantToolRoutes registers planning-assistant tool HTTP endpoints.
// No JWT and no secret token — only workspace id + (for propose_*) active stream id.
func RegisterAssistantToolRoutes(r chi.Router, s *Store) {
	r.Route("/workspaces/{workspaceId}/assistant-tools", func(r chi.Router) {
		r.Get("/issues", assistantToolListIssues(s))
		r.Post("/issues", assistantToolCreateIssue(s))
		r.Patch("/issues/{issueId}/assign", assistantToolAssignIssue(s))
		r.Patch("/issues/{issueId}/status", assistantToolUpdateIssueStatus(s))
		r.Get("/agents", assistantToolListAgents(s))
		r.Route("/streams/{streamId}", func(r chi.Router) {
			r.Post("/propose_issues", assistantToolProposeIssues(s))
			r.Post("/propose_tasks", assistantToolProposeTasks(s))
		})
	})
}

// ── Message list ──────────────────────────────────────────────────────────────

func listWorkspaceMessages(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		if wsID == "" {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}
		limit := int64(50)
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
				limit = int64(n)
			}
		}
		offset := int64(0)
		if v := r.URL.Query().Get("offset"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n >= 0 {
				offset = int64(n)
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
	Role    string `json:"role"` // "user" | "assistant"
	Content string `json:"content"`
}

type postMessageRequest struct {
	Content              string       `json:"content"`
	RespondWithAssistant *bool        `json:"respond_with_assistant"`
	History              []historyMsg `json:"history,omitempty"`
	// "plan" = orchestrator (propose_tasks); "execute" or omitted = classic planning assistant (propose_issues).
	Mode *string `json:"mode,omitempty"`
	// Optional workspace agent id — selects which local CLI (claude / codex / opencode) runs the chat on the server.
	// When omitted, default discovery order applies (Claude first).
	AgentID *string `json:"agent_id,omitempty"`
	// Optional model id for this assistant turn (overrides the agent row when non-empty).
	Model *string `json:"model,omitempty"`
}

func postWorkspaceMessage(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		if wsID == "" {
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
		if authorID == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		userMsg, err := s.Q.CreateWorkspaceMessage(r.Context(), db.CreateWorkspaceMessageParams{
			ID:          uuid.New().String(),
			WorkspaceID: wsID,
			AuthorType:  "user",
			AuthorID:    sql.NullString{String: authorID, Valid: true},
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
		mode := ""
		if req.Mode != nil {
			mode = strings.TrimSpace(*req.Mode)
		}
		chatAgentID := ""
		if req.AgentID != nil {
			chatAgentID = strings.TrimSpace(*req.AgentID)
		}
		modelOverride := ""
		if req.Model != nil {
			modelOverride = strings.TrimSpace(*req.Model)
		}
		runCtx, cancelRun := context.WithCancel(context.Background())
		registerChatStreamCancel(streamID, wsID, cancelRun)
		go func() {
			defer unregisterChatStreamCancel(streamID)
			runWorkspaceAssistant(runCtx, s, ws, userMsg, streamID, req.History, mode, chatAgentID, modelOverride)
		}()

		writeJSON(w, map[string]any{
			"message":   workspaceMessageJSON(userMsg),
			"stream_id": streamID,
		})
	}
}

type postCancelChatRequest struct {
	StreamID string `json:"stream_id"`
}

func postCancelWorkspaceChatStream(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		if wsID == "" {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}
		var req postCancelChatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.StreamID) == "" {
			http.Error(w, "stream_id is required", http.StatusBadRequest)
			return
		}
		userID := appMiddleware.GetUserID(r)
		if userID == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		cancel, ok := takeChatStreamCancel(strings.TrimSpace(req.StreamID), wsID)
		if !ok {
			writeJSON(w, map[string]any{"ok": false, "reason": "not_found"})
			return
		}
		cancel()
		writeJSON(w, map[string]any{"ok": true})
	}
}

func workspaceMessageJSON(m db.WorkspaceMessage) map[string]any {
	out := map[string]any{
		"id":           formatUUID(m.ID),
		"workspace_id": formatUUID(m.WorkspaceID),
		"author_type":  m.AuthorType,
		"content":      m.Content,
		"created_at":   m.CreatedAt,
	}
	if m.AuthorID.Valid {
		out["author_id"] = formatUUID(m.AuthorID.String)
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

func runWorkspaceAssistant(ctx context.Context, s *Store, ws db.Workspace, userMsg db.WorkspaceMessage, streamID string, history []historyMsg, mode string, chatAgentID string, modelOverride string) {
	preferProvider, preferModel := resolveChatToolPreference(ctx, s, ws.ID, chatAgentID)
	if mo := strings.TrimSpace(modelOverride); mo != "" {
		preferModel = mo
	}
	tool, path := pickChatAgentPreferring(ctx, preferProvider)
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
	if ws.WorkingDirectory.Valid {
		cwd = strings.TrimSpace(ws.WorkingDirectory.String)
		if strings.HasPrefix(cwd, "~/") {
			if home, err := os.UserHomeDir(); err == nil {
				cwd = filepath.Join(home, strings.TrimPrefix(cwd, "~/"))
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
		if iss.Description.Valid {
			desc = " — " + iss.Description.String
		}
		num := ""
		if iss.Number.Valid {
			num = fmt.Sprintf("#%d ", iss.Number.Int64)
		}
		issuesCtx.WriteString(fmt.Sprintf("  %s[%s] %s (%s)%s\n", num, iss.Status, iss.Title, iss.Priority, desc))
	}

	var agentsCtx strings.Builder
	if len(agents) == 0 {
		agentsCtx.WriteString("  (no agent rows in workspace)\n")
	}
	for _, ag := range agents {
		daemonOnline := "no"
		if rt, err := s.Q.GetAgentRuntimeByAgentAndWorkspace(ctx, db.GetAgentRuntimeByAgentAndWorkspaceParams{
			AgentID:     ag.ID,
			WorkspaceID: ws.ID,
		}); err == nil && rt.Status == "online" {
			daemonOnline = "yes"
		}
		agentsCtx.WriteString(fmt.Sprintf(
			"  id=%s  name=%q  agent_row_status=%s  daemon_online=%s  (assign tasks ONLY to ids with daemon_online=yes)\n",
			formatUUID(ag.ID), ag.Name, ag.Status, daemonOnline,
		))
	}

	registerAssistantToolSession(streamID, ws.ID, s)
	defer unregisterAssistantToolSession(streamID)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	wsPath := formatUUID(ws.ID)
	toolsBase := fmt.Sprintf("http://localhost:%s/api/workspaces/%s/assistant-tools", port, wsPath)
	streamRoot := fmt.Sprintf("http://localhost:%s/api/workspaces/%s/assistant-tools/streams/%s", port, wsPath, streamID)

	var systemPrompt string
	if mode == "plan" {
		systemPrompt = fmt.Sprintf(`You are the ORCHESTRATOR for workspace %q. Your job is to decompose goals into isolated tasks, assign each task to a specific connected agent, and surface the plan for user review before work is queued.

## Behaviour rules
1. ALWAYS reply with natural language first — explain decomposition, agent choice, and dependencies.
2. Keep replies concise; markdown lists are fine.
3. Do NOT silently run tools without stating in plain text what you will call and why.
4. Each task MUST have a unique "local_id" (short string, e.g. t1, t2). Use "depends_on" as an array of local_ids that must finish before this task runs (optional; prefer parallel work when safe).
5. Each task MUST set "agent_id" to a real agent id from the Connected agents list below where daemon_online=yes. Never assign agent_id for a row with daemon_online=no — those daemons are not connected and will never execute queued work.
6. When the plan is concrete, call propose_tasks ONCE so the user can review and enqueue. Do not use propose_issues unless the user explicitly asks for the older "issues card" format.

## Current backlog
%s
## Connected agents (use agent_id only where daemon_online=yes)
%s
## Tools (curl — no authentication; native app endpoints)

List agents (JSON includes runtime_online — only use agent ids where runtime_online is true in propose_tasks):
  curl -s '%s/agents'

Propose orchestrated tasks for user review (primary — call when plan is ready):
  curl -s -X POST '%s/propose_tasks' \
    -H 'Content-Type: application/json' \
    -d '[{"local_id":"t1","title":"…","description":"…","priority":"medium","agent_id":"<uuid>","depends_on":[]},…]'
  (priority: no_priority | low | medium | high | urgent)
  (depends_on: array of local_id strings, may be empty)

List issues:
  curl -s '%s/issues'

Legacy — propose issues for the old card (only if user asks):
  curl -s -X POST '%s/propose_issues' \
    -H 'Content-Type: application/json' \
    -d '[{"title":"…","description":"…","priority":"medium","suggested_assignee":"agent"},…]'

Create an issue directly (only if user explicitly asks):
  curl -s -X POST '%s/issues' \
    -H 'Content-Type: application/json' \
    -d '{"title":"…","description":"…","priority":"medium","status":"backlog","assignee_type":"agent","agent_id":"…"}'

Assign an issue to an agent:
  curl -s -X PATCH '%s/issues/{issue_id}/assign' \
    -H 'Content-Type: application/json' \
    -d '{"agent_id":"…"}'

Set issue status (e.g. todo, in_progress):
  curl -s -X PATCH '%s/issues/{issue_id}/status' \
    -H 'Content-Type: application/json' \
    -d '{"status":"todo"}'`,
			ws.Name,
			issuesCtx.String(),
			agentsCtx.String(),
			toolsBase, streamRoot, toolsBase, streamRoot, toolsBase, toolsBase, toolsBase,
		)
	} else {
		systemPrompt = fmt.Sprintf(`You are a conversational planning assistant for the software workspace %q.

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
## Available workspace tools (curl — no authentication; native app endpoints)

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

Set issue status (e.g. todo, in_progress):
  curl -s -X PATCH '%s/issues/{issue_id}/status' \
    -H 'Content-Type: application/json' \
    -d '{"status":"todo"}'

List agents (to get IDs for assignment):
  curl -s '%s/agents'`,
			ws.Name,
			issuesCtx.String(),
			agentsCtx.String(),
			toolsBase, streamRoot, toolsBase, toolsBase, toolsBase, toolsBase,
		)
	}

	execCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()

	opts := agentpkg.ExecOptions{
		Cwd:          cwd,
		Model:        preferModel,
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
	saveCtx, saveCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer saveCancel()
	assistantMsg, err := s.Q.CreateWorkspaceMessage(saveCtx, db.CreateWorkspaceMessageParams{
		ID:          uuid.New().String(),
		WorkspaceID: ws.ID,
		AuthorType:  "assistant",
		AuthorID:    sql.NullString{},
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
	return pickChatAgentPreferring(ctx, "")
}

// pickChatAgentPreferring returns the detected tool for preferProvider when available (e.g. "opencode"),
// otherwise falls back to the same order as pickChatAgent (Claude → Codex → OpenCode).
func pickChatAgentPreferring(ctx context.Context, preferProvider string) (agentpkg.DetectedTool, string) {
	preferProvider = strings.TrimSpace(strings.ToLower(preferProvider))
	tools := agentpkg.DetectAll(ctx, nil)
	if preferProvider != "" {
		for _, t := range tools {
			if t.Provider == preferProvider && t.Available && t.Path != "" {
				return t, t.Path
			}
		}
	}
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

// resolveChatToolPreference maps a workspace agent row to a CLI provider name and optional model for ExecOptions.
func resolveChatToolPreference(ctx context.Context, s *Store, wsID string, agentIDStr string) (provider string, model string) {
	if strings.TrimSpace(agentIDStr) == "" {
		return "", ""
	}
	aid := parseUUID(strings.TrimSpace(agentIDStr))
	if aid == "" {
		return "", ""
	}
	ag, err := s.Q.GetAgent(ctx, aid)
	if err != nil {
		return "", ""
	}
	if ag.WorkspaceID != wsID {
		return "", ""
	}
	if ag.Model.Valid {
		model = strings.TrimSpace(ag.Model.String)
	}
	if rt, err := s.Q.GetAgentRuntimeByAgentAndWorkspace(ctx, db.GetAgentRuntimeByAgentAndWorkspaceParams{
		AgentID:     aid,
		WorkspaceID: wsID,
	}); err == nil {
		p := strings.TrimSpace(strings.ToLower(rt.Provider))
		if p != "" {
			return normalizeAgentProvider(p), model
		}
	}
	return inferProviderFromAgentName(ag.Name), model
}

func normalizeAgentProvider(p string) string {
	for _, k := range []string{"claude", "opencode", "codex"} {
		if p == k || strings.Contains(p, k) {
			return k
		}
	}
	return ""
}

func inferProviderFromAgentName(name string) string {
	n := strings.ToLower(name)
	if strings.Contains(n, "opencode") {
		return "opencode"
	}
	if strings.Contains(n, "codex") {
		return "codex"
	}
	if strings.Contains(n, "claude") {
		return "claude"
	}
	return ""
}

// ── Plan endpoint ─────────────────────────────────────────────────────────────

type proposedIssue struct {
	Title             string  `json:"title"`
	Description       *string `json:"description"`
	Priority          string  `json:"priority"`
	SuggestedAssignee string  `json:"suggested_assignee"` // "agent" | "member"
}

type proposedOrchestratorTask struct {
	LocalID     string   `json:"local_id"`
	Title       string   `json:"title"`
	Description *string  `json:"description"`
	Priority    string   `json:"priority"`
	AgentID     *string  `json:"agent_id"`
	DependsOn   []string `json:"depends_on"`
}

type postPlanRequest struct {
	Goal string `json:"goal"`
}

func postWorkspacePlan(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		if wsID == "" {
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
		if ws.WorkingDirectory.Valid {
			cwd = strings.TrimSpace(ws.WorkingDirectory.String)
			if strings.HasPrefix(cwd, "~/") {
				if home, err := os.UserHomeDir(); err == nil {
					cwd = filepath.Join(home, strings.TrimPrefix(cwd, "~/"))
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

// ── Assistant tool HTTP handlers (workspace + optional stream in path) ───────

func assistantWorkspaceIDFromRequest(r *http.Request) (string, bool) {
	wsID := parseUUID(chi.URLParam(r, "workspaceId"))
	return wsID, wsID != ""
}

func assistantStreamSessionFromRequest(r *http.Request, s *Store) (assistantToolSession, bool) {
	streamID := strings.TrimSpace(chi.URLParam(r, "streamId"))
	if streamID == "" {
		return assistantToolSession{}, false
	}
	sess, ok := lookupAssistantToolSession(streamID)
	if !ok {
		return assistantToolSession{}, false
	}
	wsID := parseUUID(chi.URLParam(r, "workspaceId"))
	if wsID == "" || sess.workspaceID != wsID {
		return assistantToolSession{}, false
	}
	if sess.store != s {
		return assistantToolSession{}, false
	}
	return sess, true
}

func assistantToolListIssues(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID, ok := assistantWorkspaceIDFromRequest(r)
		if !ok {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}
		issues, err := s.Q.ListIssues(r.Context(), wsID)
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
			if iss.AssigneeType.Valid {
				assignee = iss.AssigneeType.String
				if iss.AssigneeType.String == "agent" && iss.AgentAssigneeID.Valid {
					assignee = "agent:" + iss.AgentAssigneeID.String
				}
			}
			var numPtr *int32
			if iss.Number.Valid {
				n := int32(iss.Number.Int64)
				numPtr = &n
			}
			var descPtr *string
			if iss.Description.Valid {
				d := iss.Description.String
				descPtr = &d
			}
			out = append(out, issueOut{
				ID:          iss.ID,
				Number:      numPtr,
				Title:       iss.Title,
				Description: descPtr,
				Status:      iss.Status,
				Priority:    iss.Priority,
				Assignee:    assignee,
			})
		}
		writeJSON(w, out)
	}
}

func assistantToolCreateIssue(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID, ok := assistantWorkspaceIDFromRequest(r)
		if !ok {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
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

		num, err := s.Q.NextIssueNumber(r.Context(), wsID)
		if err != nil {
			num = 1
		}

		assigneeNS := sql.NullString{}
		if strings.TrimSpace(req.AssigneeType) != "" {
			assigneeNS = sql.NullString{String: strings.TrimSpace(req.AssigneeType), Valid: true}
		}
		descNS := sql.NullString{}
		if req.Description != nil && strings.TrimSpace(*req.Description) != "" {
			descNS = sql.NullString{String: strings.TrimSpace(*req.Description), Valid: true}
		}
		agentNS := sql.NullString{}
		if aid := strings.TrimSpace(req.AgentID); aid != "" {
			if p := parseUUID(aid); p != "" {
				agentNS = sql.NullString{String: p, Valid: true}
			}
		}

		const guestUserID = "00000000-0000-4000-8000-000000000001"
		iss, err := s.Q.CreateIssue(r.Context(), db.CreateIssueParams{
			ID:              uuid.New().String(),
			WorkspaceID:     wsID,
			Number:          sql.NullInt64{Int64: num, Valid: true},
			Title:           strings.TrimSpace(req.Title),
			Description:     descNS,
			Status:          req.Status,
			Priority:        req.Priority,
			AssigneeType:    assigneeNS,
			AgentAssigneeID: agentNS,
			UserAssigneeID:  sql.NullString{},
			CreatedByID:     guestUserID,
			WorkspaceID_2:   wsID,
		})
		if err != nil {
			http.Error(w, "create failed: "+err.Error(), http.StatusInternalServerError)
			return
		}

		broadcastEvent("issue:created", map[string]any{
			"workspace_id": formatUUID(wsID),
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
}

func assistantToolAssignIssue(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID, ok := assistantWorkspaceIDFromRequest(r)
		if !ok {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}

		issueID := parseUUID(chi.URLParam(r, "issueId"))
		if issueID == "" {
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
		if agentID == "" {
			http.Error(w, "invalid agent_id", http.StatusBadRequest)
			return
		}

		_, err := s.Q.UpdateIssue(r.Context(), db.UpdateIssueParams{
			ID:              issueID,
			Title:           sql.NullString{},
			Description:     sql.NullString{},
			Status:          sql.NullString{},
			Priority:        sql.NullString{},
			AssigneeType:    sql.NullString{String: "agent", Valid: true},
			AgentAssigneeID: sql.NullString{String: agentID, Valid: true},
			UserAssigneeID:  sql.NullString{},
			Position:        sql.NullFloat64{},
		})
		if err != nil {
			http.Error(w, "update failed: "+err.Error(), http.StatusInternalServerError)
			return
		}

		broadcastEvent("issue:updated", map[string]any{
			"workspace_id": formatUUID(wsID),
			"issue_id":     formatUUID(issueID),
		})

		writeJSON(w, map[string]any{"ok": true})
	}
}

func assistantToolUpdateIssueStatus(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID, ok := assistantWorkspaceIDFromRequest(r)
		if !ok {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}

		issueID := parseUUID(chi.URLParam(r, "issueId"))
		if issueID == "" {
			http.Error(w, "invalid issue id", http.StatusBadRequest)
			return
		}

		var req struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Status) == "" {
			http.Error(w, "status is required", http.StatusBadRequest)
			return
		}

		iss, err := s.Q.GetIssue(r.Context(), issueID)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if iss.WorkspaceID != wsID {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		updated, err := s.Q.UpdateIssueStatus(r.Context(), db.UpdateIssueStatusParams{
			ID:     issueID,
			Status: strings.TrimSpace(req.Status),
		})
		if err != nil {
			http.Error(w, "update failed: "+err.Error(), http.StatusInternalServerError)
			return
		}

		broadcastEvent("issue:updated", updated)

		writeJSON(w, map[string]any{"ok": true, "status": updated.Status})
	}
}

func assistantToolProposeIssues(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sess, ok := assistantStreamSessionFromRequest(r, s)
		if !ok {
			http.Error(w, "unknown or ended chat stream", http.StatusNotFound)
			return
		}

		var issues []proposedIssue
		if err := json.NewDecoder(r.Body).Decode(&issues); err != nil || len(issues) == 0 {
			http.Error(w, "expected non-empty JSON array of issues", http.StatusBadRequest)
			return
		}

		broadcastEvent("chat:stream", map[string]any{
			"workspace_id": formatUUID(sess.workspaceID),
			"stream_id":    sess.streamID,
			"kind":         "plan_proposal",
			"issues":       issues,
		})

		writeJSON(w, map[string]any{"ok": true, "count": len(issues)})
	}
}

func assistantToolProposeTasks(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sess, ok := assistantStreamSessionFromRequest(r, s)
		if !ok {
			http.Error(w, "unknown or ended chat stream", http.StatusNotFound)
			return
		}

		var tasks []proposedOrchestratorTask
		if err := json.NewDecoder(r.Body).Decode(&tasks); err != nil || len(tasks) == 0 {
			http.Error(w, "expected non-empty JSON array of tasks", http.StatusBadRequest)
			return
		}

		broadcastEvent("chat:stream", map[string]any{
			"workspace_id": formatUUID(sess.workspaceID),
			"stream_id":    sess.streamID,
			"kind":         "orchestrator_proposal",
			"tasks":        tasks,
		})

		writeJSON(w, map[string]any{"ok": true, "count": len(tasks)})
	}
}

func assistantToolListAgents(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID, ok := assistantWorkspaceIDFromRequest(r)
		if !ok {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}

		agents, err := s.Q.ListAgents(r.Context(), wsID)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		type agentOut struct {
			ID             string `json:"id"`
			Name           string `json:"name"`
			Status         string `json:"status"`
			Model          string `json:"model,omitempty"`
			RuntimeOnline  bool   `json:"runtime_online"`
		}
		out := make([]agentOut, 0, len(agents))
		for _, ag := range agents {
			model := ""
			if ag.Model.Valid {
				model = ag.Model.String
			}
			online := false
			if rt, err := s.Q.GetAgentRuntimeByAgentAndWorkspace(r.Context(), db.GetAgentRuntimeByAgentAndWorkspaceParams{
				AgentID:     ag.ID,
				WorkspaceID: wsID,
			}); err == nil && rt.Status == "online" {
				online = true
			}
			out = append(out, agentOut{
				ID:            formatUUID(ag.ID),
				Name:          ag.Name,
				Status:        string(ag.Status),
				Model:         model,
				RuntimeOnline: online,
			})
		}
		writeJSON(w, out)
	}
}
