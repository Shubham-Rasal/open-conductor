export interface Workspace {
  id: string;
  name: string;
  slug: string;
  prefix: string;
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
