package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Shubham-Rasal/open-conductor/server/internal/runner"
	agentpkg "github.com/Shubham-Rasal/open-conductor/server/pkg/agent"
	db "github.com/Shubham-Rasal/open-conductor/server/pkg/db/generated"
)

func RegisterAgentRoutes(r chi.Router, s *Store) {
	r.Get("/detect-agents", detectAgents(s))
	r.Route("/workspaces/{workspaceId}/agents", func(r chi.Router) {
		r.Get("/", listAgents(s))
		r.Post("/", createAgent(s))
		r.Post("/{agentId}/disconnect", disconnectAgent(s))
		r.Post("/{agentId}/reconnect", reconnectAgent(s))
		r.Post("/{agentId}/test", testAgentIntegration(s))
		r.Get("/{agentId}", getAgent(s))
		r.Patch("/{agentId}", patchAgent(s))
	})
}

func detectAgents(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var remoteURL *string
		if wsID := strings.TrimSpace(r.URL.Query().Get("workspace_id")); wsID != "" {
			id := parseUUID(wsID)
			if id.Valid {
				if ws, err := s.Q.GetWorkspace(r.Context(), id); err == nil {
					if ws.Type == "remote" && ws.ConnectionUrl != nil && *ws.ConnectionUrl != "" {
						remoteURL = ws.ConnectionUrl
					}
				}
			}
		}
		tools := agentpkg.DetectAll(r.Context(), remoteURL)
		if tools == nil {
			tools = []agentpkg.DetectedTool{}
		}
		writeJSON(w, tools)
	}
}

func listAgents(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		if !wsID.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}

		agents, err := s.Q.ListAgents(r.Context(), wsID)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		ids := make([]pgtype.UUID, 0, len(agents))
		for _, a := range agents {
			ids = append(ids, a.ID)
		}
		runtimeMap := make(map[string]db.AgentRuntime)
		if len(ids) > 0 {
			rts, err := s.Q.ListAgentRuntimes(r.Context(), ids)
			if err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			for _, rt := range rts {
				runtimeMap[formatUUID(rt.AgentID)] = rt
			}
		}

		writeJSON(w, map[string]any{"agents": agents, "runtimes": runtimeMap})
	}
}

type createAgentRequest struct {
	Name               string  `json:"name"`
	Instructions       string  `json:"instructions"`
	MaxConcurrentTasks int32   `json:"max_concurrent_tasks"`
	Model              *string `json:"model"` // e.g. "ollama/qwen3.5:9b"
}

func createAgent(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		if !wsID.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}

		var req createAgentRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}

		maxTasks := req.MaxConcurrentTasks
		if maxTasks == 0 {
			maxTasks = 6
		}

		agent, err := s.Q.CreateAgent(r.Context(), db.CreateAgentParams{
			WorkspaceID:        wsID,
			Name:               req.Name,
			Instructions:       req.Instructions,
			MaxConcurrentTasks: maxTasks,
			Model:              req.Model,
		})
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(agent)
	}
}

func getAgent(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "agentId"))
		if !id.Valid {
			http.Error(w, "invalid agent id", http.StatusBadRequest)
			return
		}

		agent, err := s.Q.GetAgent(r.Context(), id)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		writeJSON(w, agent)
	}
}

type patchAgentRequest struct {
	Instructions *string `json:"instructions"`
}

func sameWorkspace(agentWs, ws pgtype.UUID) bool {
	return agentWs.Valid && ws.Valid && agentWs.Bytes == ws.Bytes
}

type testAgentIntegrationResponse struct {
	OK            bool   `json:"ok"`
	Message       string `json:"message"`
	RunnerActive  bool   `json:"runner_active"`
	RuntimeOnline bool   `json:"runtime_online"`
	Provider      string `json:"provider,omitempty"`
	LastSeenAt    string `json:"last_seen_at,omitempty"`
}

