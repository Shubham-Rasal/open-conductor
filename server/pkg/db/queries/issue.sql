-- name: ListIssues :many
SELECT * FROM issues
WHERE workspace_id = ?
ORDER BY position ASC, created_at DESC;

-- name: ListIssuesByStatus :many
SELECT * FROM issues
WHERE workspace_id = ? AND status = ?
ORDER BY position ASC, created_at DESC;

-- name: GetIssue :one
SELECT * FROM issues WHERE id = ?;

-- name: NextIssueNumber :one
INSERT INTO workspace_issue_sequences (workspace_id, next_number)
VALUES (?, 2)
ON CONFLICT (workspace_id) DO UPDATE SET
  next_number = workspace_issue_sequences.next_number + 1
RETURNING next_number - 1 AS number;

-- name: CreateIssue :one
INSERT INTO issues (
    id, workspace_id, number, title, description,
    status, priority, assignee_type, agent_assignee_id, user_assignee_id,
    created_by_id, position
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    COALESCE((SELECT MAX(i.position) FROM issues i WHERE i.workspace_id = ?), 0) + 1
)
RETURNING *;

-- name: UpdateIssue :one
UPDATE issues SET
    title        = COALESCE(sqlc.narg(title), title),
    description  = COALESCE(sqlc.narg(description), description),
    status       = COALESCE(sqlc.narg(status), status),
    priority     = COALESCE(sqlc.narg(priority), priority),
    assignee_type = sqlc.narg(assignee_type),
    agent_assignee_id = sqlc.narg(agent_assignee_id),
    user_assignee_id = sqlc.narg(user_assignee_id),
    position     = COALESCE(sqlc.narg(position), position),
    updated_at   = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id)
RETURNING *;

-- name: DeleteIssue :exec
DELETE FROM issues WHERE id = ?;

-- name: UpdateIssueStatus :one
UPDATE issues SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;
