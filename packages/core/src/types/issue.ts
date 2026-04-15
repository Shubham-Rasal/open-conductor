export type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled" | "blocked";
export type IssuePriority = "urgent" | "high" | "medium" | "low" | "no_priority";

export interface Issue {
  id: string;
  workspace_id: string;
  number: number | null;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assignee_type: "member" | "agent" | null;
  /** @deprecated Prefer agent_assignee_id / user_assignee_id */
  assignee_id?: string | null;
  agent_assignee_id?: string | null;
  user_assignee_id?: string | null;
  created_by_id: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  issue_id: string;
  author_id: string;
  author_type: "member" | "agent";
  content: string;
  created_at: string;
  updated_at: string;
}
