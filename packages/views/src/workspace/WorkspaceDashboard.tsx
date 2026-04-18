import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { issueListOptions } from "@open-conductor/core/issues";
import { agentListOptions } from "@open-conductor/core/agents";
import { workspaceDetailOptions } from "@open-conductor/core/workspaces";
import { useCoreContext } from "@open-conductor/core/platform";
import type { Issue } from "@open-conductor/core/types";

// ── Tiny icon set ─────────────────────────────────────────────────────────────

function FolderIcon() {
  return (
    <svg className="h-3 w-3 shrink-0 text-muted-foreground/60" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M1.5 4h3.5l1-1.5h6v8.5h-10.5v-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M9.5 2L4 9h4l-1.5 5L14 7H9.5L11 2H9.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function IssuesIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

function AgentsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="5.5" width="11" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5.5" cy="9.5" r="1" fill="currentColor" />
      <circle cx="10.5" cy="9.5" r="1" fill="currentColor" />
      <path d="M8 5.5V3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="2.25" r="0.75" fill="currentColor" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="h-3.5 w-3.5 opacity-40 transition-opacity group-hover:opacity-70" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2.5 6h7M6 2.5l3.5 3.5L6 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Status chip ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
  cancelled: "Cancelled",
  blocked: "Blocked",
};

const STATUS_COLORS: Record<string, string> = {
  backlog:     "text-muted-foreground",
  todo:        "text-sky-500",
  in_progress: "text-amber-500",
  in_review:   "text-violet-500",
  done:        "text-success",
  cancelled:   "text-muted-foreground/50",
  blocked:     "text-destructive",
};

const STATUS_DOT: Record<string, string> = {
  backlog:     "bg-muted-foreground/40",
  todo:        "bg-sky-500",
  in_progress: "bg-amber-500",
  in_review:   "bg-violet-500",
  done:        "bg-success",
  cancelled:   "bg-muted-foreground/30",
  blocked:     "bg-destructive",
};

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-muted-foreground/40"}`}
    />
  );
}

// ── Priority bar ─────────────────────────────────────────────────────────────

const PRIORITY_BARS: Record<string, { filled: number; color: string }> = {
  urgent:      { filled: 4, color: "bg-destructive" },
  high:        { filled: 3, color: "bg-orange-500" },
  medium:      { filled: 2, color: "bg-amber-500" },
  low:         { filled: 1, color: "bg-muted-foreground/40" },
  no_priority: { filled: 0, color: "bg-muted-foreground/30" },
};