func testAgentIntegration(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		if !wsID.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}
		id := parseUUID(chi.URLParam(r, "agentId"))
		if !id.Valid {
			http.Error(w, "invalid agent id", http.StatusBadRequest)
			return
		}

		agent, err := s.Q.GetAgent(r.Context(), id)
		if err != nil || !sameWorkspace(agent.WorkspaceID, wsID) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		rt, rtErr := s.Q.GetAgentRuntimeByAgentAndWorkspace(r.Context(), db.GetAgentRuntimeByAgentAndWorkspaceParams{
			AgentID:     id,
			WorkspaceID: wsID,
		})
		runnerActive := rtErr == nil && rt.ID.Valid && runner.Global.IsRunning(rt.ID)
		heartbeatFresh := false
		dbSaysOnline := false
		provider := ""
		lastSeen := ""
		if rtErr == nil {
			provider = rt.Provider
			if rt.LastSeenAt.Valid {
				lastSeen = rt.LastSeenAt.Time.UTC().Format(time.RFC3339)
			}
			dbSaysOnline = rt.Status == "online"
			heartbeatFresh = dbSaysOnline &&
				(!rt.LastSeenAt.Valid || time.Since(rt.LastSeenAt.Time) <= 2*time.Minute)
		}

		// Runner is the source of truth locally: if it is running, integration works even when the
		// DB row is briefly stale (no heartbeats until recently). Heartbeats from the app refresh last_seen_at.
		ok := runnerActive && rtErr == nil
		var msg string
		switch {
		case ok && heartbeatFresh:
			msg = "Integration OK — daemon runtime is online and the task runner is active."
		case ok && !heartbeatFresh:
			msg = "Integration OK — task runner is active. Daemon DB row may refresh on the next heartbeat."
		case runnerActive && rtErr != nil:
			msg = "Task runner is active, but no daemon runtime row was found. Reconnect this agent from “Available on this machine”."
		case !runnerActive && rtErr != nil:
			msg = "No daemon registration yet. Connect an AI tool above to register this agent on this machine."
		case !runnerActive && rtErr == nil && !dbSaysOnline:
			msg = "Daemon runtime is offline or its heartbeat is stale. Reconnect the agent or restart the app."
		default:
			msg = "Task runner is not running. Try connecting this agent again from the list above."
		}

		writeJSON(w, testAgentIntegrationResponse{
			OK:            ok,
			Message:       msg,
			RunnerActive:  runnerActive,
			RuntimeOnline: rtErr == nil && heartbeatFresh,
			Provider:      provider,
			LastSeenAt:    lastSeen,
		})
	}
}

func disconnectAgent(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		id := parseUUID(chi.URLParam(r, "agentId"))
		if !wsID.Valid || !id.Valid {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		ag, err := s.Q.GetAgent(r.Context(), id)
		if err != nil || !sameWorkspace(ag.WorkspaceID, wsID) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		rt, rtErr := s.Q.GetAgentRuntimeByAgentAndWorkspace(r.Context(), db.GetAgentRuntimeByAgentAndWorkspaceParams{
			AgentID:     id,
			WorkspaceID: wsID,
		})
		_ = s.Q.CancelQueuedTasksForAgent(r.Context(), db.CancelQueuedTasksForAgentParams{
			AgentID:     id,
			WorkspaceID: wsID,
		})
		if rtErr == nil && rt.ID.Valid {
			runner.Global.Stop(rt.ID)
		}
		_ = s.Q.SetAgentRuntimeOfflineByAgent(r.Context(), db.SetAgentRuntimeOfflineByAgentParams{
			AgentID:     id,
			WorkspaceID: wsID,
		})
		_ = s.Q.UpdateAgentStatusOnly(r.Context(), db.UpdateAgentStatusOnlyParams{ID: id, Status: "offline"})
		broadcastEvent("agent:status", map[string]any{"agent_id": formatUUID(id), "status": "offline"})
		writeJSON(w, map[string]string{"status": "disconnected"})
	}
}

type reconnectAgentRequest struct {
	Provider     string  `json:"provider"`
	DefaultModel *string `json:"default_model"`
	DeviceName   *string `json:"device_name"`
}

func reconnectAgent(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		id := parseUUID(chi.URLParam(r, "agentId"))
		if !wsID.Valid || !id.Valid {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		ag, err := s.Q.GetAgent(r.Context(), id)
		if err != nil || !sameWorkspace(ag.WorkspaceID, wsID) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		var req reconnectAgentRequest
		_ = json.NewDecoder(r.Body).Decode(&req)

		provider := req.Provider
		if provider == "" {
			if rt, e := s.Q.GetAgentRuntimeByAgentAndWorkspace(r.Context(), db.GetAgentRuntimeByAgentAndWorkspaceParams{
				AgentID:     id,
				WorkspaceID: wsID,
			}); e == nil {
				provider = rt.Provider
			}
		}
		if provider == "" {
			provider = "claude"
		}

		dm := req.DefaultModel
		if (dm == nil || (dm != nil && *dm == "")) && ag.Model != nil && *ag.Model != "" {
			dm = ag.Model
		}

		runtimeRow, err := startDaemonForAgent(context.Background(), s, id, provider, req.DeviceName, dm)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		broadcastEvent("agent:status", map[string]any{"agent_id": formatUUID(id), "status": "idle"})
		writeJSON(w, runtimeRow)
	}
}

func patchAgent(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		if !wsID.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}
		id := parseUUID(chi.URLParam(r, "agentId"))
		if !id.Valid {
			http.Error(w, "invalid agent id", http.StatusBadRequest)
			return
		}

		var req patchAgentRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		if req.Instructions == nil {
			http.Error(w, "instructions is required", http.StatusBadRequest)
			return
		}

		agent, err := s.Q.UpdateAgentInstructions(r.Context(), db.UpdateAgentInstructionsParams{
			ID:           id,
			WorkspaceID:  wsID,
			Instructions: *req.Instructions,
		})
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		writeJSON(w, agent)
	}
}
