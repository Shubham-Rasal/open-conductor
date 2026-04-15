DROP INDEX IF EXISTS agent_runtimes_agent_workspace_key;

ALTER TABLE agent_runtimes DROP COLUMN IF EXISTS workspace_id;

-- Restore single-runtime-per-agent (keeps one row per agent_id if duplicates existed — manual cleanup may be needed)
ALTER TABLE agent_runtimes ADD CONSTRAINT agent_runtimes_agent_id_key UNIQUE (agent_id);
