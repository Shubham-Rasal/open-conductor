package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	appMiddleware "github.com/Shubham-Rasal/open-conductor/server/internal/middleware"
	db "github.com/Shubham-Rasal/open-conductor/server/pkg/db/generated"
)

func RegisterCommentRoutes(r chi.Router, s *Store) {
	r.Get("/issues/{issueId}/comments", listComments(s))
	r.Post("/issues/{issueId}/comments", createComment(s))
	r.Delete("/comments/{commentId}", deleteComment(s))
}

func listComments(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		issueID := parseUUID(chi.URLParam(r, "issueId"))
		if !issueID.Valid {
			http.Error(w, "invalid issue id", http.StatusBadRequest)
			return
		}

		comments, err := s.Q.ListComments(r.Context(), issueID)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		writeJSON(w, map[string]any{"comments": comments})
	}
}

type createCommentRequest struct {
	Content string `json:"content"`
}

func createComment(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		issueID := parseUUID(chi.URLParam(r, "issueId"))
		if !issueID.Valid {
			http.Error(w, "invalid issue id", http.StatusBadRequest)
			return
		}

		var req createCommentRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" {
			http.Error(w, "content is required", http.StatusBadRequest)
			return
		}

		userID := appMiddleware.GetUserID(r)
		authorID := parseUUID(userID)

		comment, err := s.Q.CreateComment(r.Context(), db.CreateCommentParams{
			IssueID:    issueID,
			AuthorID:   authorID,
			AuthorType: "member",
			Content:    req.Content,
		})
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		// If issue is assigned to an agent, enqueue a task for it
		issue, err := s.Q.GetIssue(r.Context(), issueID)
		if err == nil && s.TaskService.ShouldEnqueueAgentTask(issue) {
			_ = s.TaskService.EnqueueTaskForIssue(r.Context(), issue)
		}

		broadcastEvent("comment:created", comment)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(comment)
	}
}

func deleteComment(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := parseUUID(chi.URLParam(r, "commentId"))
		if !id.Valid {
			http.Error(w, "invalid comment id", http.StatusBadRequest)
			return
		}

		if err := s.Q.DeleteComment(r.Context(), id); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
