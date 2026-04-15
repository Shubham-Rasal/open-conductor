import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCoreContext } from "@open-conductor/core/platform";
import {
  workspaceListOptions,
  useWorkspaceStore,
  useDeleteWorkspace,
} from "@open-conductor/core/workspaces";
import { WorkspaceSetupView } from "./WorkspaceSetupView";
import { WorkspaceSettingsModal } from "./WorkspaceSettingsModal";
import type { Workspace } from "@open-conductor/core/types";

function IssuesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function AgentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="5" y="6" width="14" height="12" rx="2" />
      <path d="M9 10h6M9 14h4" strokeLinecap="round" />
      <circle cx="12" cy="4" r="2" />
    </svg>
  );
}

function isElectronMac(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { electron?: { platform: string } };
  return w.electron?.platform === "darwin";
}

function TypeBadge({ type }: { type: Workspace["type"] }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        type === "remote"
          ? "bg-brand/15 text-brand"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {type === "remote" ? "Remote" : "Local"}
    </span>
  );
}

/** macOS Electron: traffic lights overlap the web view — pad the top drag region */
export function DesktopAppSidebar() {
  const isMac = isElectronMac();
  const ctx = useCoreContext();
  const navigate = useNavigate();
  const { data: workspaces = [] } = useQuery(workspaceListOptions(ctx.apiClient));
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);
  const deleteWs = useDeleteWorkspace(ctx.apiClient);

  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeId = ctx.workspaceId;
  const workspaceName = workspaces.find((w) => w.id === activeId)?.name ?? "Workspace";

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  function handlePick(ws: Workspace) {
    switchWorkspace(ws);
    setMenuOpen(false);
    navigate("/issues");
  }

  async function handleDelete(ws: Workspace, e: React.MouseEvent) {
    e.stopPropagation();
    if (workspaces.length <= 1) return;
    if (!window.confirm(`Delete workspace “${ws.name}”? This cannot be undone.`)) return;
    setDeleteError(null);
    try {
      await deleteWs.mutateAsync(ws.id);
      setMenuOpen(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete workspace");
    }
  }

  return (
    <nav className="flex w-[220px] flex-shrink-0 flex-col border-r border-border/80 bg-sidebar">
      <div className={`drag-region shrink-0 px-3 pb-3 ${isMac ? "pt-10" : "pt-4"}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/90">
          Open Conductor
        </p>
      </div>

      <div className="relative px-2 pb-2" ref={menuRef}>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-xl border border-border/60 bg-sidebar-accent/35 px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent/55"
        >
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-sidebar-foreground">
            {workspaceName}
          </span>
          <span className="flex flex-shrink-0 items-center gap-0.5 text-muted-foreground">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </button>

        {menuOpen && (
          <div
            role="listbox"
            className="absolute left-2 right-2 top-full z-50 mt-1 max-h-[min(70vh,420px)] overflow-y-auto rounded-xl border border-border/80 bg-popover p-1 shadow-lg"
          >
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                className="group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-accent/60"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={ws.id === activeId}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => handlePick(ws)}
                >
                  <span className="w-4 flex-shrink-0 text-center text-muted-foreground">
                    {ws.id === activeId ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{ws.name}</span>
                  <TypeBadge type={ws.type} />
                </button>
                <button
                  type="button"
                  title="Workspace settings"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSettingsWorkspaceId(ws.id);
                    setMenuOpen(false);
                  }}
                  className="flex-shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Delete workspace"
                  disabled={workspaces.length <= 1 || deleteWs.isPending}
                  onClick={(e) => void handleDelete(ws, e)}
                  className="flex-shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            ))}
            <div className="my-1 border-t border-border/60" />
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-foreground hover:bg-accent/60"
              onClick={() => {
                setMenuOpen(false);
                setCreateOpen(true);
              }}
            >
              <span className="text-lg leading-none text-muted-foreground">+</span>
              Create workspace
            </button>
            {deleteError && (
              <p className="px-3 py-2 text-xs text-destructive">{deleteError}</p>
            )}
          </div>
        )}
      </div>

      <WorkspaceSettingsModal
        workspaceId={settingsWorkspaceId}
        open={settingsWorkspaceId !== null}
        onClose={() => setSettingsWorkspaceId(null)}
      />

      {createOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <WorkspaceSetupView
              compact
              onCancel={() => setCreateOpen(false)}
              onCreated={() => {
                setCreateOpen(false);
                navigate("/issues");
              }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-0.5 px-2 pb-4">
        <NavLink
          to="/issues"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
              isActive
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm"
                : "text-sidebar-foreground/90 hover:bg-sidebar-accent/45"
            }`
          }
        >
          <IssuesIcon className="opacity-80" />
          Issues
        </NavLink>
        <NavLink
          to="/agents"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
              isActive
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm"
                : "text-sidebar-foreground/90 hover:bg-sidebar-accent/45"
            }`
          }
        >
          <AgentsIcon className="opacity-80" />
          Agents
        </NavLink>
      </div>
    </nav>
  );
}
