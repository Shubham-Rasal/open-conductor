import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "../api/client";
import type { Workspace } from "../types";
import type { ListWorkspacesResponse } from "./queries";
import { workspaceKeys, workspaceListOptions } from "./queries";
import { useWorkspaceStore } from "./store";

export function useCreateWorkspace(api: ApiClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      slug?: string;
      prefix?: string;
      description?: string | null;
      type?: "local" | "remote";
      connection_url?: string | null;
      working_directory?: string | null;
    }) => api.post<Workspace>("/api/workspaces", body),
    onSuccess: (newWs) => {
      useWorkspaceStore.getState().switchWorkspace(newWs);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: workspaceKeys.list() });
    },
  });
}

export function useUpdateWorkspace(api: ApiClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      name?: string;
      description?: string | null;
      prefix?: string;
      type?: "local" | "remote";
      connection_url?: string | null;
      working_directory?: string | null;
    }) => {
      const { id, ...body } = vars;
      return api.patch<Workspace>(`/api/workspaces/${id}`, body);
    },
    onSuccess: (ws) => {
      if (useWorkspaceStore.getState().workspace?.id === ws.id) {
        useWorkspaceStore.getState().switchWorkspace(ws);
      }
    },
    onSettled: (_, __, vars) => {
      qc.invalidateQueries({ queryKey: workspaceKeys.list() });
      qc.invalidateQueries({ queryKey: workspaceKeys.detail(vars.id) });
    },
  });
}

export function useDeleteWorkspace(api: ApiClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/api/workspaces/${id}`),
    onSuccess: async (_, deletedId) => {
      const cur = useWorkspaceStore.getState().workspace?.id;
      if (cur === deletedId) {
        const fresh = await qc.fetchQuery({ ...workspaceListOptions(api), staleTime: 0 });
        const list = Array.isArray(fresh)
          ? fresh
          : (fresh as ListWorkspacesResponse).workspaces;
        useWorkspaceStore.getState().hydrateWorkspace(list);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: workspaceKeys.list() });
    },
  });
}
