import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCoreContext } from "../platform/CoreProvider";
import { chatKeys } from "./queries";
import type { ProposedPlanIssue, WorkspaceMessage } from "../types";

export function usePostWorkspaceMessage() {
  const { apiClient, workspaceId } = useCoreContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body: { content: string; respond_with_assistant?: boolean }) =>
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
