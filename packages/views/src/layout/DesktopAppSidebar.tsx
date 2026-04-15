import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCoreContext } from "@open-conductor/core/platform";
import {
  workspaceListOptions,
  useWorkspaceStore,
  useDeleteWorkspace,
} from "@open-conductor/core/workspaces";
import { CreateWorkspaceModal } from "./CreateWorkspaceModal";
import type { Workspace } from "@open-conductor/core/types";

function ChatNavIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}

function IssuesNavIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="4" width="4" height="16" rx="1" />
      <rect x="10" y="4" width="4" height="10" rx="1" />
      <rect x="16" y="4" width="4" height="7" rx="1" />
    </svg>
  );
}

function AgentsNavIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="9" width="14" height="10" rx="2" />
      <path d="M12 3v3" />
      <circle cx="12" cy="3" r="1.5" />
      <circle cx="9" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r="1" fill="currentColor" stroke="none" />
      <path d="M9 17h6" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

function WorkspaceGlyph({ className }: { className?: string }) {
  return (
    <span
      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-gradient-to-br from-white/[0.12] to-white/[0.04] backdrop-blur-sm ${className ?? ""}`}
      aria-hidden
    />
  );
}

/** Glass sidebar: workspace tree — Conductor-style layout */
export function DesktopAppSidebar() {
  const location = useLocation();
  const ctx = useCoreContext();
  const navigate = useNavigate();
  const { data: workspaces = [] } = useQuery(workspaceListOptions(ctx.apiClient));
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);
  const deleteWs = useDeleteWorkspace(ctx.apiClient);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [expandedWsId, setExpandedWsId] = useState<string | null>(null);

  const activeId = ctx.workspaceId;

  useEffect(() => {
    if (!activeId) {
      setExpandedWsId(null);
      return;
    }
    setExpandedWsId(activeId);
  }, [activeId]);

  function selectWorkspace(ws: Workspace) {
    switchWorkspace(ws);
    setExpandedWsId(ws.id);
    navigate(`/w/${ws.id}`);
  }

  function goIssues(ws: Workspace) {
    switchWorkspace(ws);
    setExpandedWsId(ws.id);
    navigate(`/w/${ws.id}/issues`);
  }

  function goChat(ws: Workspace) {
    switchWorkspace(ws);
    setExpandedWsId(ws.id);
    navigate(`/w/${ws.id}/chat`);
  }

  function goAgents(ws: Workspace) {
    switchWorkspace(ws);
    setExpandedWsId(ws.id);
    navigate(`/w/${ws.id}/agents`);
  }

  async function handleDelete(ws: Workspace, e: React.MouseEvent) {
    e.stopPropagation();
    if (workspaces.length <= 1) return;
    if (!window.confirm(`Delete workspace “${ws.name}”? This cannot be undone.`)) return;
    setDeleteError(null);
    try {
      await deleteWs.mutateAsync(ws.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete workspace");
    }
  }

  return (
    <nav
      className="flex h-full w-[240px] flex-shrink-0 flex-col border-r border-white/[0.08] bg-sidebar/45 backdrop-blur-3xl backdrop-saturate-150"
      aria-label="Open Conductor"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-1 px-2 pt-2">
        <div className="px-1">
          <div className="mb-1 flex items-center justify-between gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Workspaces
            </span>
            <span className="flex items-center gap-0.5">
              <button
                type="button"
                title="Filter"
                className="rounded p-1 text-muted-foreground opacity-50 hover:bg-white/[0.06] hover:opacity-100"
                aria-label="Filter workspaces"
                disabled
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6h16M8 12h8M10 18h4" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                title="New workspace"
                onClick={() => setCreateOpen(true)}
                className="rounded p-1 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                aria-label="New workspace"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          </div>

          <div className="max-h-[min(40vh,320px)] space-y-0.5 overflow-y-auto pr-0.5">
            {deleteError && <p className="px-1 py-1 text-[11px] text-destructive">{deleteError}</p>}
            {workspaces.map((ws) => {
              const expanded = expandedWsId === ws.id;
              const isWsActive = activeId === ws.id;
              return (
                <div key={ws.id} className="rounded-lg">
                  <div
                    className={`flex items-center gap-1 rounded-lg px-1 py-1 ${
                      isWsActive ? "bg-white/[0.05]" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedWsId((id) => (id === ws.id ? null : ws.id));
                        selectWorkspace(ws);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-white/[0.04]"
                    >
                      <span
                        className={`text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
                        aria-hidden
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5l8 7-8 7V5z" />
                        </svg>
                      </span>
                      <WorkspaceGlyph />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{ws.name}</span>
                    </button>
                    <button
                      type="button"
                      title="Workspace settings"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/w/${ws.id}/settings/general`);
                      }}
                      className={`flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground ${
                        location.pathname.startsWith(`/w/${ws.id}/settings`) ? "bg-white/[0.08] text-foreground" : ""
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      title="Delete workspace"
                      disabled={workspaces.length <= 1 || deleteWs.isPending}
                      onClick={(e) => void handleDelete(ws, e)}
                      className="flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-30"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                      </svg>
                    </button>
                  </div>

                  {expanded && (
                    <div className="ml-5 border-l border-white/[0.06] pl-2">
                      <button
                        type="button"
                        onClick={() => goChat(ws)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] ${
                          location.pathname.includes(`/w/${ws.id}/chat`) && isWsActive
                            ? "bg-white/[0.06] text-foreground"
                            : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                        }`}
                      >
                        <ChatNavIcon className="opacity-80" />
                        Chat
                      </button>
                      <button
                        type="button"
                        onClick={() => goIssues(ws)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] ${
                          location.pathname.includes(`/w/${ws.id}/issues`) && isWsActive
                            ? "bg-white/[0.06] text-foreground"
                            : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                        }`}
                      >
                        <IssuesNavIcon className="opacity-80" />
                        Issues
                      </button>
                      <button
                        type="button"
                        onClick={() => goAgents(ws)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] ${
                          location.pathname.includes(`/w/${ws.id}/agents`) && isWsActive
                            ? "bg-white/[0.06] text-foreground"
                            : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                        }`}
                      >
                        <AgentsNavIcon className="opacity-80" />
                        Agents
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-center border-t border-white/[0.06] px-3 py-3">
        <button
          type="button"
          className="rounded-lg p-2 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
          title="Open Conductor on GitHub"
          aria-label="Open Conductor on GitHub"
          onClick={() => window.open("https://github.com/Shubham-Rasal/open-conductor", "_blank")}
        >
          <GitHubIcon />
        </button>
      </div>

      <CreateWorkspaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(ws) => {
          setCreateOpen(false);
          navigate(`/w/${ws.id}`);
        }}
      />
    </nav>
  );
}
