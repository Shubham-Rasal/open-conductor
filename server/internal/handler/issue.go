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
	Title             string  `json:"title"`
	Description       *string `json:"description"`
	Status            string  `json:"status"`
	Priority          string  `json:"priority"`
	AssigneeType      *string `json:"assignee_type"`
	AgentAssigneeID   *string `json:"agent_assignee_id"`
	UserAssigneeID    *string `json:"user_assignee_id"`
	// Legacy: single assignee_id with assignee_type
	LegacyAssigneeID *string `json:"assignee_id"`
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

		var agentID, userAssign pgtype.UUID
		if req.AgentAssigneeID != nil && *req.AgentAssigneeID != "" {
			agentID = parseUUID(*req.AgentAssigneeID)
		}
		if req.UserAssigneeID != nil && *req.UserAssigneeID != "" {
			userAssign = parseUUID(*req.UserAssigneeID)
		}
		if !agentID.Valid && !userAssign.Valid && req.LegacyAssigneeID != nil && *req.LegacyAssigneeID != "" {
			if req.AssigneeType != nil && *req.AssigneeType == "agent" {
				agentID = parseUUID(*req.LegacyAssigneeID)
			}
			if req.AssigneeType != nil && *req.AssigneeType == "member" {
				userAssign = parseUUID(*req.LegacyAssigneeID)
			}
		}

		assigneeType := req.AssigneeType
		if assigneeType == nil {
			if agentID.Valid {
				t := "agent"
				assigneeType = &t
			} else if userAssign.Valid {
				t := "member"
				assigneeType = &t
			}
		}

		issue, err := s.Q.CreateIssue(r.Context(), db.CreateIssueParams{
			WorkspaceID:     wsID,
			Number:          &num,
			Title:           req.Title,
			Description:     req.Description,
			Status:          status,
			Priority:        priority,
			AssigneeType:    assigneeType,
			AgentAssigneeID: agentID,
			UserAssigneeID:  userAssign,
			CreatedByID:     createdByID,
		})
		if err != nil {
			http.Error(w, fmt.Sprintf("create issue: %v", err), http.StatusInternalServerError)
			return
		}

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
	Title           *string  `json:"title"`
	Description     *string  `json:"description"`
	Status          *string  `json:"status"`
	Priority        *string  `json:"priority"`
	AssigneeType    *string  `json:"assignee_type"`
	AgentAssigneeID *string  `json:"agent_assignee_id"`
	UserAssigneeID  *string  `json:"user_assignee_id"`
	LegacyAssigneeID *string `json:"assignee_id"`
	Position        *float64 `json:"position"`
}

func mergeAssigneeOnUpdate(prev db.Issue, req updateIssueRequest) (assigneeType *string, agentID pgtype.UUID, userID pgtype.UUID) {
	if prev.AssigneeType != nil {
		v := *prev.AssigneeType
		assigneeType = &v
	}
	if req.AssigneeType != nil {
		assigneeType = req.AssigneeType
	}

	agentID = prev.AgentAssigneeID
	userID = prev.UserAssigneeID

	if req.AgentAssigneeID != nil {
		if *req.AgentAssigneeID == "" {
			agentID = pgtype.UUID{Valid: false}
		} else {
			agentID = parseUUID(*req.AgentAssigneeID)
		}
	}
	if req.UserAssigneeID != nil {
		if *req.UserAssigneeID == "" {
			userID = pgtype.UUID{Valid: false}
		} else {
			userID = parseUUID(*req.UserAssigneeID)
		}
	}

	if req.LegacyAssigneeID != nil && req.AgentAssigneeID == nil && req.UserAssigneeID == nil {
		if *req.LegacyAssigneeID == "" {
			agentID = pgtype.UUID{Valid: false}
			userID = pgtype.UUID{Valid: false}
		} else if assigneeType != nil && *assigneeType == "agent" {
			agentID = parseUUID(*req.LegacyAssigneeID)
			userID = pgtype.UUID{Valid: false}
		} else if assigneeType != nil && *assigneeType == "member" {
			userID = parseUUID(*req.LegacyAssigneeID)
			agentID = pgtype.UUID{Valid: false}
		}
	}

	if assigneeType != nil {
		switch *assigneeType {
		case "agent":
			userID = pgtype.UUID{Valid: false}
		case "member":
			agentID = pgtype.UUID{Valid: false}
		}
	}

	return assigneeType, agentID, userID
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

		at, agentID, userID := mergeAssigneeOnUpdate(prev, req)

		issue, err := s.Q.UpdateIssue(r.Context(), db.UpdateIssueParams{
			ID:              id,
			Title:           req.Title,
			Description:     req.Description,
			Status:          req.Status,
			Priority:        req.Priority,
			AssigneeType:    at,
			AgentAssigneeID: agentID,
			UserAssigneeID:  userID,
			Position:        req.Position,
		})
		if err != nil {
			http.Error(w, fmt.Sprintf("update issue: %v", err), http.StatusInternalServerError)
			return
		}

		prevKey := assigneeKey(prev)
		newKey := assigneeKey(issue)
		if prevKey != newKey {
			_ = s.TaskService.CancelTasksForIssue(r.Context(), id)
			if s.TaskService.ShouldEnqueueAgentTask(issue) {
				_ = s.TaskService.EnqueueTaskForIssue(r.Context(), issue)
			}
		}

		broadcastEvent("issue:updated", issue)
		writeJSON(w, issue)
	}
}

func assigneeKey(issue db.Issue) string {
	a := ""
	if issue.AgentAssigneeID.Valid {
		a = issue.AgentAssigneeID.String()
	}
	u := ""
	if issue.UserAssigneeID.Valid {
		u = issue.UserAssigneeID.String()
	}
	t := ""
	if issue.AssigneeType != nil {
		t = *issue.AssigneeType
	}
	return t + "|" + a + "|" + u
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
