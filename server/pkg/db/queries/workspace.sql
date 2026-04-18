-- name: ListWorkspaces :many
SELECT * FROM workspaces ORDER BY created_at DESC;

-- name: GetWorkspace :one
SELECT * FROM workspaces WHERE id = ?;

-- name: CreateWorkspace :one
INSERT INTO workspaces (id, name, slug, prefix, description, type, connection_url, working_directory)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: GetWorkspaceBySlug :one
SELECT * FROM workspaces WHERE slug = ?;

-- name: UpdateWorkspace :one
UPDATE workspaces SET
    name = COALESCE(sqlc.narg('name'), name),
    description = COALESCE(sqlc.narg('description'), description),
    prefix = COALESCE(sqlc.narg('prefix'), prefix),
    type = COALESCE(sqlc.narg('type'), type),
    connection_url = COALESCE(sqlc.narg('connection_url'), connection_url),
    working_directory = COALESCE(sqlc.narg('working_directory'), working_directory),
    updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteWorkspace :exec
DELETE FROM workspaces WHERE id = ?;

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
WHERE wm.workspace_id = ?
ORDER BY u.name ASC;
