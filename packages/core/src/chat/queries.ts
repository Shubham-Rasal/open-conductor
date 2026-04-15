import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../api/client";
import type { WorkspaceMessage } from "../types";

export const chatKeys = {
  messages: (workspaceId: string) => ["workspace-messages", workspaceId] as const,
};

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
