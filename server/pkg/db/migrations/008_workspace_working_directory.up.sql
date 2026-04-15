ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS working_directory TEXT;
