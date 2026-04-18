import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { issueListOptions } from "@open-conductor/core/issues";
import { agentListOptions } from "@open-conductor/core/agents";
import { workspaceDetailOptions } from "@open-conductor/core/workspaces";
import { useCoreContext } from "@open-conductor/core/platform";

/**
 * Workspace home: brand hero, minimal shortcuts, workspace context + stats.
 */
export function WorkspaceDashboard() {
  const { apiClient, workspaceId } = useCoreContext();
  const { data: ws } = useQuery(workspaceDetailOptions(apiClient, workspaceId));
  const { data: issues = [] } = useQuery(issueListOptions(apiClient, workspaceId));
  const { data: agents = [] } = useQuery(agentListOptions(apiClient, workspaceId));

  const base = `/w/${workspaceId}`;
  const onlineAgents = agents.filter((a) => a.status !== "offline").length;
  const working = agents.filter((a) => a.status === "working").length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-canvas/55 px-6 py-8 backdrop-blur-[2px]">
      {/* Workspace identity — emphasized, matches wordmark polish */}
      <header className="shrink-0">
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-card/90 to-card/40 p-5 shadow-sm ring-1 ring-border/30 backdrop-blur-sm dark:from-card/50 dark:to-card/20 dark:shadow-[0_0_40px_-8px_rgba(99,102,241,0.12)] sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-brand/[0.06] blur-3xl dark:bg-brand/10" aria-hidden />
          <div className="relative border-l-2 border-brand/45 pl-4 dark:border-brand/55">
            <p className="text-[10px] font-semibold uppercase tracking-[0.38em] text-muted-foreground/90 dark:tracking-[0.42em]">
              Workspace
            </p>
            <h1
              className="mt-2 bg-gradient-to-br from-foreground via-foreground to-brand/55 bg-clip-text text-2xl font-semibold tracking-tight text-transparent dark:from-foreground dark:via-foreground/95 dark:to-brand/70 sm:text-3xl sm:font-semibold"
              style={{ lineHeight: 1.15 }}
            >
              {ws?.name ?? "…"}
            </h1>
            {ws?.working_directory && (
              <div className="mt-3 flex max-w-full items-start gap-2.5 rounded-lg bg-muted/45 px-3 py-2 ring-1 ring-border/40 dark:bg-muted/25">
                <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M2.5 5.5h3l1-1.5h7v9h-11v-7.5z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className="min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed text-muted-foreground/95 dark:text-muted-foreground/85 sm:text-xs">
                  {ws.working_directory}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero — wordmark: layered type + gradient + soft glow */}
      <div className="flex min-h-[min(52vh,420px)] flex-1 flex-col items-center justify-center px-2 py-10 sm:min-h-[min(48vh,480px)] sm:py-16">
        <div className="flex max-w-[min(100%,52rem)] flex-col items-center text-center" aria-hidden>
          <span className="mb-3 block font-medium uppercase tracking-[0.65em] text-foreground/[0.28] dark:text-foreground/[0.38] sm:mb-4 sm:tracking-[0.75em]">
            <span
              className="text-[clamp(0.62rem,1.6vw,0.82rem)]"
              style={{ fontFeatureSettings: '"ss01" 1' }}
            >
              open
            </span>
          </span>
          <span
            className="relative block bg-gradient-to-br from-foreground/50 via-foreground/[0.28] to-brand/70 bg-clip-text font-extralight tracking-[0.08em] text-transparent dark:from-foreground/55 dark:via-brand/35 dark:to-brand/85 sm:tracking-[0.12em]"
            style={{
              fontSize: "clamp(2.75rem, 11vw, 6.25rem)",
              lineHeight: 0.95,
              fontFeatureSettings: '"ss01", "cv01"',
            }}
          >
            <span className="drop-shadow-[0_2px_20px_rgba(0,0,0,0.04)] dark:drop-shadow-[0_0_44px_rgba(129,140,248,0.24)]">
              conductor
            </span>
          </span>
          <div
            className="mt-6 h-px w-[min(12rem,40vw)] bg-gradient-to-r from-transparent via-border/80 to-transparent sm:mt-8"
            aria-hidden
          />
        </div>
      </div>

      {/* Minimal actions */}
      <nav
        className="flex shrink-0 flex-wrap items-center justify-center gap-x-1 gap-y-2 pb-6 text-[13px] sm:text-sm"
        aria-label="Workspace shortcuts"
      >
        <Link
          to={`${base}/chat`}
          className="rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          Plan
        </Link>
        <span className="text-muted-foreground/40" aria-hidden>
          ·
        </span>
        <Link
          to={`${base}/issues`}
          className="rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          Issues
        </Link>
        <span className="text-muted-foreground/40" aria-hidden>
          ·
        </span>
        <Link
          to={`${base}/agents`}
          className="rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          Agents
        </Link>
      </nav>

      {/* Stats — quiet strip */}
      <div className="mx-auto mt-auto flex max-w-lg flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-border/50 bg-card/30 px-4 py-2.5 text-[12px] text-muted-foreground">
        <span>
          <span className="tabular-nums text-foreground/90">{onlineAgents}</span> agents
        </span>
        {working > 0 && (
          <>
            <span className="text-border">·</span>
            <span className="text-amber-600 dark:text-amber-400/95">
              <span className="tabular-nums font-medium">{working}</span> working
            </span>
          </>
        )}
        <span className="text-border">·</span>
        <span>
          <span className="tabular-nums text-foreground/90">{issues.length}</span> issue{issues.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
