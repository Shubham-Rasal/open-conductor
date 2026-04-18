import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { issueListOptions } from "@open-conductor/core/issues";
import { agentListOptions } from "@open-conductor/core/agents";
import { workspaceListOptions } from "@open-conductor/core/workspaces";
import { useCoreContext } from "@open-conductor/core/platform";
import type { Issue, Agent } from "@open-conductor/core/types";
import { useNavigation } from "../navigation";
import { CreateIssueModal } from "./CreateIssueModal";
import { ProviderIcon, resolveProviderForAgent } from "../agents/ProviderIcon";
import { workspaceMembersOptions } from "@open-conductor/core/workspaces";
import type { WorkspaceMemberRow } from "@open-conductor/core/types";
import { resolveAgent, resolveMember } from "./issueAssignee";

// ─── Column config ────────────────────────────────────────────────────────────

type StatusKey =
  | "backlog"
  | "todo"
  | "in_progress"
  | "blocked"
  | "in_review"
  | "done";

const COLUMNS: { key: StatusKey; label: string; dot: string; header: string; ring: string }[] = [
  { key: "backlog",     label: "Backlog",     dot: "bg-muted-foreground",  header: "border-border/80 bg-muted/40",   ring: "ring-muted-foreground/25" },
  { key: "todo",        label: "Todo",        dot: "bg-foreground/80",     header: "border-border bg-background/50", ring: "ring-foreground/10" },
  { key: "in_progress", label: "In Progress", dot: "bg-amber-500",         header: "border-amber-500/25 bg-amber-500/10", ring: "ring-amber-500/20" },
  { key: "blocked",     label: "Blocked",     dot: "bg-destructive",       header: "border-destructive/30 bg-destructive/10", ring: "ring-destructive/20" },
  { key: "in_review",   label: "In Review",   dot: "bg-emerald-500",       header: "border-emerald-500/25 bg-emerald-500/10", ring: "ring-emerald-500/20" },
  { key: "done",        label: "Done",        dot: "bg-sky-500",           header: "border-sky-500/25 bg-sky-500/10", ring: "ring-sky-500/20" },
];

// ─── Priority ─────────────────────────────────────────────────────────────────

type PriorityBadgeDef = { label: string; cls: string; bars: 0 | 1 | 2 | 3 | 4 };

const NO_PRIORITY_BADGE: PriorityBadgeDef = { label: "", cls: "", bars: 0 };

const PRIORITY_BADGE: Record<string, PriorityBadgeDef> = {
  urgent:      { label: "Urgent",  cls: "bg-red-500/15 text-red-400 border-red-500/25", bars: 4 },
  high:        { label: "High",    cls: "bg-orange-500/15 text-orange-400 border-orange-500/25", bars: 3 },
  medium:      { label: "Medium",  cls: "bg-amber-500/12 text-amber-400 border-amber-500/20", bars: 2 },
  low:         { label: "Low",     cls: "bg-sky-500/12 text-sky-400 border-sky-500/20", bars: 1 },
  no_priority: NO_PRIORITY_BADGE,
};

function priorityBadge(priority: string): PriorityBadgeDef {
  return PRIORITY_BADGE[priority] ?? NO_PRIORITY_BADGE;
}

