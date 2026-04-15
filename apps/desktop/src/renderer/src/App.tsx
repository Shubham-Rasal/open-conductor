import { HashRouter, Routes, Route, Navigate, Outlet, useParams, useLocation } from "react-router-dom";
import { CoreProvider } from "@open-conductor/core/platform";
import { NavigationProvider } from "./platform/NavigationProvider";
import { DashboardGuard, DesktopAppSidebar } from "@open-conductor/views/layout";
import { IssueListView, IssueDetailView } from "@open-conductor/views/issues";
import { AgentListView } from "@open-conductor/views/agents";
import {
  WorkspaceLayout,
  WorkspaceDashboard,
  WorkspaceChatView,
  WorkspaceSettingsView,
} from "@open-conductor/views/workspace";

function isElectronMac(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { electron?: { platform: string } };
  return w.electron?.platform === "darwin";
}

function isWorkspaceSettingsPath(pathname: string): boolean {
  return /\/w\/[^/]+\/settings(\/|$)/.test(pathname);
}

function DashboardLayout() {
  const isMac = isElectronMac();
  const { pathname } = useLocation();
  const settingsFullScreen = isWorkspaceSettingsPath(pathname);

  return (
    <DashboardGuard>
      <div className="relative flex h-full flex-col">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_-20%,rgba(0,0,0,0.06),transparent_55%)] dark:bg-[radial-gradient(ellipse_90%_70%_at_50%_-20%,rgba(255,255,255,0.05),transparent_55%)]"
          aria-hidden
        />
        <div
          className={`drag-region relative z-10 h-10 w-full shrink-0 bg-background dark:bg-background ${isMac ? "pl-[78px]" : ""}`}
          aria-hidden
        />
        {settingsFullScreen ? (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background/95 dark:bg-background/90">
            <Outlet />
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 bg-background/75 backdrop-blur-2xl dark:bg-background/70">
            <DesktopAppSidebar />

            <main className="relative min-w-0 flex-1 overflow-hidden border-l border-border/60 bg-background/80 backdrop-blur-3xl dark:border-white/[0.06] dark:bg-background/70">
              <Outlet />
            </main>
          </div>
        )}
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
              {/* Old bookmarks / links — no ConductorHomeView import required */}
              <Route path="/home" element={<Navigate to="/issues" replace />} />
              <Route path="/w/:workspaceId" element={<WorkspaceLayout />}>
                <Route index element={<WorkspaceDashboard />} />
                <Route path="chat" element={<WorkspaceChatView />} />
                <Route path="issues" element={<IssueListView />} />
                <Route path="issues/:issueId" element={<IssueDetailViewWrapper />} />
                <Route path="agents" element={<AgentListView />} />
                <Route path="settings" element={<WorkspaceSettingsView />} />
                <Route path="settings/:section" element={<WorkspaceSettingsView />} />
              </Route>
              <Route path="/issues" element={<LegacyIssuesRedirect />} />
              <Route path="/issues/:issueId" element={<LegacyIssueDetailRedirect />} />
              <Route path="/agents" element={<LegacyAgentsRedirect />} />
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

function NoWorkspacePlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-lg font-medium text-foreground">No workspace selected</p>
      <p className="max-w-sm text-sm text-muted-foreground">Create or choose a workspace in the sidebar.</p>
    </div>
  );
}

function LegacyIssuesRedirect() {
  const id = typeof localStorage !== "undefined" ? localStorage.getItem("oc_workspace_id") : null;
  if (!id) return <NoWorkspacePlaceholder />;
  return <Navigate to={`/w/${id}/issues`} replace />;
}

function LegacyIssueDetailRedirect() {
  const { issueId } = useParams<{ issueId: string }>();
  const id = typeof localStorage !== "undefined" ? localStorage.getItem("oc_workspace_id") : null;
  if (!issueId) return null;
  if (!id) return <NoWorkspacePlaceholder />;
  return <Navigate to={`/w/${id}/issues/${issueId}`} replace />;
}

function LegacyAgentsRedirect() {
  const id = typeof localStorage !== "undefined" ? localStorage.getItem("oc_workspace_id") : null;
  if (!id) return <NoWorkspacePlaceholder />;
  return <Navigate to={`/w/${id}/agents`} replace />;
}
