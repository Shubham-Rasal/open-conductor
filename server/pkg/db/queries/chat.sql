-- name: ListWorkspaceMessages :many
SELECT * FROM (
  SELECT * FROM workspace_messages
  WHERE workspace_id = ?
  ORDER BY created_at DESC
  LIMIT ? OFFSET ?
) t ORDER BY created_at ASC;

-- name: CreateWorkspaceMessage :one
INSERT INTO workspace_messages (id, workspace_id, author_type, author_id, content, metadata)
VALUES (?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: GetWorkspaceMessage :one
SELECT * FROM workspace_messages WHERE id = ?;
