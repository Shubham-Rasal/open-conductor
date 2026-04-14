-- Add workspace prefix for issue identifiers (e.g., "OC-1")
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS prefix TEXT NOT NULL DEFAULT 'OC';

-- Add issue number (auto-incremented per workspace) and assignee_type
ALTER TABLE issues ADD COLUMN IF NOT EXISTS number INTEGER;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS assignee_type TEXT CHECK (assignee_type IN ('member', 'agent'));
ALTER TABLE issues ADD COLUMN IF NOT EXISTS position FLOAT NOT NULL DEFAULT 0;

-- Sequence table for per-workspace issue numbers
CREATE TABLE IF NOT EXISTS workspace_issue_sequences (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    next_number  INTEGER NOT NULL DEFAULT 1
);

-- Add author_type to comments (member vs agent)
ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_type TEXT NOT NULL DEFAULT 'member' CHECK (author_type IN ('member', 'agent'));

-- Index to support issue ordering and filtering
CREATE INDEX IF NOT EXISTS idx_issues_workspace_status ON issues(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_workspace_assignee ON issues(workspace_id, assignee_id);
CREATE INDEX IF NOT EXISTS idx_issues_position ON issues(workspace_id, position);
