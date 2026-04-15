export interface WorkspaceMessage {
  id: string;
  workspace_id: string;
  author_type: "user" | "assistant" | "agent";
  author_id?: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface ProposedPlanIssue {
  title: string;
  description?: string | null;
  priority: string;
  suggested_assignee: "agent" | "member";
}
