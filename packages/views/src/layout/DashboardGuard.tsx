import { type ReactNode } from "react";

interface DashboardGuardProps {
  children: ReactNode;
}

/** Layout shell; workspace selection is handled in the sidebar and per view. */
export function DashboardGuard({ children }: DashboardGuardProps) {
  return <>{children}</>;
}
