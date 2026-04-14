-- name: ListIssues :many
SELECT * FROM issues
WHERE workspace_id = $1
ORDER BY position ASC, created_at DESC;

-- name: ListIssuesByStatus :many
SELECT * FROM issues
WHERE workspace_id = $1 AND status = $2
ORDER BY position ASC, created_at DESC;

-- name: GetIssue :one
SELECT * FROM issues WHERE id = $1;

-- name: NextIssueNumber :one
INSERT INTO workspace_issue_sequences (workspace_id, next_number)
VALUES ($1, 2)
ON CONFLICT (workspace_id) DO UPDATE
  SET next_number = workspace_issue_sequences.next_number + 1
RETURNING next_number - 1 AS number;

-- name: CreateIssue :one
INSERT INTO issues (
    workspace_id, number, title, description,
    status, priority, assignee_type, assignee_id,
    created_by_id, position
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
    COALESCE((SELECT MAX(position) FROM issues WHERE workspace_id = $1), 0) + 1
)
RETURNING *;

-- name: UpdateIssue :one
UPDATE issues SET
    title        = COALESCE(sqlc.narg(title), title),
    description  = COALESCE(sqlc.narg(description), description),
    status       = COALESCE(sqlc.narg(status), status),
    priority     = COALESCE(sqlc.narg(priority), priority),
    assignee_type = sqlc.narg(assignee_type),
    assignee_id  = sqlc.narg(assignee_id),
    position     = COALESCE(sqlc.narg(position), position),
    updated_at   = NOW()
WHERE id = sqlc.arg(id)
RETURNING *;

-- name: DeleteIssue :exec
DELETE FROM issues WHERE id = $1;

-- name: UpdateIssueStatus :one
UPDATE issues SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *;
