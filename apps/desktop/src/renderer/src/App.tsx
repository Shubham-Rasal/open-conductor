import { HashRouter, Routes, Route, Navigate, NavLink, Outlet } from "react-router-dom";
import { CoreProvider } from "@open-conductor/core/platform";
import { NavigationProvider } from "./platform/NavigationProvider";
import { DashboardGuard } from "@open-conductor/views/layout";
import { IssueListView, IssueDetailView } from "@open-conductor/views/issues";
import { AgentListView } from "@open-conductor/views/agents";


function DashboardLayout() {
  /* hiddenInset traffic lights sit in the top-left of the web view — extra top inset on macOS only */
  const isMac = typeof window !== "undefined" && window.electron?.platform === "darwin";

  return (
    <DashboardGuard>
      <div className="flex h-full">
        {/* Sidebar */}
        <nav className="flex w-48 flex-col border-r border-border bg-sidebar">
          <div
            className={`drag-region shrink-0 px-4 pb-4 ${isMac ? "pt-10" : "pt-4"}`}
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Open Conductor
            </span>
          </div>
          <NavLink
            to="/issues"
            className={({ isActive }) =>
              `mx-2 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`
            }
          >
            Issues
          </NavLink>
          <NavLink
            to="/agents"
            className={({ isActive }) =>
              `mx-2 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`
            }
          >
            Agents
          </NavLink>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </DashboardGuard>
  );
}

export function App() {
  return (
    <CoreProvider
      apiBaseUrl="http://localhost:8080"
      wsUrl="ws://localhost:8080/ws"
    >
      <HashRouter>
        <NavigationProvider>
          <Routes>
            <Route element={<DashboardLayout />}>
              <Route index element={<Navigate to="/issues" replace />} />
              <Route path="/issues" element={<IssueListView />} />
              <Route path="/issues/:issueId" element={<IssueDetailViewWrapper />} />
              <Route path="/agents" element={<AgentListView />} />
            </Route>
          </Routes>
        </NavigationProvider>
      </HashRouter>
    </CoreProvider>
  );
}

// Wrapper to extract :issueId param and pass as prop
import { useParams } from "react-router-dom";
function IssueDetailViewWrapper() {
  const { issueId } = useParams<{ issueId: string }>();
  if (!issueId) return null;
  return <IssueDetailView issueId={issueId} />;
}
