-- name: UpsertAgentRuntime :one
INSERT INTO agent_runtimes (agent_id, provider, status, device_name, last_seen_at)
VALUES ($1, $2, 'online', $3, NOW())
ON CONFLICT (agent_id)
DO UPDATE SET
    provider     = EXCLUDED.provider,
    status       = 'online',
    device_name  = EXCLUDED.device_name,
    last_seen_at = NOW()
RETURNING *;

-- name: UpdateAgentRuntimeHeartbeat :exec
UPDATE agent_runtimes
SET last_seen_at = NOW()
WHERE agent_id = $1 AND status = 'online';

-- name: SetAgentRuntimeOfflineByAgent :exec
UPDATE agent_runtimes SET status = 'offline' WHERE agent_id = $1;

-- name: MarkAgentRuntimeOffline :exec
UPDATE agent_runtimes
SET status = 'offline'
WHERE last_seen_at < NOW() - INTERVAL '90 seconds'
  AND status = 'online';

-- name: ListAgentRuntimes :many
SELECT * FROM agent_runtimes
WHERE agent_id = ANY(@agent_ids::uuid[]);

-- name: GetAgentRuntimeByAgent :one
SELECT * FROM agent_runtimes WHERE agent_id = $1 LIMIT 1;
