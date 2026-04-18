-- name: UpsertAgentRuntime :one
INSERT INTO agent_runtimes (id, agent_id, workspace_id, provider, status, device_name, last_seen_at)
VALUES (?, ?, ?, ?, 'online', ?, CURRENT_TIMESTAMP)
ON CONFLICT (agent_id, workspace_id)
DO UPDATE SET
    provider     = excluded.provider,
    status       = 'online',
    device_name  = excluded.device_name,
    last_seen_at = CURRENT_TIMESTAMP
RETURNING *;

-- name: UpdateAgentRuntimeHeartbeat :exec
UPDATE agent_runtimes
SET last_seen_at = CURRENT_TIMESTAMP
WHERE agent_id = ? AND workspace_id = ? AND status = 'online';

-- name: SetAgentRuntimeOfflineByAgent :exec
UPDATE agent_runtimes SET status = 'offline' WHERE agent_id = ? AND workspace_id = ?;

-- name: MarkAgentRuntimeOffline :exec
UPDATE agent_runtimes
SET status = 'offline'
WHERE datetime(last_seen_at) < datetime('now', '-90 seconds')
  AND status = 'online';

-- name: ListAgentRuntimes :many
SELECT * FROM agent_runtimes
WHERE agent_id IN (sqlc.slice('agent_ids'));

-- name: GetAgentRuntimeByAgentAndWorkspace :one
SELECT * FROM agent_runtimes WHERE agent_id = ? AND workspace_id = ? LIMIT 1;
