import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCoreContext } from "../platform/CoreProvider";
import { chatKeys } from "./queries";
import type { ProposedPlanIssue, ProposedTask, WorkspaceMessage } from "../types";
import { issueKeys } from "../issues/queries";

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export function usePostWorkspaceMessage() {
  const { apiClient, workspaceId } = useCoreContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      content: string;
      respond_with_assistant?: boolean;
      history?: HistoryMessage[];
      mode?: "plan" | "execute";
      /** Workspace agent id — server picks matching CLI (claude/codex/opencode). Omit for default. */
      agent_id?: string;
      /** Optional model id for this run (overrides agent row if set). */
      model?: string;
    }) =>
      apiClient.post<{ message: WorkspaceMessage; stream_id?: string }>(
        `/api/workspaces/${workspaceId}/messages`,
        body
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.messages(workspaceId) });
    },
  });
}

export function useWorkspacePlan() {
  const { apiClient, workspaceId } = useCoreContext();

  return useMutation({
    mutationFn: (body: { goal: string }) =>
      apiClient.post<{ issues: ProposedPlanIssue[]; raw?: string; error?: string }>(
        `/api/workspaces/${workspaceId}/messages/plan`,
        body
      ),
  });
}

export function useCancelWorkspaceChatStream() {
  const { apiClient, workspaceId } = useCoreContext();

  return useMutation({
    mutationFn: (body: { stream_id: string }) =>
      apiClient.post<{ ok: boolean; reason?: string }>(
        `/api/workspaces/${workspaceId}/messages/cancel`,
        body
      ),
  });
}

export interface EnqueueOrchestratorResult {
  local_id: string;
  issue_id: string;
}

export function useEnqueueOrchestratorBulk() {
  const { apiClient, workspaceId } = useCoreContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body: { tasks: ProposedTask[] }) =>
      apiClient.post<{ results: EnqueueOrchestratorResult[] }>(
        `/api/workspaces/${workspaceId}/tasks/enqueue-bulk`,
        body
      ),
    onSuccess: (data) => {
      for (const r of data.results ?? []) {
        void qc.invalidateQueries({ queryKey: issueKeys.tasks(workspaceId, r.issue_id) });
      }
      void qc.invalidateQueries({ queryKey: issueKeys.list(workspaceId) });
    },
  });
}
