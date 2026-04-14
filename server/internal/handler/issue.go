package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	appMiddleware "github.com/Shubham-Rasal/open-conductor/server/internal/middleware"
	db "github.com/Shubham-Rasal/open-conductor/server/pkg/db/generated"
)

func RegisterIssueRoutes(r chi.Router, s *Store) {
	r.Route("/workspaces/{workspaceId}/issues", func(r chi.Router) {
		r.Get("/", listIssues(s))
		r.Post("/", createIssue(s))
		r.Get("/{issueId}", getIssue(s))
		r.Patch("/{issueId}", updateIssue(s))
		r.Delete("/{issueId}", deleteIssue(s))
		r.Get("/{issueId}/tasks", listIssueTasks(s))
	})
}

func listIssueTasks(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		issueID := parseUUID(chi.URLParam(r, "issueId"))
		if !issueID.Valid {
			http.Error(w, "invalid issue id", http.StatusBadRequest)
			return
		}
		tasks, err := s.Q.ListTasksForIssue(r.Context(), issueID)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"tasks": tasks})
	}
}

func listIssues(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		if !wsID.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}

		issues, err := s.Q.ListIssues(r.Context(), wsID)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		writeJSON(w, map[string]any{"issues": issues})
	}
}

type createIssueRequest struct {
	Title        string  `json:"title"`
	Description  *string `json:"description"`
	Status       string  `json:"status"`
	Priority     string  `json:"priority"`
	AssigneeType *string `json:"assignee_type"`
	AssigneeID   *string `json:"assignee_id"`
}

func createIssue(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsID := parseUUID(chi.URLParam(r, "workspaceId"))
		if !wsID.Valid {
			http.Error(w, "invalid workspace id", http.StatusBadRequest)
			return
		}

		var req createIssueRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Title == "" {
			http.Error(w, "title is required", http.StatusBadRequest)
			return
		}

		userID := appMiddleware.GetUserID(r)
		createdByID := parseUUID(userID)

		// Get next issue number for this workspace
		num, err := s.Q.NextIssueNumber(r.Context(), wsID)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		status := req.Status
		if status == "" {
			status = "todo"
		}
		priority := req.Priority
		if priority == "" {
			priority = "no_priority"
		}

		var assigneeID pgtype.UUID
		if req.AssigneeID != nil {
			assigneeID = parseUUID(*req.AssigneeID)
		}

		issue, err := s.Q.CreateIssue(r.Context(), db.CreateIssueParams{
			WorkspaceID:  wsID,
			Number:       &num,
			Title:        req.Title,
			Description:  req.Description,
			Status:       status,
			Priority:     priority,
			AssigneeType: req.AssigneeType,
			AssigneeID:   assigneeID,
			CreatedByID:  createdByID,
		})
		if err != nil {
			http.Error(w, fmt.Sprintf("create issue: %v", err), http.StatusInternalServerError)
			return
		}

		// Enqueue agent task if assigned to an agent
		if s.TaskService.ShouldEnqueueAgentTask(issue) {
			_ = s.TaskService.EnqueueTaskForIssue(r.Context(), issue)
		}

		broadcastEvent("issue:created", issue)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(issue)
	}
}

func getIssue(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "issueId"))
		if !id.Valid {
			http.Error(w, "invalid issue id", http.StatusBadRequest)
			return
		}

		issue, err := s.Q.GetIssue(r.Context(), id)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		writeJSON(w, issue)
	}
}

type updateIssueRequest struct {
	Title        *string `json:"title"`
	Description  *string `json:"description"`
	Status       *string `json:"status"`
	Priority     *string `json:"priority"`
	AssigneeType *string `json:"assignee_type"`
	AssigneeID   *string `json:"assignee_id"`
	Position     *float64 `json:"position"`
}

func updateIssue(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "issueId"))
		if !id.Valid {
			http.Error(w, "invalid issue id", http.StatusBadRequest)
			return
		}

		prev, err := s.Q.GetIssue(r.Context(), id)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		var req updateIssueRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		var assigneeID pgtype.UUID
		if req.AssigneeID != nil {
			assigneeID = parseUUID(*req.AssigneeID)
		} else {
			assigneeID = prev.AssigneeID
		}

		issue, err := s.Q.UpdateIssue(r.Context(), db.UpdateIssueParams{
			ID:           id,
			Title:        req.Title,
			Description:  req.Description,
			Status:       req.Status,
			Priority:     req.Priority,
			AssigneeType: req.AssigneeType,
			AssigneeID:   assigneeID,
			Position:     req.Position,
		})
		if err != nil {
			http.Error(w, fmt.Sprintf("update issue: %v", err), http.StatusInternalServerError)
			return
		}

		// If assignee changed, cancel old tasks and maybe enqueue new one
		prevAssignee := ""
		if prev.AssigneeID.Valid {
			prevAssignee = prev.AssigneeID.String()
		}
		newAssignee := ""
		if issue.AssigneeID.Valid {
			newAssignee = issue.AssigneeID.String()
		}

		if prevAssignee != newAssignee {
			_ = s.TaskService.CancelTasksForIssue(r.Context(), id)
			if s.TaskService.ShouldEnqueueAgentTask(issue) {
				_ = s.TaskService.EnqueueTaskForIssue(r.Context(), issue)
			}
		}

		broadcastEvent("issue:updated", issue)
		writeJSON(w, issue)
	}
}

func deleteIssue(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "issueId"))
		if !id.Valid {
			http.Error(w, "invalid issue id", http.StatusBadRequest)
			return
		}

		_ = s.TaskService.CancelTasksForIssue(r.Context(), id)

		if err := s.Q.DeleteIssue(r.Context(), id); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		broadcastEvent("issue:deleted", map[string]string{"id": id.String()})
		w.WriteHeader(http.StatusNoContent)
	}
}
