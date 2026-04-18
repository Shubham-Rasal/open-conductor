-- name: ListWorkspaceEnvVars :many
SELECT * FROM workspace_env_vars WHERE workspace_id = ? ORDER BY key ASC;

-- name: UpsertWorkspaceEnvVar :one
INSERT INTO workspace_env_vars (id, workspace_id, key, value)
VALUES (?, ?, ?, ?)
ON CONFLICT (workspace_id, key) DO UPDATE
    SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
RETURNING *;

-- name: DeleteWorkspaceEnvVar :exec
DELETE FROM workspace_env_vars WHERE workspace_id = ? AND key = ?;
