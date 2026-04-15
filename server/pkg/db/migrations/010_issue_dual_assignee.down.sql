ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES agents(id) ON DELETE SET NULL;

UPDATE issues
SET assignee_id = agent_assignee_id
WHERE assignee_type = 'agent' AND agent_assignee_id IS NOT NULL;

DROP INDEX IF EXISTS idx_issues_workspace_agent_assignee;
DROP INDEX IF EXISTS idx_issues_workspace_user_assignee;

ALTER TABLE issues DROP COLUMN IF EXISTS agent_assignee_id;
ALTER TABLE issues DROP COLUMN IF EXISTS user_assignee_id;

CREATE INDEX IF NOT EXISTS idx_issues_workspace_assignee ON issues(workspace_id, assignee_id);
