import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCoreContext } from "@open-conductor/core/platform";
import {
  workspaceListOptions,
  useWorkspaceStore,
  useDeleteWorkspace,
} from "@open-conductor/core/workspaces";
import { CreateWorkspaceModal } from "./CreateWorkspaceModal";
import { OpenConductorLogo } from "./OpenConductorLogo";
import { WorkspaceIdenticon } from "./WorkspaceIdenticon";
import type { Workspace } from "@open-conductor/core/types";
import { ocTransitionFast } from "../motion/presets";
import { getColorScheme, setColorScheme, type ColorScheme } from "../theme";
import { useServerHealth } from "@open-conductor/core/hooks";

// ── Icons ─────────────────────────────────────────────────────────────────────

function Icon({ d, className, children }: { d: string | ReactNode; className?: string; children?: ReactNode }) {
  return (
    <svg className={className ?? "h-[14px] w-[14px]"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {typeof d === "string" ? <path d={d} /> : d}
      {children}
    </svg>
  );
}

/** Small stroke icons — match GitHub control in footer */
function ServerGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="10" height="4" rx="0.75" />
      <rect x="2" y="8" width="10" height="4" rx="0.75" />
      <circle cx="4.25" cy="4" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="4.25" cy="10" r="0.55" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DatabaseGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <ellipse cx="7" cy="3.25" rx="4" ry="1.6" />
      <path d="M3 3.25v2.5c0 .88 1.79 1.6 4 1.6s4-.72 4-1.6v-2.5" />
      <path d="M3 7.25v2.5c0 .88 1.79 1.6 4 1.6s4-.72 4-1.6v-2.5" />
    </svg>
  );
}

function ServiceStatus({ ok, title, children }: { ok: boolean; title: string; children: ReactNode }) {
  const status = ok ? "Connected" : "Unavailable";
  return (
    <span
      className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-muted-foreground/55 transition-colors hover:text-muted-foreground/80"
      title={`${title} — ${status}`}
    >
      <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
        {ok && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/35" />
        )}
        <span
          className={`relative h-1.5 w-1.5 rounded-full shadow-sm ${
            ok ? "bg-emerald-500 shadow-emerald-500/40" : "bg-muted-foreground/35"
          }`}
        />
      </span>
      <span className="opacity-90">{children}</span>
    </span>
  );
}

