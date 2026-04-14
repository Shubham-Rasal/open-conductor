-- name: ListAgents :many
SELECT * FROM agents WHERE workspace_id = $1 ORDER BY created_at DESC;

-- name: GetAgent :one
SELECT * FROM agents WHERE id = $1;

-- name: CreateAgent :one
INSERT INTO agents (workspace_id, name, instructions, max_concurrent_tasks, model)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateAgentStatus :one
UPDATE agents SET status = $2, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: ClaimAgentTask :one
UPDATE agent_task_queue
SET status = 'dispatched'
WHERE id = (
    SELECT atq.id
    FROM agent_task_queue atq
    WHERE atq.agent_id = $1
      AND atq.status = 'queued'
      AND NOT EXISTS (
          SELECT 1 FROM agent_task_queue active
          WHERE active.agent_id = atq.agent_id
            AND active.status IN ('dispatched', 'running')
            AND (
              (atq.issue_id IS NOT NULL AND active.issue_id = atq.issue_id)
              OR (atq.chat_session_id IS NOT NULL AND active.chat_session_id = atq.chat_session_id)
            )
      )
      AND (
          SELECT COUNT(*) FROM agent_task_queue running
          WHERE running.agent_id = atq.agent_id
            AND running.status IN ('dispatched', 'running')
      ) < (SELECT max_concurrent_tasks FROM agents WHERE id = $1)
    ORDER BY atq.priority DESC, atq.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- name: StartTask :one
UPDATE agent_task_queue
SET status = 'running', started_at = NOW()
WHERE id = $1 AND status = 'dispatched'
RETURNING *;

-- name: CompleteTask :one
UPDATE agent_task_queue
SET status = 'completed', completed_at = NOW(),
    output = $2, session_id = $3, work_dir = $4, branch_name = $5
WHERE id = $1
RETURNING *;

-- name: FailTask :one
UPDATE agent_task_queue
SET status = 'failed', completed_at = NOW(), error_message = $2
WHERE id = $1
RETURNING *;

-- name: CancelTask :one
UPDATE agent_task_queue
SET status = 'cancelled', completed_at = NOW()
WHERE id = $1 AND status IN ('queued', 'dispatched', 'running')
RETURNING *;

-- name: EnqueueTask :one
INSERT INTO agent_task_queue (agent_id, issue_id, priority, trigger_comment_id)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: CancelTasksByIssue :exec
UPDATE agent_task_queue
SET status = 'cancelled', completed_at = NOW()
WHERE issue_id = $1 AND status IN ('queued', 'dispatched', 'running');

-- name: CancelQueuedTasksForAgent :exec
UPDATE agent_task_queue
SET status = 'cancelled', completed_at = NOW()
WHERE agent_id = $1 AND status IN ('queued', 'dispatched', 'running');

-- name: GetLastCompletedSession :one
SELECT session_id FROM agent_task_queue
WHERE agent_id = $1
  AND session_id IS NOT NULL
  AND status = 'completed'
ORDER BY completed_at DESC
LIMIT 1;

-- name: UpdateAgentStatusOnly :exec
UPDATE agents SET status = $2, updated_at = NOW() WHERE id = $1;

-- name: SetAgentModel :exec
UPDATE agents SET model = $2, updated_at = NOW() WHERE id = $1;

-- name: UpdateAgentInstructions :one
UPDATE agents SET instructions = $3, updated_at = NOW()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: ListOnlineAgentRuntimes :many
SELECT ar.*, a.workspace_id
FROM agent_runtimes ar
JOIN agents a ON a.id = ar.agent_id
WHERE ar.status = 'online';

-- name: GetIssueForTask :one
SELECT i.* FROM issues i
JOIN agent_task_queue atq ON atq.issue_id = i.id
WHERE atq.id = $1;

-- name: ListCommentsForIssue :many
SELECT * FROM comments WHERE issue_id = $1 ORDER BY created_at ASC;

-- name: ListTasksForIssue :many
SELECT * FROM agent_task_queue
WHERE issue_id = $1
ORDER BY created_at DESC;
