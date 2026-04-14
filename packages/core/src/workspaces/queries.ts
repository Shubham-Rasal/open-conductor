import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../api/client";
import type { Workspace } from "../types";

export const workspaceKeys = {
  all: ["workspaces"] as const,
  list: () => ["workspaces", "list"] as const,
  detail: (id: string) => ["workspaces", id] as const,
};

export interface ListWorkspacesResponse {
  workspaces: Workspace[];
}

export function workspaceListOptions(api: ApiClient) {
  return queryOptions({
    queryKey: workspaceKeys.list(),
    queryFn: () => api.get<ListWorkspacesResponse>("/api/workspaces"),
    select: (data) => data.workspaces,
  });
}
