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

export type ProposedTaskPriority = "no_priority" | "low" | "medium" | "high" | "urgent";

/** Orchestrator proposal: isolated tasks with optional agent assignment and dependency refs (local_id). */
export interface ProposedTask {
  local_id: string;
  title: string;
  description?: string | null;
  priority: ProposedTaskPriority | string;
  agent_id?: string | null;
  depends_on?: string[] | null;
}
