import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../api/client";
import type { Issue, Comment, AgentTask } from "../types";

export const issueKeys = {
  all: (wsId: string) => ["issues", wsId] as const,
  list: (wsId: string) => ["issues", wsId, "list"] as const,
  detail: (wsId: string, id: string) => ["issues", wsId, "detail", id] as const,
  comments: (issueId: string) => ["issues", "comments", issueId] as const,
  tasks: (wsId: string, issueId: string) => ["issues", wsId, "tasks", issueId] as const,
};

export interface ListIssuesResponse {
  issues: Issue[];
}

export function issueListOptions(api: ApiClient, wsId: string) {
  return queryOptions({
    queryKey: issueKeys.list(wsId),
    queryFn: () => api.get<ListIssuesResponse>(`/api/workspaces/${wsId}/issues`),
    select: (data) => data.issues,
    enabled: !!wsId,
  });
}

export function issueDetailOptions(api: ApiClient, wsId: string, id: string) {
  return queryOptions({
    queryKey: issueKeys.detail(wsId, id),
    queryFn: () => api.get<Issue>(`/api/workspaces/${wsId}/issues/${id}`),
    enabled: !!wsId && !!id,
  });
}

export interface ListCommentsResponse {
  comments: Comment[];
}

export function issueCommentsOptions(api: ApiClient, issueId: string) {
  return queryOptions({
    queryKey: issueKeys.comments(issueId),
    queryFn: () =>
      api.get<ListCommentsResponse>(`/api/issues/${issueId}/comments`),
    select: (data) => data.comments,
    enabled: !!issueId,
  });
}

export interface ListTasksResponse {
  tasks: AgentTask[];
}

export function issueTasksOptions(api: ApiClient, wsId: string, issueId: string) {
  return queryOptions({
    queryKey: issueKeys.tasks(wsId, issueId),
    queryFn: () =>
      api.get<ListTasksResponse>(`/api/workspaces/${wsId}/issues/${issueId}/tasks`),
    select: (data) => data.tasks,
    enabled: !!wsId && !!issueId,
  });
}
