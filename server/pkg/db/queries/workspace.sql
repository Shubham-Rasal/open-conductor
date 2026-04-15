-- name: ListWorkspaces :many
SELECT * FROM workspaces ORDER BY created_at DESC;

-- name: GetWorkspace :one
SELECT * FROM workspaces WHERE id = $1;

-- name: CreateWorkspace :one
INSERT INTO workspaces (name, slug, prefix, description, type, connection_url, working_directory)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetWorkspaceBySlug :one
SELECT * FROM workspaces WHERE slug = $1;

-- name: UpdateWorkspace :one
UPDATE workspaces SET
    name = COALESCE(sqlc.narg('name'), name),
    description = COALESCE(sqlc.narg('description'), description),
    prefix = COALESCE(sqlc.narg('prefix'), prefix),
    type = COALESCE(sqlc.narg('type'), type),
    connection_url = COALESCE(sqlc.narg('connection_url'), connection_url),
    working_directory = COALESCE(sqlc.narg('working_directory'), working_directory),
    updated_at = NOW()
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteWorkspace :exec
DELETE FROM workspaces WHERE id = $1;

-- name: ListWorkspaceMembersWithUsers :many
SELECT
    wm.workspace_id,
    wm.user_id,
    wm.role,
    wm.joined_at,
    u.email,
    u.name,
    u.avatar_url
FROM workspace_members wm
JOIN users u ON u.id = wm.user_id
WHERE wm.workspace_id = $1
ORDER BY u.name ASC;
