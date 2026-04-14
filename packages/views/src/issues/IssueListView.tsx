import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { issueListOptions } from "@open-conductor/core/issues";
import { agentListOptions } from "@open-conductor/core/agents";
import { workspaceListOptions } from "@open-conductor/core/workspaces";
import { useCoreContext } from "@open-conductor/core/platform";
import type { Issue, Agent } from "@open-conductor/core/types";
import { useNavigation } from "../navigation";
import { CreateIssueModal } from "./CreateIssueModal";

// ─── Column config ────────────────────────────────────────────────────────────

type StatusKey =
  | "backlog"
  | "todo"
  | "in_progress"
  | "blocked"
  | "in_review"
  | "done";

const COLUMNS: { key: StatusKey; label: string; dot: string; header: string }[] = [
  { key: "backlog",     label: "Backlog",     dot: "bg-muted-foreground",  header: "bg-muted/60" },
  { key: "todo",        label: "Todo",        dot: "bg-foreground",        header: "bg-muted/60" },
  { key: "in_progress", label: "In Progress", dot: "bg-brand",             header: "bg-brand/10" },
  { key: "blocked",     label: "Blocked",     dot: "bg-destructive",       header: "bg-destructive/10" },
  { key: "in_review",   label: "In Review",   dot: "bg-warning",           header: "bg-warning/10" },
  { key: "done",        label: "Done",        dot: "bg-success",           header: "bg-success/10" },
];

// ─── Priority badge ───────────────────────────────────────────────────────────

const PRIORITY_BADGE: Record<string, { label: string; cls: string }> = {
  urgent:      { label: "Urgent",  cls: "bg-destructive/15 text-destructive" },
  high:        { label: "High",    cls: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  medium:      { label: "Medium",  cls: "bg-warning/15 text-warning-foreground" },
  low:         { label: "Low",     cls: "bg-info/15 text-info-foreground" },
  no_priority: { label: "",        cls: "" },
};

// ─── Assignee avatar ──────────────────────────────────────────────────────────

function AgentAvatar({ agent }: { agent: Agent | undefined }) {
  if (!agent) return null;
  const initials = agent.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const statusRing: Record<string, string> = {
    idle: "ring-success",
    working: "ring-brand",
    blocked: "ring-warning",
    error: "ring-destructive",
    offline: "ring-muted-foreground",
  };
  return (
    <span
      title={agent.name}
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-sidebar-accent text-[9px] font-semibold text-sidebar-accent-foreground ring-2 ${statusRing[agent.status] ?? "ring-muted"}`}
    >
      {initials}
    </span>
  );
}

// ─── Issue card ───────────────────────────────────────────────────────────────

function IssueCard({
  issue,
  agent,
  prefix,
  onClick,
}: {
  issue: Issue;
  agent: Agent | undefined;
  prefix: string;
  onClick: () => void;
}) {
  const badge = PRIORITY_BADGE[issue.priority];
  const identifier = issue.number != null ? `${prefix}-${issue.number}` : issue.id.slice(0, 6);

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm transition-shadow hover:shadow-md"
    >
      {/* identifier */}
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{identifier}</p>

      {/* title */}
      <p className="mb-1 text-[13px] font-medium leading-snug text-foreground line-clamp-2">
        {issue.title}
      </p>

      {/* description */}
      {issue.description && (
        <p className="mb-2.5 text-[12px] leading-relaxed text-muted-foreground line-clamp-2">
          {issue.description}
        </p>
      )}

      {/* footer */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <AgentAvatar agent={agent} />
        {badge && badge.label && (
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>
            {badge.label}
          </span>
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
  prefix,
  onCardClick,
  onAdd,
}: {
  col: (typeof COLUMNS)[number];
  issues: Issue[];
  agents: Agent[];
  prefix: string;
  onCardClick: (id: string) => void;
  onAdd: () => void;
}) {
  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]));

  return (
    <div className="flex w-64 flex-shrink-0 flex-col">
      {/* Column header */}
      <div className={`mb-2 flex items-center justify-between rounded-lg px-3 py-2 ${col.header}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${col.dot}`} />
          <span className="text-[13px] font-semibold text-foreground">{col.label}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {issues.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onAdd}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/60"
            title="Add issue"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/60" title="Collapse">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 overflow-y-auto">
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            agent={issue.assignee_id ? agentMap[issue.assignee_id] : undefined}
            prefix={prefix}
            onClick={() => onCardClick(issue.id)}
          />
        ))}
        {issues.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center">
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

function ListRow({ issue, prefix, onClick }: { issue: Issue; prefix: string; onClick: () => void }) {
  const identifier = issue.number != null ? `${prefix}-${issue.number}` : issue.id.slice(0, 6);
  const badge = PRIORITY_BADGE[issue.priority];

  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center gap-3 border-b border-border px-6 py-3 hover:bg-accent/30 transition-colors"
    >
      <span className="w-16 flex-shrink-0 text-xs font-medium text-muted-foreground">{identifier}</span>
      <span className="flex-1 truncate text-sm text-foreground">{issue.title}</span>
      {badge && badge.label && (
        <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
      )}
      <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[issue.status] ?? ""}`}>
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

  const prefix = workspaces.find((w) => w.id === workspaceId)?.prefix ?? "OC";

  const grouped = Object.fromEntries(
    COLUMNS.map((c) => [c.key, issues.filter((i) => i.status === c.key)])
  ) as Record<StatusKey, Issue[]>;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-foreground">Issues</h1>
          <span className="text-xs text-muted-foreground">{issues.length} issues</span>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-md border border-border bg-muted/40 p-0.5">
            <button
              onClick={() => setView("board")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                view === "board"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                view === "list"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              List
            </button>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Issue
          </button>
        </div>
      </div>

      {isLoading && (
        <p className="px-6 py-8 text-sm text-muted-foreground">Loading…</p>
      )}

      {/* Board view */}
      {!isLoading && view === "board" && (
        <div className="flex flex-1 gap-3 overflow-x-auto p-4">
          {COLUMNS.map((col) => (
            <BoardColumn
              key={col.key}
              col={col}
              issues={grouped[col.key] ?? []}
              agents={agents}
              prefix={prefix}
              onCardClick={(id) => nav.push(`/issues/${id}`)}
              onAdd={() => setShowCreate(true)}
            />
          ))}
        </div>
      )}

      {/* List view */}
      {!isLoading && view === "list" && (
        <div className="flex-1 overflow-y-auto">
          {issues.length === 0 && (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              No issues yet. Create your first issue to get started.
            </p>
          )}
          {issues.map((issue) => (
            <ListRow
              key={issue.id}
              issue={issue}
              prefix={prefix}
              onClick={() => nav.push(`/issues/${issue.id}`)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateIssueModal
          onClose={() => setShowCreate(false)}
          onCreated={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
