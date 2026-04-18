import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../api/client";
import type { WorkspaceMessage } from "../types";

export const chatKeys = {
  messages: (workspaceId: string) => ["workspace-messages", workspaceId] as const,
  agentModels: (provider: string) => ["agent-models", provider] as const,
};

/** Models returned from GET /api/agent-models (CLI / cloud APIs). */
export interface AgentModelOption {
  id: string;
  label?: string;
}

export function workspaceMessagesOptions(apiClient: ApiClient, workspaceId: string, limit = 50, offset = 0) {
  return queryOptions({
    queryKey: [...chatKeys.messages(workspaceId), limit, offset],
    enabled: !!workspaceId,
    queryFn: async () => {
      const res = await apiClient.get<{ messages: WorkspaceMessage[] }>(
        `/api/workspaces/${workspaceId}/messages?limit=${limit}&offset=${offset}`
      );
      return res.messages;
    },
  });
}

export function agentModelsOptions(
  api: ApiClient,
  provider: "claude" | "codex" | "opencode" | null
) {
  return queryOptions({
    queryKey: [...chatKeys.agentModels(provider ?? "none")],
    queryFn: async () => {
      try {
        return await api.get<AgentModelOption[]>(
          `/api/agent-models?provider=${encodeURIComponent(provider!)}`
        );
      } catch {
        return [];
      }
    },
    enabled: provider === "claude" || provider === "codex" || provider === "opencode",
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
