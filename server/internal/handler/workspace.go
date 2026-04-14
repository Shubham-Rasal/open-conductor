package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	db "github.com/Shubham-Rasal/open-conductor/server/pkg/db/generated"
)

func RegisterWorkspaceRoutes(r chi.Router, s *Store) {
	r.Get("/workspaces", listWorkspaces(s))
	r.Post("/workspaces", createWorkspace(s))
	r.Get("/workspaces/{workspaceId}", getWorkspace(s))
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
	Name   string `json:"name"`
	Slug   string `json:"slug"`
	Prefix string `json:"prefix"`
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
			prefix = "OC"
		}
		slug := req.Slug
		if slug == "" {
			slug = req.Name
		}

		ws, err := s.Q.CreateWorkspace(r.Context(), db.CreateWorkspaceParams{
			Name:   req.Name,
			Slug:   slug,
			Prefix: prefix,
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
