import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { workspaceListOptions, useWorkspaceStore } from "@open-conductor/core/workspaces";
import { useCoreContext } from "@open-conductor/core/platform";

/** Syncs Zustand workspace from `/w/:workspaceId` URL. */
export function WorkspaceLayout() {
  const { workspaceId: paramId } = useParams<{ workspaceId: string }>();
  const { apiClient } = useCoreContext();
  const { data: workspaces = [] } = useQuery(workspaceListOptions(apiClient));
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);

  useEffect(() => {
    if (!paramId || !workspaces.length) return;
    const w = workspaces.find((x) => x.id === paramId);
    if (w) switchWorkspace(w);
  }, [paramId, workspaces, switchWorkspace]);

  return (
    <div className="h-full min-h-0 w-full">
      <Outlet />
    </div>
  );
}
