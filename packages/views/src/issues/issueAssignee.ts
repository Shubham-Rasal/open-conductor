import type { Agent, Issue, WorkspaceMemberRow } from "@open-conductor/core/types";

/** Prefer new API fields; fall back to legacy assignee_id for agent. */
export function agentIdForIssue(issue: Issue): string | undefined {
  if (issue.agent_assignee_id) return issue.agent_assignee_id;
  if (issue.assignee_id && issue.assignee_type === "agent") return issue.assignee_id;
  return undefined;
}

export function userIdForIssue(issue: Issue): string | undefined {
  return issue.user_assignee_id ?? undefined;
}

export function resolveAgent(issue: Issue, agents: Agent[]): Agent | undefined {
  const id = agentIdForIssue(issue);
  return id ? agents.find((a) => a.id === id) : undefined;
}

export function resolveMember(issue: Issue, members: WorkspaceMemberRow[]): WorkspaceMemberRow | undefined {
  const id = userIdForIssue(issue);
  return id ? members.find((m) => m.user_id === id) : undefined;
}
