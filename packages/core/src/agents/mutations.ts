import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCoreContext } from "../platform/CoreProvider";
import { agentKeys } from "./queries";
import type { Agent, AgentRuntime as AgentRuntimeRow } from "../types";

export function useSpawnAgent() {
  const { apiClient, workspaceId } = useCoreContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (agentId: string) =>
      apiClient.post<AgentRuntimeRow>(`/api/workspaces/${workspaceId}/agents/${agentId}/spawn`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: agentKeys.list(workspaceId) });
    },
  });
}

export function useStopManagedAgent() {
  const { apiClient, workspaceId } = useCoreContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (agentId: string) =>
      apiClient.post<{ status: string }>(`/api/workspaces/${workspaceId}/agents/${agentId}/stop`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: agentKeys.list(workspaceId) });
    },
  });
}

export function useUpdateAgent() {
  const { apiClient, workspaceId } = useCoreContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (vars: {
      agentId: string;
      name?: string;
      instructions?: string;
      model?: string | null;
      max_concurrent_tasks?: number;
    }) => {
      const { agentId, ...body } = vars;
      return apiClient.patch<Agent>(`/api/workspaces/${workspaceId}/agents/${agentId}`, body);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: agentKeys.list(workspaceId) });
    },
  });
}