const NAV_ITEMS = [
  {
    key: "chat",
    label: "Chat",
    path: (wsId: string) => `/w/${wsId}/chat`,
    icon: (
      <>
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
  },
  {
    key: "issues",
    label: "Issues",
    path: (wsId: string) => `/w/${wsId}/issues`,
    icon: (
      <>
        <rect x="4" y="4" width="4" height="16" rx="1" />
        <rect x="10" y="4" width="4" height="10" rx="1" />
        <rect x="16" y="4" width="4" height="7" rx="1" />
      </>
    ),
  },
  {
    key: "agents",
    label: "Agents",
    path: (wsId: string) => `/w/${wsId}/agents`,
    icon: (
      <>
        <rect x="5" y="9" width="14" height="10" rx="2" />
        <path d="M12 3v3" />
        <circle cx="12" cy="3" r="1.5" />
        <circle cx="9" cy="14" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="14" r="1" fill="currentColor" stroke="none" />
        <path d="M9 17h6" />
      </>
    ),
  },
] as const;

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function DesktopAppSidebar() {
  const location = useLocation();
  const ctx = useCoreContext();
  const navigate = useNavigate();
  const { data: workspaces = [] } = useQuery(workspaceListOptions(ctx.apiClient));
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);
  const deleteWs = useDeleteWorkspace(ctx.apiClient);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  /** Which workspace rows show Chat / Issues / Agents — independent per workspace; only chevron toggles remove. */
  const [expandedWsIds, setExpandedWsIds] = useState<Set<string>>(() => new Set());
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() => getColorScheme());

  const activeId = ctx.workspaceId;
  const expandedSeedDone = useRef(false);

  /** First time we know the active workspace, open its nav so the app doesn’t look empty. */
  useEffect(() => {
    if (expandedSeedDone.current || !activeId) return;
    expandedSeedDone.current = true;
    setExpandedWsIds((prev) => (prev.size === 0 ? new Set([activeId]) : prev));
  }, [activeId]);

  const { daemon, db } = useServerHealth();

  function handleThemeToggle() {
    const next: ColorScheme = colorScheme === "dark" ? "light" : "dark";
    setColorScheme(next);
    setColorSchemeState(next);
  }

  function toggleWorkspaceNav(wsId: string) {
    setExpandedWsIds((prev) => {
      const next = new Set(prev);
      if (next.has(wsId)) next.delete(wsId);
      else next.add(wsId);
      return next;
    });
  }

  function nav(ws: Workspace, path: string) {
    switchWorkspace(ws);
    setExpandedWsIds((prev) => {
      const next = new Set(prev);
      next.add(ws.id);
      return next;
    });
    navigate(path);
  }

  async function handleDelete(ws: Workspace, e: React.MouseEvent) {
    e.stopPropagation();
    if (workspaces.length <= 1) return;
    if (!window.confirm(`Delete workspace "${ws.name}"? This cannot be undone.`)) return;
    setDeleteError(null);
    try {
      await deleteWs.mutateAsync(ws.id);
      setExpandedWsIds((prev) => {
        const next = new Set(prev);
        next.delete(ws.id);
        return next;
      });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete workspace");
    }
  }

  return (
    <nav
      className="flex h-full w-[220px] flex-shrink-0 flex-col border-r border-black/[0.06] bg-sidebar/80 backdrop-blur-3xl backdrop-saturate-150 dark:border-white/[0.07]"
      aria-label="Open Conductor"
    >
      {/* Brand */}
      <div className="mx-3 mb-1 flex shrink-0 items-center gap-2 border-b border-black/[0.05] pb-3 pt-1 dark:border-white/[0.06]">
        <OpenConductorLogo size={26} />
        <span className="truncate text-[12px] font-semibold tracking-tight text-foreground/85">Open Conductor</span>
      </div>

      {/* Workspace list */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
        {deleteError && (
          <p className="mx-3 mb-1 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {deleteError}
          </p>
        )}

        {workspaces.map((ws) => {
          const expanded = expandedWsIds.has(ws.id);
          const isWsActive = activeId === ws.id;

          return (
            <div key={ws.id}>
              {/* Workspace row */}
              <div
                className={`group mx-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${
                  isWsActive
                    ? "bg-black/[0.05] dark:bg-white/[0.05]"
                    : "hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleWorkspaceNav(ws.id)}
                  className="flex h-7 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-black/[0.05] hover:text-muted-foreground dark:hover:bg-white/[0.06]"
                  aria-expanded={expanded}
                  aria-label={expanded ? `Collapse ${ws.name} navigation` : `Expand ${ws.name} navigation`}
                >
                  <span
                    className={`inline-block transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
                    aria-hidden
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5l8 7-8 7V5z" />
                    </svg>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => nav(ws, `/w/${ws.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <WorkspaceIdenticon workspaceId={ws.id} label={ws.name} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-none text-foreground">
                    {ws.name}
                  </span>
                </button>

                {/* Settings + Delete — visible only on hover */}
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    title="Settings"
                    onClick={(e) => {
                      e.stopPropagation();
                      switchWorkspace(ws);
                      setExpandedWsIds((prev) => {
                        const next = new Set(prev);
                        next.add(ws.id);
                        return next;
                      });
                      navigate(`/w/${ws.id}/settings/general`);
                    }}
                    className="rounded p-1 text-muted-foreground/60 hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.06]"
                  >
                    <Icon
                      d={
                        <>
                          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      }
                    />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    disabled={workspaces.length <= 1 || deleteWs.isPending}
                    onClick={(e) => void handleDelete(ws, e)}
                    className="rounded p-1 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive disabled:opacity-20"
                  >
                    <Icon d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                  </button>
                </div>
              </div>

              {/* Nav items */}
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    key={`nav-${ws.id}`}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={ocTransitionFast}
                    className="mx-2 mb-1 mt-0.5 space-y-0.5"
                  >
                    {NAV_ITEMS.map((item) => {
                      const href = item.path(ws.id);
                      const active = location.pathname.includes(href) && isWsActive;
                      return (
                        <motion.button
                          key={item.key}
                          type="button"
                          onClick={() => nav(ws, href)}
                          whileHover={{ x: 2 }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          className={`flex w-full items-center gap-2.5 rounded-md px-7 py-[5px] text-[12px] font-medium transition-colors ${
                            active
                              ? "bg-black/[0.07] text-foreground dark:bg-white/[0.07]"
                              : "text-muted-foreground/70 hover:bg-black/[0.04] hover:text-foreground/80 dark:hover:bg-white/[0.04]"
                          }`}
                        >
                          <svg
                            className="h-[13px] w-[13px] flex-shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={active ? "2" : "1.7"}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            {item.icon}
                          </svg>
                          {item.label}
                        </motion.button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* Add workspace */}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="mx-2 mt-0.5 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] text-muted-foreground/50 transition-colors hover:bg-black/[0.04] hover:text-muted-foreground dark:hover:bg-white/[0.04]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          New workspace
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-black/[0.06] px-3 py-2.5 dark:border-white/[0.05]">
        <button
          type="button"
          className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-black/[0.06] hover:text-muted-foreground dark:hover:bg-white/[0.06]"
          title="Open on GitHub"
          onClick={() => window.open("https://github.com/Shubham-Rasal/open-conductor", "_blank")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
            <path d="M9 18c-4.51 2-5-2-7-2" />
          </svg>
        </button>

        {/* Service health — icon + live dot; tooltips for full labels */}
        <div
          className="flex min-w-0 items-center gap-0.5 rounded-lg border border-black/[0.06] bg-black/[0.03] px-1.5 py-1 dark:border-white/[0.06] dark:bg-white/[0.03]"
          aria-label="Service status"
        >
          <ServiceStatus ok={daemon} title="Server">
            <ServerGlyph className="h-[13px] w-[13px]" />
          </ServiceStatus>
          <span className="mx-0.5 h-3 w-px shrink-0 bg-border/60" aria-hidden />
          <ServiceStatus ok={db} title="Database">
            <DatabaseGlyph className="h-[13px] w-[13px]" />
          </ServiceStatus>
        </div>

        <button
          type="button"
          className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-black/[0.06] hover:text-muted-foreground dark:hover:bg-white/[0.06]"
          title={colorScheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-label={colorScheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={handleThemeToggle}
        >
          {colorScheme === "dark" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      <CreateWorkspaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(ws) => {
          setCreateOpen(false);
          switchWorkspace(ws);
          setExpandedWsIds((prev) => {
            const next = new Set(prev);
            next.add(ws.id);
            return next;
          });
          navigate(`/w/${ws.id}`);
        }}
      />
    </nav>
  );
}
