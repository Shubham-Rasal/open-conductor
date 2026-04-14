-- name: ListWorkspaces :many
SELECT * FROM workspaces ORDER BY created_at DESC;

-- name: GetWorkspace :one
SELECT * FROM workspaces WHERE id = $1;

-- name: CreateWorkspace :one
INSERT INTO workspaces (name, slug, prefix)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetWorkspaceBySlug :one
SELECT * FROM workspaces WHERE slug = $1;
