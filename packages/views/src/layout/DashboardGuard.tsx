import { type ReactNode } from "react";
import { useCoreContext } from "@open-conductor/core/platform";

interface DashboardGuardProps {
  children: ReactNode;
}

// No login required — server auto-provisions guest user and local workspace.
// Just wait until CoreProvider has resolved the workspace ID.
export function DashboardGuard({ children }: DashboardGuardProps) {
  const { workspaceId } = useCoreContext();

  if (!workspaceId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Connecting…</p>
      </div>
    );
  }

  return <>{children}</>;
}
