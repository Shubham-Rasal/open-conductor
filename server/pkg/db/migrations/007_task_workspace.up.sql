ALTER TABLE agent_task_queue
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE agent_task_queue atq
  SET workspace_id = i.workspace_id
  FROM issues i WHERE i.id = atq.issue_id AND atq.workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_queue_agent_workspace_status
  ON agent_task_queue (agent_id, workspace_id, status);
