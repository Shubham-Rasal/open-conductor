import { useLayoutEffect } from "react";
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

  // Before paint: keep global workspace store aligned with the URL so CoreProvider and queries
  // never flash the previous workspace’s data after navigation.
  useLayoutEffect(() => {
    if (!paramId || !workspaces.length) return;
    const w = workspaces.find((x) => x.id === paramId);
    if (w) switchWorkspace(w);
  }, [paramId, workspaces, switchWorkspace]);

  return (
    <div className="h-full min-h-0 w-full">
      {/* Remount workspace views when switching workspaces — drops stale UI/state from the prior ws */}
      <Outlet key={paramId ?? ""} />
    </div>
  );
}
