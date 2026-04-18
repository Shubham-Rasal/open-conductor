-- name: ListAgents :many
SELECT * FROM agents WHERE workspace_id = ? ORDER BY created_at DESC;

-- name: GetAgent :one
SELECT * FROM agents WHERE id = ?;

-- name: CreateAgent :one
INSERT INTO agents (id, workspace_id, name, instructions, max_concurrent_tasks, model)
VALUES (?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: UpdateAgentStatus :one
UPDATE agents SET status = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ?
RETURNING *;

-- name: SetAgentSpawnMode :one
UPDATE agents SET spawn_mode = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ?
RETURNING *;

-- name: ClaimAgentTask :one
-- Inner subqueries correlate to atq (only ? are agent_id and workspace_id on the outer row).
UPDATE agent_task_queue
SET status = 'dispatched'
WHERE id = (
    SELECT atq.id
    FROM agent_task_queue atq
    WHERE atq.agent_id = ?
      AND atq.workspace_id = ?
      AND atq.status = 'queued'
      AND NOT EXISTS (
          SELECT 1 FROM agent_task_queue active
          WHERE active.agent_id = atq.agent_id
            AND active.workspace_id = atq.workspace_id
            AND active.status IN ('dispatched', 'running')
            AND (
              (atq.issue_id IS NOT NULL AND active.issue_id = atq.issue_id)
              OR (atq.chat_session_id IS NOT NULL AND active.chat_session_id = atq.chat_session_id)
            )
      )
      AND (
          SELECT COUNT(*) FROM agent_task_queue running
          WHERE running.agent_id = atq.agent_id
            AND running.workspace_id = atq.workspace_id
            AND running.status IN ('dispatched', 'running')
      ) < (SELECT max_concurrent_tasks FROM agents a WHERE a.id = atq.agent_id)
    ORDER BY atq.priority DESC, atq.created_at ASC
    LIMIT 1
)
RETURNING *;

-- name: StartTask :one
UPDATE agent_task_queue
SET status = 'running', started_at = CURRENT_TIMESTAMP
WHERE id = ? AND status = 'dispatched'
RETURNING *;

-- name: CompleteTask :one
UPDATE agent_task_queue
SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
    output = ?, session_id = ?, work_dir = ?, branch_name = ?
WHERE id = ?
RETURNING *;

-- name: FailTask :one
UPDATE agent_task_queue
SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error_message = ?
WHERE id = ?
RETURNING *;

-- name: CancelTask :one
UPDATE agent_task_queue
SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
WHERE id = ? AND status IN ('queued', 'dispatched', 'running')
RETURNING *;

-- name: EnqueueTask :one
INSERT INTO agent_task_queue (id, agent_id, issue_id, priority, trigger_comment_id, workspace_id)
VALUES (?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: CancelTasksByIssue :exec
UPDATE agent_task_queue
SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
WHERE issue_id = ? AND status IN ('queued', 'dispatched', 'running');

-- name: CancelQueuedTasksForAgent :exec
UPDATE agent_task_queue
SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
WHERE agent_id = ? AND workspace_id = ? AND status IN ('queued', 'dispatched', 'running');

-- name: GetLastCompletedSession :one
SELECT session_id FROM agent_task_queue
WHERE agent_id = ? AND workspace_id = ?
  AND session_id IS NOT NULL
  AND status = 'completed'
ORDER BY completed_at DESC
LIMIT 1;

-- name: UpdateAgentStatusOnly :exec
UPDATE agents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;

-- name: SetAgentModel :exec
UPDATE agents SET model = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;

-- name: UpdateAgentInstructions :one
UPDATE agents SET instructions = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND workspace_id = ?
RETURNING *;

-- name: ListOnlineAgentRuntimes :many
SELECT
  ar.id,
  ar.agent_id,
  ar.workspace_id,
  ar.provider,
  ar.status,
  ar.device_name,
  ar.last_seen_at,
  ar.created_at,
  w.type AS workspace_type,
  w.connection_url
FROM agent_runtimes ar
JOIN workspaces w ON w.id = ar.workspace_id
WHERE ar.status = 'online';

-- name: GetIssueForTask :one
SELECT i.* FROM issues i
JOIN agent_task_queue atq ON atq.issue_id = i.id
WHERE atq.id = ?;

-- name: ListCommentsForIssue :many
SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at ASC;

-- name: ListTasksForIssue :many
SELECT * FROM agent_task_queue
WHERE issue_id = ?
ORDER BY created_at DESC;

-- name: UpdateAgent :one
UPDATE agents SET
    name               = COALESCE(sqlc.narg('name'), name),
    instructions       = COALESCE(sqlc.narg('instructions'), instructions),
    max_concurrent_tasks = COALESCE(sqlc.narg('max_concurrent_tasks'), max_concurrent_tasks),
    model              = COALESCE(sqlc.narg('model'), model),
    updated_at         = CURRENT_TIMESTAMP
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')
RETURNING *;
