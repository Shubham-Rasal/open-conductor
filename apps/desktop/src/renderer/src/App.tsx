import { HashRouter, Routes, Route, Navigate, Outlet, useParams } from "react-router-dom";
import { CoreProvider } from "@open-conductor/core/platform";
import { NavigationProvider } from "./platform/NavigationProvider";
import { DashboardGuard, DesktopAppSidebar } from "@open-conductor/views/layout";
import { IssueListView, IssueDetailView } from "@open-conductor/views/issues";
import { AgentListView } from "@open-conductor/views/agents";

function DashboardLayout() {
  return (
    <DashboardGuard>
      <div className="flex h-full">
        <DesktopAppSidebar />

        <main className="min-w-0 flex-1 overflow-hidden bg-canvas">
          <Outlet />
        </main>
      </div>
    </DashboardGuard>
  );
}

export function App() {
  return (
    <CoreProvider apiBaseUrl="http://localhost:8080" wsUrl="ws://localhost:8080/ws">
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

function IssueDetailViewWrapper() {
  const { issueId } = useParams<{ issueId: string }>();
  if (!issueId) return null;
  return <IssueDetailView issueId={issueId} />;
}
