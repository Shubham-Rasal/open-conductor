import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../api/client";
import type { Workspace, WorkspaceEnvVar, WorkspaceMemberRow } from "../types";

export const workspaceKeys = {
  all: ["workspaces"] as const,
  list: () => ["workspaces", "list"] as const,
  detail: (id: string) => ["workspaces", id] as const,
  members: (id: string) => ["workspaces", id, "members"] as const,
  envVars: (id: string) => ["workspaces", id, "env-vars"] as const,
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

export function workspaceDetailOptions(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: workspaceKeys.detail(id),
    queryFn: () => api.get<Workspace>(`/api/workspaces/${id}`),
    enabled: !!id,
  });
}

export function workspaceMembersOptions(api: ApiClient, workspaceId: string) {
  return queryOptions({
    queryKey: workspaceKeys.members(workspaceId),
    queryFn: () =>
      api.get<{ members: WorkspaceMemberRow[] }>(`/api/workspaces/${workspaceId}/members`).then((r) => r.members),
    enabled: !!workspaceId,
  });
}

export function workspaceEnvVarsOptions(api: ApiClient, workspaceId: string) {
  return queryOptions({
    queryKey: workspaceKeys.envVars(workspaceId),
    queryFn: () =>
      api
        .get<{ env_vars: WorkspaceEnvVar[] }>(`/api/workspaces/${workspaceId}/env-vars`)
        .then((r) => r.env_vars ?? []),
    enabled: !!workspaceId,
  });
}
