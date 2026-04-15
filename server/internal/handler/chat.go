package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	appMiddleware "github.com/Shubham-Rasal/open-conductor/server/internal/middleware"
	agentpkg "github.com/Shubham-Rasal/open-conductor/server/pkg/agent"
	db "github.com/Shubham-Rasal/open-conductor/server/pkg/db/generated"
)

func RegisterChatRoutes(r chi.Router, s *Store) {
	r.Route("/workspaces/{workspaceId}/messages", func(r chi.Router) {
		r.Get("/", listWorkspaceMessages(s))
		r.Post("/", postWorkspaceMessage(s))
		r.Post("/plan", postWorkspacePlan(s))
	})
}

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

type postMessageRequest struct {
	Content               string `json:"content"`
	RespondWithAssistant  *bool  `json:"respond_with_assistant"`
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
		go runWorkspaceAssistant(context.Background(), s, ws, userMsg, streamID)

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

func runWorkspaceAssistant(ctx context.Context, s *Store, ws db.Workspace, userMsg db.WorkspaceMessage, streamID string) {
	tool, path := pickChatAgent(ctx)
	if path == "" {
		slog.Warn("workspace chat: no agent CLI found")
		broadcastEvent("chat:stream", map[string]any{
			"workspace_id": formatUUID(ws.ID),
			"stream_id":    streamID,
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

	prompt := "You are a planning assistant for a software workspace. The user message follows. Reply concisely with actionable next steps and suggested issue titles (bullet list).\n\nUser:\n" + userMsg.Content

	execCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()

	opts := agentpkg.ExecOptions{
		Cwd:      cwd,
		Timeout:  10 * time.Minute,
		MaxTurns: 8,
	}
	session, err := backend.Execute(execCtx, prompt, opts)
	if err != nil {
		broadcastEvent("chat:stream", map[string]any{
			"workspace_id": formatUUID(ws.ID),
			"stream_id":    streamID,
			"delta":        err.Error(),
			"done":         true,
		})
		return
	}

	var full strings.Builder
	for msg := range session.Messages {
		if msg.Type == agentpkg.MessageText && msg.Content != "" {
			full.WriteString(msg.Content)
			broadcastEvent("chat:stream", map[string]any{
				"workspace_id": formatUUID(ws.ID),
				"stream_id":    streamID,
				"delta":        msg.Content,
				"done":         false,
			})
		}
	}
	res := <-session.Result
	text := full.String()
	if res.Output != "" && text == "" {
		text = res.Output
	}
	if res.Error != "" && text == "" {
		text = res.Error
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

type proposedIssue struct {
	Title            string  `json:"title"`
	Description      *string `json:"description"`
	Priority         string  `json:"priority"`
	SuggestedAssignee string `json:"suggested_assignee"` // "agent" | "member"
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
		// Strip markdown code fences if present
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
