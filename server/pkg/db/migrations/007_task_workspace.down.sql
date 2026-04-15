DROP INDEX IF EXISTS idx_task_queue_agent_workspace_status;

ALTER TABLE agent_task_queue DROP COLUMN IF EXISTS workspace_id;
