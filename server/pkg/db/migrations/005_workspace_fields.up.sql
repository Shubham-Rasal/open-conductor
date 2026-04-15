ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS type           TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS connection_url TEXT;
