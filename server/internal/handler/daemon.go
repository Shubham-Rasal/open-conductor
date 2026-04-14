package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Shubham-Rasal/open-conductor/server/internal/runner"
	db "github.com/Shubham-Rasal/open-conductor/server/pkg/db/generated"
)

func RegisterDaemonRoutes(r chi.Router, s *Store) {
	r.Route("/daemon", func(r chi.Router) {
		r.Post("/register", daemonRegister(s))
		r.Post("/heartbeat", daemonHeartbeat(s))
		r.Route("/runtimes/{runtimeId}/tasks", func(r chi.Router) {
			r.Post("/claim", claimTask(s))
		})
		r.Route("/tasks/{taskId}", func(r chi.Router) {
			r.Post("/start", startTask(s))
			r.Post("/complete", completeTask(s))
			r.Post("/fail", failTask(s))
			r.Post("/cancel", cancelTask(s))
			r.Post("/messages", reportMessages())
			r.Post("/progress", reportProgress())
		})
	})
}

// ─── Register ──────────────────────────────────────────────────────────────

type daemonRegisterRequest struct {
	AgentID      string  `json:"agent_id"`
	Provider     string  `json:"provider"`
	DeviceName   string  `json:"device_name"`
	DefaultModel *string `json:"default_model"` // suggested model for this provider
}

func daemonRegister(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req daemonRegisterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AgentID == "" {
			http.Error(w, "agent_id required", http.StatusBadRequest)
			return
		}

		agentID := parseUUID(req.AgentID)
		if !agentID.Valid {
			http.Error(w, "invalid agent_id", http.StatusBadRequest)
			return
		}

		provider := req.Provider
		if provider == "" {
			provider = "claude"
		}
		deviceName := req.DeviceName
		var deviceNamePtr *string
		if deviceName != "" {
			deviceNamePtr = &deviceName
		}

		runtime, err := startDaemonForAgent(r.Context(), s, agentID, provider, deviceNamePtr, req.DefaultModel)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		writeJSON(w, runtime)
	}
}

// startDaemonForAgent upserts the runtime row, sets agent idle, applies optional model, and starts the runner.
func startDaemonForAgent(ctx context.Context, s *Store, agentID pgtype.UUID, provider string, deviceName *string, defaultModel *string) (db.AgentRuntime, error) {
	if provider == "" {
		provider = "claude"
	}
	dn := deviceName
	if dn == nil || (dn != nil && *dn == "") {
		h, _ := os.Hostname()
		dn = &h
	}
	runtime, err := s.Q.UpsertAgentRuntime(ctx, db.UpsertAgentRuntimeParams{
		AgentID:    agentID,
		Provider:   provider,
		DeviceName: dn,
	})
	if err != nil {
		return db.AgentRuntime{}, err
	}
	_ = s.Q.UpdateAgentStatusOnly(ctx, db.UpdateAgentStatusOnlyParams{
		ID:     agentID,
		Status: "idle",
	})
	if defaultModel != nil && *defaultModel != "" {
		_ = s.Q.SetAgentModel(ctx, db.SetAgentModelParams{
			ID:    agentID,
			Model: defaultModel,
		})
	}
	runner.Global.Start(ctx, s.Q, agentID, provider, Broadcast)
	return runtime, nil
}

// ─── Heartbeat ─────────────────────────────────────────────────────────────

func daemonHeartbeat(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			AgentID string `json:"agent_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.AgentID == "" {
			http.Error(w, "agent_id required", http.StatusBadRequest)
			return
		}

		agentID := parseUUID(body.AgentID)
		if !agentID.Valid {
			http.Error(w, "invalid agent_id", http.StatusBadRequest)
			return
		}

		if err := s.Q.UpdateAgentRuntimeHeartbeat(r.Context(), agentID); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		writeJSON(w, map[string]string{"status": "ok"})
	}
}

// ─── Task lifecycle ─────────────────────────────────────────────────────────

type claimTaskResponse struct {
	Task         *db.AgentTaskQueue `json:"task"`
	AgentName    string             `json:"agent_name,omitempty"`
	Instructions string             `json:"instructions,omitempty"`
}

func claimTask(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			AgentID string `json:"agent_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.AgentID == "" {
			http.Error(w, "agent_id required", http.StatusBadRequest)
			return
		}

		agentID := parseUUID(body.AgentID)
		task, err := s.Q.ClaimAgentTask(r.Context(), agentID)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(nil)
			return
		}

		agent, _ := s.Q.GetAgent(r.Context(), agentID)
		writeJSON(w, claimTaskResponse{
			Task:         &task,
			AgentName:    agent.Name,
			Instructions: agent.Instructions,
		})
	}
}

func startTask(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "taskId"))
		task, err := s.Q.StartTask(r.Context(), id)
		if err != nil {
			http.Error(w, "not found or invalid state", http.StatusBadRequest)
			return
		}
		writeJSON(w, task)
	}
}

type completeTaskRequest struct {
	Output     string `json:"output"`
	SessionID  string `json:"session_id"`
	WorkDir    string `json:"work_dir"`
	BranchName string `json:"branch_name"`
}

func completeTask(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "taskId"))

		var req completeTaskRequest
		_ = json.NewDecoder(r.Body).Decode(&req)

		task, err := s.Q.CompleteTask(r.Context(), db.CompleteTaskParams{
			ID:         id,
			Output:     &req.Output,
			SessionID:  &req.SessionID,
			WorkDir:    &req.WorkDir,
			BranchName: &req.BranchName,
		})
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		broadcastEvent("task:completed", task)
		writeJSON(w, task)
	}
}

func failTask(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "taskId"))

		var body struct {
			Error string `json:"error"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		task, err := s.Q.FailTask(r.Context(), db.FailTaskParams{
			ID:           id,
			ErrorMessage: &body.Error,
		})
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		broadcastEvent("task:failed", task)
		writeJSON(w, task)
	}
}

func cancelTask(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "taskId"))
		task, err := s.Q.CancelTask(r.Context(), id)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, task)
	}
}

func reportMessages() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}
}

func reportProgress() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}
}