function PriorityBars({ count }: { count: 0 | 1 | 2 | 3 | 4 }) {
  const heights = [4, 7, 10, 13];
  return (
    <span className="flex h-[13px] items-end gap-[3px]" aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm ${i < count ? "bg-current opacity-100" : "bg-current opacity-20"}`}
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

// ─── Assignee avatar ──────────────────────────────────────────────────────────

function AgentAvatar({
  agent,
  size = "md",
}: {
  agent: Agent | undefined;
  size?: "sm" | "md";
}) {
  if (!agent) return null;
  const initials = agent.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const statusRing: Record<string, string> = {
    idle: "ring-emerald-500/80",
    working: "ring-brand/90",
    blocked: "ring-amber-500/80",
    error: "ring-destructive/80",
    offline: "ring-muted-foreground/50",
  };
  const dim = size === "sm" ? "h-5 w-5 text-[8px] ring-1" : "h-7 w-7 text-[10px] ring-2";
  return (
    <span
      title={agent.name}
      className={`inline-flex ${dim} items-center justify-center rounded-full border border-border/60 bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-sm ${statusRing[agent.status] ?? "ring-muted-foreground/40"}`}
    >
      {initials}
    </span>
  );
}

// ─── Issue card ───────────────────────────────────────────────────────────────

function MemberAvatar({ member, size = "md" }: { member: WorkspaceMemberRow; size?: "sm" | "md" }) {
  const initials = member.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const dim = size === "sm" ? "h-5 w-5 text-[8px]" : "h-7 w-7 text-[10px]";
  return (
    <span
      title={member.name}
      className={`inline-flex ${dim} items-center justify-center rounded-full border border-border/60 bg-secondary font-semibold text-secondary-foreground`}
    >
      {initials}
    </span>
  );
}

function IssueCard({
  issue,
  agent,
  member,
  prefix,
  onClick,
}: {
  issue: Issue;
  agent: Agent | undefined;
  member: WorkspaceMemberRow | undefined;
  prefix: string;
  onClick: () => void;
}) {
  const badge = priorityBadge(issue.priority);
  const identifier = issue.number != null ? `${prefix}-${issue.number}` : issue.id.slice(0, 6);
  const assigneeProvider = resolveProviderForAgent(agent);

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-border/70 bg-card/95 px-3.5 py-3 shadow-sm transition-all hover:border-border hover:bg-card hover:shadow-md"
    >
      <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">{identifier}</p>

      <p className="mb-1.5 text-[14px] font-semibold leading-snug text-foreground line-clamp-2">
        {issue.title}
      </p>

      {issue.description && (
        <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground line-clamp-2">
          {issue.description}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {badge.label ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
            >
              <PriorityBars count={badge.bars} />
              {badge.label}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground/60">—</span>
          )}
        </div>
        {(assigneeProvider || agent || member) && (
          <div className="flex shrink-0 items-center">
            {member ? (
              <MemberAvatar member={member} />
            ) : assigneeProvider ? (
              <span className="flex items-center" title={agent?.name ?? assigneeProvider}>
                <ProviderIcon provider={assigneeProvider} className="h-5 w-5" />
              </span>
            ) : (
              <AgentAvatar agent={agent} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Board column ─────────────────────────────────────────────────────────────

function BoardColumn({
  col,
  issues,
  agents,
  members,
  prefix,
  onCardClick,
  onAdd,
}: {
  col: (typeof COLUMNS)[number];
  issues: Issue[];
  agents: Agent[];
  members: WorkspaceMemberRow[];
  prefix: string;
  onCardClick: (id: string) => void;
  onAdd: () => void;
}) {
  const memberMap = Object.fromEntries(members.map((m) => [m.user_id, m]));
  const title = `${col.label} (${issues.length})`;

  return (
    <div className="flex min-h-0 w-[272px] flex-shrink-0 flex-col">
      <div
        className={`mb-3 flex items-center justify-between rounded-xl border px-3 py-2.5 shadow-sm ring-1 ${col.header} ${col.ring}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${col.dot} shadow-sm`} />
          <span className="truncate text-[13px] font-semibold text-foreground">{title}</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
            title="Column actions"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
            title="Add issue"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            agent={resolveAgent(issue, agents)}
            member={resolveMember(issue, members) ?? (issue.user_assignee_id ? memberMap[issue.user_assignee_id] : undefined)}
            prefix={prefix}
            onClick={() => onCardClick(issue.id)}
          />
        ))}
        {issues.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-3 py-8 text-center">
            <p className="text-xs text-muted-foreground">No issues</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── List row ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  backlog:     "bg-muted text-muted-foreground",
  todo:        "bg-secondary text-secondary-foreground",
  in_progress: "bg-brand/15 text-brand",
  in_review:   "bg-warning/15 text-warning-foreground",
  done:        "bg-success/15 text-success",
  cancelled:   "bg-muted text-muted-foreground",
  blocked:     "bg-destructive/15 text-destructive",
};

function ListRow({
  issue,
  agent,
  member,
  prefix,
  onClick,
}: {
  issue: Issue;
  agent: Agent | undefined;
  member: WorkspaceMemberRow | undefined;
  prefix: string;
  onClick: () => void;
}) {
  const identifier = issue.number != null ? `${prefix}-${issue.number}` : issue.id.slice(0, 6);
  const badge = priorityBadge(issue.priority);
  const assigneeProvider = resolveProviderForAgent(agent);

  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center gap-3 border-b border-border/60 px-6 py-3 transition-colors hover:bg-muted/30"
    >
      <span className="w-16 flex-shrink-0 text-xs font-medium text-muted-foreground">{identifier}</span>
      <span className="flex-1 truncate text-sm text-foreground">{issue.title}</span>
      {badge && badge.label && (
        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
          <PriorityBars count={badge.bars} />
          {badge.label}
        </span>
      )}
      {(assigneeProvider || agent || member) && (
        <div className="flex flex-shrink-0 items-center">
          {member ? (
            <MemberAvatar member={member} size="sm" />
          ) : assigneeProvider ? (
            <span title={agent?.name ?? assigneeProvider}>
              <ProviderIcon provider={assigneeProvider} className="h-4 w-4" />
            </span>
          ) : (
            <AgentAvatar agent={agent} size="sm" />
          )}
        </div>
      )}
      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[issue.status] ?? ""}`}>
        {issue.status.replace(/_/g, " ")}
      </span>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function IssueListView() {
  const { apiClient, workspaceId } = useCoreContext();
  const nav = useNavigation();
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<"board" | "list">("board");

  const { data: issues = [], isLoading } = useQuery(issueListOptions(apiClient, workspaceId));
  const { data: agents = [] } = useQuery(agentListOptions(apiClient, workspaceId));
  const { data: workspaces = [] } = useQuery(workspaceListOptions(apiClient));
  const { data: members = [] } = useQuery(workspaceMembersOptions(apiClient, workspaceId));

  const workspace = workspaces.find((w) => w.id === workspaceId);
  const prefix = workspace?.prefix ?? "OC";
  const workspaceName = workspace?.name ?? "Workspace";

  const grouped = Object.fromEntries(
    COLUMNS.map((c) => [c.key, issues.filter((i) => i.status === c.key)])
  ) as Record<StatusKey, Issue[]>;

  const countLabel = `${issues.length} Issue${issues.length === 1 ? "" : "s"}`;
  const memberMap = Object.fromEntries(members.map((m) => [m.user_id, m]));
  const issuesPath = `/w/${workspaceId}/issues`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas/85 backdrop-blur-[2px]">
      <header className="flex-shrink-0 border-b border-border/70 bg-background/40 px-6 pb-0 pt-4 backdrop-blur-sm">
        <nav className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground/90">{workspaceName}</span>
          <span className="text-muted-foreground/70" aria-hidden>
            /
          </span>
          <span className="text-muted-foreground">Issues</span>
        </nav>

        <div className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border/80 bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setView("board")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  view === "board"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Kanban
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  view === "list"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                List
              </button>
            </div>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground/50"
            >
              Filter
            </button>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground/50"
            >
              Display
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm tabular-nums text-muted-foreground">{countLabel}</span>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-92"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Issue
            </button>
          </div>
        </div>
      </header>

      {isLoading && <p className="px-6 py-10 text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && view === "board" && (
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-5 py-5">
          {COLUMNS.map((col) => (
            <BoardColumn
              key={col.key}
              col={col}
              issues={grouped[col.key] ?? []}
              agents={agents}
              members={members}
              prefix={prefix}
              onCardClick={(id) => nav.push(`${issuesPath}/${id}`)}
              onAdd={() => setShowCreate(true)}
            />
          ))}
        </div>
      )}

      {!isLoading && view === "list" && (
        <div className="min-h-0 flex-1 overflow-y-auto bg-background/30">
          {issues.length === 0 && (
            <p className="px-6 py-10 text-sm text-muted-foreground">
              No issues yet. Create your first issue to get started.
            </p>
          )}
          {issues.map((issue) => (
            <ListRow
              key={issue.id}
              issue={issue}
              agent={resolveAgent(issue, agents)}
              member={resolveMember(issue, members) ?? (issue.user_assignee_id ? memberMap[issue.user_assignee_id] : undefined)}
              prefix={prefix}
              onClick={() => nav.push(`${issuesPath}/${issue.id}`)}
            />
          ))}
        </div>
      )}

      <CreateIssueModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => setShowCreate(false)}
      />
    </div>
  );
}
