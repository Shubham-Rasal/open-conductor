CREATE TABLE IF NOT EXISTS workspace_messages (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    author_type  TEXT NOT NULL DEFAULT 'user',
    author_id    UUID,
    content      TEXT NOT NULL,
    metadata     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_messages_workspace_created
    ON workspace_messages(workspace_id, created_at DESC);
