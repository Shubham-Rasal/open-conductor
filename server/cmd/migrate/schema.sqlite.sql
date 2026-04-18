-- Open Conductor — SQLite schema (keep in sync with pkg/db/schema.sqlite.sql; embedded by cmd/migrate)
-- Enable foreign keys on the connection: _pragma=foreign_keys(1)

CREATE TABLE IF NOT EXISTS workspaces (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    slug                TEXT NOT NULL UNIQUE,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prefix              TEXT NOT NULL DEFAULT 'OC',
    description         TEXT,
    type                TEXT NOT NULL DEFAULT 'local',
    connection_url      TEXT,
    working_directory   TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    avatar_url      TEXT,
    password_hash   TEXT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT 'member',
    joined_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS agents (
    id                   TEXT PRIMARY KEY,
    workspace_id         TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name                 TEXT NOT NULL,
    instructions         TEXT NOT NULL DEFAULT '',
    status               TEXT NOT NULL DEFAULT 'offline',
    max_concurrent_tasks INTEGER NOT NULL DEFAULT 6,
    created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    model                TEXT,
    spawn_mode           TEXT NOT NULL DEFAULT 'daemon'
);

CREATE TABLE IF NOT EXISTS agent_runtimes (
    id           TEXT PRIMARY KEY,
    agent_id     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider     TEXT NOT NULL DEFAULT 'claude',
    status       TEXT NOT NULL DEFAULT 'offline',
    device_name  TEXT,
    last_seen_at DATETIME,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (agent_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS issues (
    id                TEXT PRIMARY KEY,
    workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    number            INTEGER,
    title             TEXT NOT NULL,
    description       TEXT,
    status            TEXT NOT NULL DEFAULT 'backlog',
    priority          TEXT NOT NULL DEFAULT 'no_priority',
    assignee_type     TEXT CHECK (assignee_type IN ('member', 'agent')),
    position          REAL NOT NULL DEFAULT 0,
    agent_assignee_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    user_assignee_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_by_id     TEXT NOT NULL REFERENCES users(id),
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
    id          TEXT PRIMARY KEY,
    issue_id    TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_id   TEXT NOT NULL REFERENCES users(id),
    content     TEXT NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    author_type TEXT NOT NULL DEFAULT 'member' CHECK (author_type IN ('member', 'agent'))
);

CREATE TABLE IF NOT EXISTS agent_task_queue (
    id                 TEXT PRIMARY KEY,
    agent_id           TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    issue_id           TEXT REFERENCES issues(id) ON DELETE CASCADE,
    chat_session_id    TEXT,
    status             TEXT NOT NULL DEFAULT 'queued',
    priority           INTEGER NOT NULL DEFAULT 0,
    output             TEXT,
    error_message      TEXT,
    session_id         TEXT,
    work_dir           TEXT,
    branch_name        TEXT,
    trigger_comment_id TEXT REFERENCES comments(id) ON DELETE SET NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at         DATETIME,
    completed_at       DATETIME,
    workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_issue_sequences (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    next_number  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS workspace_messages (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    author_type  TEXT NOT NULL DEFAULT 'user',
    author_id    TEXT,
    content      TEXT NOT NULL,
    metadata     BLOB,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspace_env_vars (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    key          TEXT NOT NULL,
    value        TEXT NOT NULL DEFAULT '',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (workspace_id, key)
);

CREATE INDEX IF NOT EXISTS idx_agent_task_queue_agent_status ON agent_task_queue(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_task_queue_issue ON agent_task_queue(issue_id) WHERE issue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issues_workspace_status ON issues(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_workspace_agent_assignee ON issues(workspace_id, agent_assignee_id);
CREATE INDEX IF NOT EXISTS idx_issues_workspace_user_assignee ON issues(workspace_id, user_assignee_id);
CREATE INDEX IF NOT EXISTS idx_issues_position ON issues(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_task_queue_agent_workspace_status ON agent_task_queue(agent_id, workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_workspace_messages_workspace_created ON workspace_messages(workspace_id, created_at DESC);
