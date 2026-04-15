import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCoreContext } from "../platform/CoreProvider";
import { agentKeys } from "./queries";
import type { AgentRuntime as AgentRuntimeRow } from "../types";

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