function PriorityBars({ priority }: { priority: string }) {
  const cfg = PRIORITY_BARS[priority] ?? { filled: 0, color: "bg-muted-foreground/30" };
  return (
    <span className="flex shrink-0 items-end gap-[2px]" title={priority.replace("_", " ")}>
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={`block w-[3px] rounded-[1px] ${n <= cfg.filled ? cfg.color : "bg-muted-foreground/15"}`}
          style={{ height: `${n * 2.5 + 2}px` }}
        />
      ))}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WorkspaceDashboard() {
  const { apiClient, workspaceId } = useCoreContext();
  const { data: ws }       = useQuery(workspaceDetailOptions(apiClient, workspaceId));
  const { data: issues = [] } = useQuery(issueListOptions(apiClient, workspaceId));
  const { data: agents = [] } = useQuery(agentListOptions(apiClient, workspaceId));

  const base = `/w/${workspaceId}`;

  // Stats
  const totalAgents   = agents.length;
  const onlineAgents  = agents.filter((a) => a.runtime?.status === "online").length;
  const workingAgents = agents.filter((a) => a.status === "working").length;

  const openIssues     = issues.filter((i) => !["done", "cancelled"].includes(i.status));
  const activeIssues   = issues.filter((i) => i.status === "in_progress" || i.status === "in_review");
  const backlogCount   = issues.filter((i) => i.status === "backlog").length;

  // Recent active issues (cap to 5 for sidebar card)
  const recentIssues: Issue[] = [...issues]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-canvas/55 px-5 py-6 backdrop-blur-[2px] sm:px-8 sm:py-8">

      {/* ── Workspace identity ─────────────────────────────────────────────── */}
      <header className="mb-6 shrink-0">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground/60">
          Workspace
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {ws?.name ?? "…"}
        </h1>
        {ws?.working_directory && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <FolderIcon />
            <span className="truncate font-mono text-[11px] text-muted-foreground/70">
              {ws.working_directory}
            </span>
          </div>
        )}
      </header>

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-4">
        <StatCard
          label="Online"
          value={onlineAgents}
          of={totalAgents > 0 ? `/ ${totalAgents}` : undefined}
          accent={onlineAgents > 0}
        />
        {workingAgents > 0 ? (
          <StatCard label="Working" value={workingAgents} highlight />
        ) : (
          <StatCard label="Agents" value={totalAgents} />
        )}
        <StatCard label="Open" value={openIssues.length} of={issues.length > 0 ? `/ ${issues.length}` : undefined} />
        <StatCard label="Active" value={activeIssues.length} className="hidden sm:flex" />
      </div>

      {/* ── Navigation cards ──────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NavCard
          to={`${base}/chat`}
          icon={<BoltIcon />}
          label="Plan"
          description="Chat with AI to plan, create issues, and orchestrate agents"
          badge={workingAgents > 0 ? `${workingAgents} active` : undefined}
          badgeHighlight={workingAgents > 0}
        />
        <NavCard
          to={`${base}/issues`}
          icon={<IssuesIcon />}
          label="Issues"
          description="Track work, assign tasks, and monitor progress"
          badge={openIssues.length > 0 ? `${openIssues.length} open` : "No open issues"}
        />
        <NavCard
          to={`${base}/agents`}
          icon={<AgentsIcon />}
          label="Agents"
          description="Connect, configure, and monitor your AI coding agents"
          badge={
            onlineAgents > 0
              ? `${onlineAgents} online`
              : totalAgents > 0
              ? "All offline"
              : "No agents"
          }
          badgeHighlight={onlineAgents > 0}
        />
      </div>

      {/* ── Recent issues ─────────────────────────────────────────────────── */}
      {recentIssues.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">
              Recent Issues
            </p>
            <Link
              to={`${base}/issues`}
              className="text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
            >
              View all →
            </Link>
          </div>
          <div className="divide-y divide-border/40 rounded-xl border border-border/50 bg-card/30 overflow-hidden">
            {recentIssues.map((issue) => (
              <Link
                key={issue.id}
                to={`${base}/issues/${issue.id}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/30"
              >
                <StatusDot status={issue.status} />
                <span className="min-w-0 flex-1 truncate text-foreground/85">{issue.title}</span>
                <span className={`shrink-0 text-[11px] ${STATUS_COLORS[issue.status] ?? "text-muted-foreground"}`}>
                  {STATUS_LABELS[issue.status] ?? issue.status}
                </span>
                <PriorityBars priority={issue.priority} />
              </Link>
            ))}
            {backlogCount > 6 && (
              <div className="px-4 py-2 text-center text-[11px] text-muted-foreground/50">
                +{backlogCount - 6} more in backlog
              </div>
            )}
          </div>
        </section>
      )}

      {/* Empty state */}
      {issues.length === 0 && agents.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm font-medium text-muted-foreground/70">No activity yet</p>
          <p className="text-xs text-muted-foreground/40">
            Go to <span className="font-medium">Plan</span> to start a conversation, or{" "}
            <span className="font-medium">Agents</span> to connect your first agent.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  of: ofText,
  accent = false,
  highlight = false,
  className = "",
}: {
  label: string;
  value: number;
  of?: string;
  accent?: boolean;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col justify-between rounded-xl border border-border/50 bg-card/30 px-4 py-3 ${className}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/55">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums leading-none">
        <span className={highlight ? "text-amber-500 dark:text-amber-400" : accent ? "text-foreground" : "text-foreground/90"}>
          {value}
        </span>
        {ofText && <span className="ml-1 text-base font-normal text-muted-foreground/40">{ofText}</span>}
      </p>
    </div>
  );
}

function NavCard({
  to,
  icon,
  label,
  description,
  badge,
  badgeHighlight = false,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  badge?: string;
  badgeHighlight?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-3 rounded-xl border border-border/50 bg-card/30 px-4 py-4 transition-colors hover:border-border/80 hover:bg-card/60"
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground/70">{icon}</span>
        <ArrowRightIcon />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground/65">{description}</p>
      </div>
      {badge && (
        <span
          className={`self-start rounded-md px-2 py-0.5 text-[11px] font-medium ${
            badgeHighlight
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "bg-muted/60 text-muted-foreground/70"
          }`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
