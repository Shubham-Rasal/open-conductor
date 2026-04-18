import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCoreContext } from "../platform/CoreProvider";
import { issueKeys } from "./queries";
import type { Issue, Comment } from "../types";

// ─── Create Issue ──────────────────────────────────────────────────────────

export interface CreateIssueInput {
  workspaceId: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee_type?: string;
  assignee_id?: string;
  agent_assignee_id?: string;
  user_assignee_id?: string;
}

export function useCreateIssue() {
  const { apiClient } = useCoreContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, ...body }: CreateIssueInput) => {
      if (!workspaceId) {
        return Promise.reject(new Error("Workspace is not ready yet."));
      }
      return apiClient.post<Issue>(`/api/workspaces/${workspaceId}/issues`, body);
    },
    onSuccess: (issue) => {
      qc.invalidateQueries({ queryKey: issueKeys.list(issue.workspace_id) });
    },
  });
}

// ─── Update Issue ──────────────────────────────────────────────────────────

export interface UpdateIssueInput {
  workspaceId: string;
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee_type?: string | null;
  assignee_id?: string | null;
  agent_assignee_id?: string | null;
  user_assignee_id?: string | null;
  position?: number;
}

export function useUpdateIssue() {
  const { apiClient } = useCoreContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, id, ...body }: UpdateIssueInput) => {
      if (!workspaceId || !id) {
        return Promise.reject(new Error("Workspace or issue is not ready."));
      }
      return apiClient.patch<Issue>(`/api/workspaces/${workspaceId}/issues/${id}`, body);
    },
    onMutate: async ({ workspaceId, id, ...changes }) => {
      // Optimistic update on detail cache
      await qc.cancelQueries({ queryKey: issueKeys.detail(workspaceId, id) });
      const prev = qc.getQueryData<Issue>(issueKeys.detail(workspaceId, id));
      if (prev) {
        qc.setQueryData(issueKeys.detail(workspaceId, id), { ...prev, ...changes });
      }
      return { prev };
    },
    onError: (_err, { workspaceId, id }, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(issueKeys.detail(workspaceId, id), ctx.prev);
      }
    },
    onSettled: (_data, _err, { workspaceId, id }) => {
      qc.invalidateQueries({ queryKey: issueKeys.detail(workspaceId, id) });
      qc.invalidateQueries({ queryKey: issueKeys.list(workspaceId) });
    },
  });
}

// ─── Delete Issue ──────────────────────────────────────────────────────────

export function useDeleteIssue() {
  const { apiClient } = useCoreContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, id }: { workspaceId: string; id: string }) => {
      if (!workspaceId || !id) {
        return Promise.reject(new Error("Workspace or issue is not ready."));
      }
      return apiClient.delete<void>(`/api/workspaces/${workspaceId}/issues/${id}`);
    },
    onSuccess: (_data, { workspaceId }) => {
      qc.invalidateQueries({ queryKey: issueKeys.list(workspaceId) });
    },
  });
}

// ─── Create Comment ────────────────────────────────────────────────────────

export function useCreateComment() {
  const { apiClient, workspaceId } = useCoreContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ issueId, content }: { issueId: string; content: string }) =>
      apiClient.post<Comment>(`/api/issues/${issueId}/comments`, { content }),
    onSuccess: (_data, { issueId }) => {
      qc.invalidateQueries({ queryKey: issueKeys.comments(issueId) });
      qc.invalidateQueries({ queryKey: issueKeys.tasks(workspaceId, issueId) });
    },
  });
}

/** Cancels queued/running agent tasks for the issue, stops the runner (kills in-flight CLI), and restarts the runner. */
export function useStopIssueAgent() {
  const { apiClient, workspaceId } = useCoreContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (issueId: string) =>
      apiClient.post<{ status: string }>(`/api/workspaces/${workspaceId}/issues/${issueId}/stop-agent`, {}),
    onSettled: (_data, _err, issueId) => {
      void qc.invalidateQueries({ queryKey: issueKeys.tasks(workspaceId, issueId) });
      void qc.invalidateQueries({ queryKey: issueKeys.detail(workspaceId, issueId) });
    },
  });
}
