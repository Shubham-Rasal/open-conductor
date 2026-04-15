ALTER TABLE agent_runtimes DROP CONSTRAINT IF EXISTS agent_runtimes_agent_id_key;

ALTER TABLE agent_runtimes
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE agent_runtimes ar
  SET workspace_id = a.workspace_id
  FROM agents a WHERE a.id = ar.agent_id AND ar.workspace_id IS NULL;

ALTER TABLE agent_runtimes ALTER COLUMN workspace_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agent_runtimes_agent_workspace_key
  ON agent_runtimes (agent_id, workspace_id);
