DROP INDEX IF EXISTS idx_issues_position;
DROP INDEX IF EXISTS idx_issues_workspace_assignee;
DROP INDEX IF EXISTS idx_issues_workspace_status;
DROP TABLE IF EXISTS workspace_issue_sequences;
ALTER TABLE comments DROP COLUMN IF EXISTS author_type;
ALTER TABLE issues DROP COLUMN IF EXISTS position;
ALTER TABLE issues DROP COLUMN IF EXISTS assignee_type;
ALTER TABLE issues DROP COLUMN IF EXISTS number;
ALTER TABLE workspaces DROP COLUMN IF EXISTS prefix;
