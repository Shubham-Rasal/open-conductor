package db

import (
	"database/sql"
	"encoding/json"
	"time"
)

// Go 1.26+ encodes sql.NullString / NullTime as {"String","Valid"} objects.
// These MarshalJSON implementations emit JSON the web app expects (scalars or null).

func ptrNullString(n sql.NullString) *string {
	if !n.Valid {
		return nil
	}
	s := n.String
	return &s
}

func ptrNullInt64(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	v := n.Int64
	return &v
}

func ptrNullTime(n sql.NullTime) *time.Time {
	if !n.Valid {
		return nil
	}
	t := n.Time
	return &t
}

func (a Agent) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		ID                 string    `json:"id"`
		WorkspaceID        string    `json:"workspace_id"`
		Name               string    `json:"name"`
		Instructions       string    `json:"instructions"`
		Status             string    `json:"status"`
		MaxConcurrentTasks int64     `json:"max_concurrent_tasks"`
		CreatedAt          time.Time `json:"created_at"`
		UpdatedAt          time.Time `json:"updated_at"`
		Model              *string   `json:"model"`
		SpawnMode          string    `json:"spawn_mode"`
	}{
		ID:                 a.ID,
		WorkspaceID:        a.WorkspaceID,
		Name:               a.Name,
		Instructions:       a.Instructions,
		Status:             a.Status,
		MaxConcurrentTasks: a.MaxConcurrentTasks,
		CreatedAt:          a.CreatedAt,
		UpdatedAt:          a.UpdatedAt,
		Model:              ptrNullString(a.Model),
		SpawnMode:          a.SpawnMode,
	})
}

func (r AgentRuntime) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		ID          string     `json:"id"`
		AgentID     string     `json:"agent_id"`
		WorkspaceID string     `json:"workspace_id"`
		Provider    string     `json:"provider"`
		Status      string     `json:"status"`
		DeviceName  *string    `json:"device_name"`
		LastSeenAt  *time.Time `json:"last_seen_at"`
		CreatedAt   time.Time  `json:"created_at"`
	}{
		ID:          r.ID,
		AgentID:     r.AgentID,
		WorkspaceID: r.WorkspaceID,
		Provider:    r.Provider,
		Status:      r.Status,
		DeviceName:  ptrNullString(r.DeviceName),
		LastSeenAt:  ptrNullTime(r.LastSeenAt),
		CreatedAt:   r.CreatedAt,
	})
}

func (t AgentTaskQueue) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		ID               string     `json:"id"`
		AgentID          string     `json:"agent_id"`
		IssueID          *string    `json:"issue_id"`
		ChatSessionID    *string    `json:"chat_session_id"`
		Status           string     `json:"status"`
		Priority         int64      `json:"priority"`
		Output           *string    `json:"output"`
		ErrorMessage     *string    `json:"error_message"`
		SessionID        *string    `json:"session_id"`
		WorkDir          *string    `json:"work_dir"`
		BranchName       *string    `json:"branch_name"`
		TriggerCommentID *string    `json:"trigger_comment_id"`
		CreatedAt        time.Time  `json:"created_at"`
		StartedAt        *time.Time `json:"started_at"`
		CompletedAt      *time.Time `json:"completed_at"`
		WorkspaceID      string     `json:"workspace_id"`
	}{
		ID:               t.ID,
		AgentID:          t.AgentID,
		IssueID:          ptrNullString(t.IssueID),
		ChatSessionID:    ptrNullString(t.ChatSessionID),
		Status:           t.Status,
		Priority:         t.Priority,
		Output:           ptrNullString(t.Output),
		ErrorMessage:     ptrNullString(t.ErrorMessage),
		SessionID:        ptrNullString(t.SessionID),
		WorkDir:          ptrNullString(t.WorkDir),
		BranchName:       ptrNullString(t.BranchName),
		TriggerCommentID: ptrNullString(t.TriggerCommentID),
		CreatedAt:        t.CreatedAt,
		StartedAt:        ptrNullTime(t.StartedAt),
		CompletedAt:      ptrNullTime(t.CompletedAt),
		WorkspaceID:      t.WorkspaceID,
	})
}

