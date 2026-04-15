export type WorkspaceType = "local" | "remote";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  prefix: string;
  description: string | null;
  type: WorkspaceType;
  connection_url: string | null;
  /** Absolute or home-relative path; agent CLIs use this as process working directory for tasks. */
  working_directory: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: string;
}

export interface WorkspaceMemberRow {
  workspace_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  email: string;
  name: string;
  avatar_url: string | null;
}
