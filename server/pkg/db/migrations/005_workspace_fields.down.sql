ALTER TABLE workspaces
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS type,
  DROP COLUMN IF EXISTS connection_url;