func (i Issue) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		ID              string   `json:"id"`
		WorkspaceID     string   `json:"workspace_id"`
		Number          *int64   `json:"number"`
		Title           string   `json:"title"`
		Description     *string  `json:"description"`
		Status          string   `json:"status"`
		Priority        string   `json:"priority"`
		AssigneeType    *string  `json:"assignee_type"`
		Position        float64  `json:"position"`
		AgentAssigneeID *string  `json:"agent_assignee_id"`
		UserAssigneeID  *string  `json:"user_assignee_id"`
		CreatedByID     string   `json:"created_by_id"`
		CreatedAt       time.Time `json:"created_at"`
		UpdatedAt       time.Time `json:"updated_at"`
	}{
		ID:              i.ID,
		WorkspaceID:     i.WorkspaceID,
		Number:          ptrNullInt64(i.Number),
		Title:           i.Title,
		Description:     ptrNullString(i.Description),
		Status:          i.Status,
		Priority:        i.Priority,
		AssigneeType:    ptrNullString(i.AssigneeType),
		Position:        i.Position,
		AgentAssigneeID: ptrNullString(i.AgentAssigneeID),
		UserAssigneeID:  ptrNullString(i.UserAssigneeID),
		CreatedByID:     i.CreatedByID,
		CreatedAt:       i.CreatedAt,
		UpdatedAt:       i.UpdatedAt,
	})
}

func (u User) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		ID        string    `json:"id"`
		Email     string    `json:"email"`
		Name      string    `json:"name"`
		AvatarURL *string   `json:"avatar_url"`
		CreatedAt time.Time `json:"created_at"`
		UpdatedAt time.Time `json:"updated_at"`
	}{
		ID:        u.ID,
		Email:     u.Email,
		Name:      u.Name,
		AvatarURL: ptrNullString(u.AvatarUrl),
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
	})
}

func (w Workspace) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		ID               string    `json:"id"`
		Name             string    `json:"name"`
		Slug             string    `json:"slug"`
		CreatedAt        time.Time `json:"created_at"`
		UpdatedAt        time.Time `json:"updated_at"`
		Prefix           string    `json:"prefix"`
		Description      *string   `json:"description"`
		Type             string    `json:"type"`
		ConnectionURL    *string `json:"connection_url"`
		WorkingDirectory *string `json:"working_directory"`
	}{
		ID:               w.ID,
		Name:             w.Name,
		Slug:             w.Slug,
		CreatedAt:        w.CreatedAt,
		UpdatedAt:        w.UpdatedAt,
		Prefix:           w.Prefix,
		Description:      ptrNullString(w.Description),
		Type:             w.Type,
		ConnectionURL:    ptrNullString(w.ConnectionUrl),
		WorkingDirectory: ptrNullString(w.WorkingDirectory),
	})
}

func (m WorkspaceMessage) MarshalJSON() ([]byte, error) {
	out := struct {
		ID          string          `json:"id"`
		WorkspaceID string          `json:"workspace_id"`
		AuthorType  string          `json:"author_type"`
		AuthorID    *string         `json:"author_id,omitempty"`
		Content     string          `json:"content"`
		Metadata    json.RawMessage `json:"metadata,omitempty"`
		CreatedAt   time.Time       `json:"created_at"`
	}{
		ID:          m.ID,
		WorkspaceID: m.WorkspaceID,
		AuthorType:  m.AuthorType,
		AuthorID:    ptrNullString(m.AuthorID),
		Content:     m.Content,
		CreatedAt:   m.CreatedAt,
	}
	if len(m.Metadata) > 0 {
		out.Metadata = json.RawMessage(m.Metadata)
	}
	return json.Marshal(out)
}

func (r ListWorkspaceMembersWithUsersRow) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		WorkspaceID string    `json:"workspace_id"`
		UserID      string    `json:"user_id"`
		Role        string    `json:"role"`
		JoinedAt    time.Time `json:"joined_at"`
		Email       string    `json:"email"`
		Name        string    `json:"name"`
		AvatarURL   *string   `json:"avatar_url"`
	}{
		WorkspaceID: r.WorkspaceID,
		UserID:      r.UserID,
		Role:        r.Role,
		JoinedAt:    r.JoinedAt,
		Email:       r.Email,
		Name:        r.Name,
		AvatarURL:   ptrNullString(r.AvatarUrl),
	})
}

func (r ListOnlineAgentRuntimesRow) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		ID              string     `json:"id"`
		AgentID         string     `json:"agent_id"`
		WorkspaceID     string     `json:"workspace_id"`
		Provider        string     `json:"provider"`
		Status          string     `json:"status"`
		DeviceName      *string    `json:"device_name"`
		LastSeenAt      *time.Time `json:"last_seen_at"`
		CreatedAt       time.Time  `json:"created_at"`
		WorkspaceType   string     `json:"workspace_type"`
		ConnectionURL   *string    `json:"connection_url"`
	}{
		ID:            r.ID,
		AgentID:       r.AgentID,
		WorkspaceID:   r.WorkspaceID,
		Provider:      r.Provider,
		Status:        r.Status,
		DeviceName:    ptrNullString(r.DeviceName),
		LastSeenAt:    ptrNullTime(r.LastSeenAt),
		CreatedAt:     r.CreatedAt,
		WorkspaceType: r.WorkspaceType,
		ConnectionURL: ptrNullString(r.ConnectionUrl),
	})
}
