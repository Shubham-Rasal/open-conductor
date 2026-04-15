-- Split assignee_id into agent vs user FKs
ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS agent_assignee_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS user_assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE issues
SET agent_assignee_id = assignee_id
WHERE assignee_type = 'agent' AND assignee_id IS NOT NULL;

DROP INDEX IF EXISTS idx_issues_workspace_assignee;

ALTER TABLE issues DROP COLUMN IF EXISTS assignee_id;

CREATE INDEX IF NOT EXISTS idx_issues_workspace_agent_assignee ON issues(workspace_id, agent_assignee_id);
CREATE INDEX IF NOT EXISTS idx_issues_workspace_user_assignee ON issues(workspace_id, user_assignee_id);
