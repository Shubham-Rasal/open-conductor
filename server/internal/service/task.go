package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/Shubham-Rasal/open-conductor/server/pkg/db/generated"
)

// TaskService handles agent task enqueueing and lifecycle.
type TaskService struct {
	q         *db.Queries
	broadcast func([]byte)
}

func NewTaskService(q *db.Queries, broadcast func([]byte)) *TaskService {
	return &TaskService{q: q, broadcast: broadcast}
}

// EnqueueTaskForIssue creates a queued task for the agent assigned to the issue.
func (s *TaskService) EnqueueTaskForIssue(ctx context.Context, issue db.Issue) error {
	if !issue.AgentAssigneeID.Valid || issue.AssigneeType == nil || *issue.AssigneeType != "agent" {
		return nil
	}

	_, err := s.q.EnqueueTask(ctx, db.EnqueueTaskParams{
		AgentID:          issue.AgentAssigneeID,
		IssueID:          issue.ID,
		Priority:         0,
		TriggerCommentID: pgtype.UUID{Valid: false},
		WorkspaceID:      issue.WorkspaceID,
	})
	if err != nil {
		return fmt.Errorf("enqueue task: %w", err)
	}

	slog.Info("task enqueued", "issue_id", issue.ID, "agent_id", issue.AgentAssigneeID)
	return nil
}

// CancelTasksForIssue cancels all active tasks for an issue.
func (s *TaskService) CancelTasksForIssue(ctx context.Context, issueID pgtype.UUID) error {
	if err := s.q.CancelTasksByIssue(ctx, issueID); err != nil {
		return fmt.Errorf("cancel tasks: %w", err)
	}
	return nil
}

// ShouldEnqueueAgentTask returns true if the issue should trigger an agent task.
func (s *TaskService) ShouldEnqueueAgentTask(issue db.Issue) bool {
	return issue.AgentAssigneeID.Valid &&
		issue.AssigneeType != nil &&
		*issue.AssigneeType == "agent"
}

// IssueHasActiveAgentTask reports whether there is a queued, dispatched, or running task for the issue.
func (s *TaskService) IssueHasActiveAgentTask(ctx context.Context, issueID pgtype.UUID) (bool, error) {
	tasks, err := s.q.ListTasksForIssue(ctx, issueID)
	if err != nil {
		return false, err
	}
	for _, t := range tasks {
		switch t.Status {
		case "queued", "dispatched", "running":
			return true, nil
		}
	}
	return false, nil
}

// broadcastEvent publishes a JSON event to all WebSocket clients.
func (s *TaskService) broadcastEvent(eventType string, payload any) {
	if s.broadcast == nil {
		return
	}
	data, err := json.Marshal(map[string]any{
		"type":    eventType,
		"payload": payload,
	})
	if err != nil {
		return
	}
	s.broadcast(data)
}
