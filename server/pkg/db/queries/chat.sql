-- name: ListWorkspaceMessages :many
SELECT * FROM (
  SELECT * FROM workspace_messages
  WHERE workspace_id = $1
  ORDER BY created_at DESC
  LIMIT $2 OFFSET $3
) t ORDER BY created_at ASC;

-- name: CreateWorkspaceMessage :one
INSERT INTO workspace_messages (workspace_id, author_type, author_id, content, metadata)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetWorkspaceMessage :one
SELECT * FROM workspace_messages WHERE id = $1;
