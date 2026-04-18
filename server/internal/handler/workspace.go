package handler

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"

	db "github.com/Shubham-Rasal/open-conductor/server/pkg/db/generated"
)

var nonAlpha = regexp.MustCompile(`[^a-zA-Z]`)
var workspaceSlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// generateIssuePrefix produces a 2–3 char uppercase prefix from a workspace name.
func generateIssuePrefix(name string) string {
	letters := nonAlpha.ReplaceAllString(name, "")
	if len(letters) == 0 {
		return "WS"
	}
	letters = strings.ToUpper(letters)
	if len(letters) > 3 {
		letters = letters[:3]
	}
	return letters
}

func RegisterWorkspaceRoutes(r chi.Router, s *Store) {
	r.Get("/workspaces", listWorkspaces(s))
	r.Post("/workspaces", createWorkspace(s))
	r.Get("/workspaces/{workspaceId}", getWorkspace(s))
	r.Get("/workspaces/{workspaceId}/members", listWorkspaceMembers(s))
	r.Patch("/workspaces/{workspaceId}", patchWorkspace(s))
	r.Delete("/workspaces/{workspaceId}", deleteWorkspace(s))
	r.Get("/workspaces/{workspaceId}/env-vars", listEnvVars(s))
	r.Put("/workspaces/{workspaceId}/env-vars", upsertEnvVar(s))
	r.Delete("/workspaces/{workspaceId}/env-vars/{key}", deleteEnvVar(s))
}

func listWorkspaceMembers(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "workspaceId"))
		if !id.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}
		rows, err := s.Q.ListWorkspaceMembersWithUsers(r.Context(), id)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"members": rows})
	}
}

func listWorkspaces(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		workspaces, err := s.Q.ListWorkspaces(r.Context())
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"workspaces": workspaces})
	}
}

type createWorkspaceRequest struct {
	Name               string  `json:"name"`
	Slug               string  `json:"slug"`
	Prefix             string  `json:"prefix"`
	Description        *string `json:"description"`
	Type               string  `json:"type"`
	ConnectionURL      *string `json:"connection_url"`
	WorkingDirectory   *string `json:"working_directory"`
}

func createWorkspace(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req createWorkspaceRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}

		prefix := req.Prefix
		if prefix == "" {
			prefix = generateIssuePrefix(req.Name)
		}
		slug := strings.ToLower(strings.TrimSpace(req.Slug))
		if slug == "" {
			slug = strings.ToLower(strings.TrimSpace(req.Name))
		}
		slug = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(slug, "-")
		slug = strings.Trim(slug, "-")
		if slug == "" || !workspaceSlugPattern.MatchString(slug) {
			http.Error(w, "invalid slug: use lowercase letters, numbers, and hyphens", http.StatusBadRequest)
			return
		}

		wsType := strings.TrimSpace(req.Type)
		if wsType == "" {
			wsType = "local"
		}
		if wsType != "local" && wsType != "remote" {
			http.Error(w, "type must be local or remote", http.StatusBadRequest)
			return
		}

		ws, err := s.Q.CreateWorkspace(r.Context(), db.CreateWorkspaceParams{
			Name:               req.Name,
			Slug:               slug,
			Prefix:             prefix,
			Description:        req.Description,
			Type:               wsType,
			ConnectionUrl:      req.ConnectionURL,
			WorkingDirectory:   req.WorkingDirectory,
		})
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(ws)
	}
}

func getWorkspace(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "workspaceId"))
		if !id.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}

		ws, err := s.Q.GetWorkspace(r.Context(), id)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		writeJSON(w, ws)
	}
}

type patchWorkspaceRequest struct {
	Name               *string `json:"name"`
	Description        *string `json:"description"`
	Prefix             *string `json:"prefix"`
	Type               *string `json:"type"`
	ConnectionURL      *string `json:"connection_url"`
	WorkingDirectory   *string `json:"working_directory"`
}

func patchWorkspace(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "workspaceId"))
		if !id.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}

		var req patchWorkspaceRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}

		if req.Type != nil {
			t := strings.TrimSpace(*req.Type)
			if t != "" && t != "local" && t != "remote" {
				http.Error(w, "type must be local or remote", http.StatusBadRequest)
				return
			}
		}

		ws, err := s.Q.UpdateWorkspace(r.Context(), db.UpdateWorkspaceParams{
			ID:                 id,
			Name:               req.Name,
			Description:        req.Description,
			Prefix:             req.Prefix,
			Type:               req.Type,
			ConnectionUrl:      req.ConnectionURL,
			WorkingDirectory:   req.WorkingDirectory,
		})
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		writeJSON(w, ws)
	}
}

func listEnvVars(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "workspaceId"))
		if !id.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}
		vars, err := s.Q.ListWorkspaceEnvVars(r.Context(), id)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"env_vars": vars})
	}
}

type upsertEnvVarRequest struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

func upsertEnvVar(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "workspaceId"))
		if !id.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}
		var req upsertEnvVarRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Key == "" {
			http.Error(w, "key is required", http.StatusBadRequest)
			return
		}
		v, err := s.Q.UpsertWorkspaceEnvVar(r.Context(), db.UpsertWorkspaceEnvVarParams{
			WorkspaceID: id,
			Key:         req.Key,
			Value:       req.Value,
		})
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, v)
	}
}

func deleteEnvVar(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "workspaceId"))
		key := chi.URLParam(r, "key")
		if !id.Valid || key == "" {
			http.Error(w, "invalid params", http.StatusBadRequest)
			return
		}
		if err := s.Q.DeleteWorkspaceEnvVar(r.Context(), db.DeleteWorkspaceEnvVarParams{
			WorkspaceID: id,
			Key:         key,
		}); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	}
}

func deleteWorkspace(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "workspaceId"))
		if !id.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}

		list, err := s.Q.ListWorkspaces(r.Context())
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if len(list) <= 1 {
			http.Error(w, "cannot delete the last workspace", http.StatusBadRequest)
			return
		}

		if err := s.Q.DeleteWorkspace(r.Context(), id); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	}
}
