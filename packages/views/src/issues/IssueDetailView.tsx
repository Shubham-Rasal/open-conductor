import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UpdateIssueInput } from "@open-conductor/core/issues";
import {
  issueDetailOptions,
  issueCommentsOptions,
  issueTasksOptions,
  useUpdateIssue,
  useCreateComment,
  useDeleteIssue,
  useStopIssueAgent,
} from "@open-conductor/core/issues";
import { agentListOptions } from "@open-conductor/core/agents";
import { workspaceMembersOptions } from "@open-conductor/core/workspaces";
import { useCoreContext } from "@open-conductor/core/platform";
import type { Agent, AgentTask, TaskMessage } from "@open-conductor/core/types";
import { useNavigation } from "../navigation";
import { AssigneeSelector, type AssigneeKind } from "./AssigneeSelector";
import { agentIdForIssue, userIdForIssue } from "./issueAssignee";

type IssuePatch = Omit<UpdateIssueInput, "workspaceId" | "id">;

const STATUSES = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "blocked"];
const PRIORITIES = ["no_priority", "urgent", "high", "medium", "low"];

// ─── Time + labels ───────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}

function humanStatus(s: string): string {
  return s.replace(/_/g, " ");
}

function humanPriority(p: string): string {
  return p.replace(/_/g, " ");
}

// ─── Status & priority visuals (Linear-style) ────────────────────────────────

type StatusTheme = { dot: string; bg: string; ring: string };

const STATUS_STYLES: Record<string, StatusTheme> = {
  backlog: { dot: "bg-muted-foreground/50", bg: "bg-muted/80", ring: "ring-muted-foreground/20" },
  todo: { dot: "bg-blue-500", bg: "bg-blue-500/12", ring: "ring-blue-500/25" },
  in_progress: { dot: "bg-amber-500", bg: "bg-amber-500/12", ring: "ring-amber-500/30" },
  in_review: { dot: "bg-violet-500", bg: "bg-violet-500/12", ring: "ring-violet-500/25" },
  done: { dot: "bg-emerald-500", bg: "bg-emerald-500/12", ring: "ring-emerald-500/25" },
  cancelled: { dot: "bg-muted-foreground/40", bg: "bg-muted/70", ring: "ring-border" },
  blocked: { dot: "bg-rose-500", bg: "bg-rose-500/12", ring: "ring-rose-500/25" },
};

const STATUS_FALLBACK: StatusTheme = {
  dot: "bg-muted-foreground/50",
  bg: "bg-muted/80",
  ring: "ring-muted-foreground/20",
};

function statusStyle(status: string): StatusTheme {
  return STATUS_STYLES[status] ?? STATUS_FALLBACK;
}

function StatusDot({ status }: { status: string }) {
  const st = statusStyle(status);
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${st.dot}`} title={humanStatus(status)} />;
}

function PriorityBars({ priority }: { priority: string }) {
  const rank =
    priority === "urgent" ? 4 : priority === "high" ? 3 : priority === "medium" ? 2 : priority === "low" ? 1 : 0;
  const active = "bg-foreground/75";
  const dim = "bg-muted-foreground/25";
  return (
    <span className="inline-flex h-3.5 items-end gap-px" title={humanPriority(priority)}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-[1px] ${i <= rank ? active : dim}`}
          style={{ height: `${4 + i * 2}px` }}
        />
      ))}
    </span>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconBack(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLink(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M6.5 9.5L4 12a2.5 2.5 0 010-3.5l2-2a2.5 2.5 0 013.5 0M9.5 6.5L12 4a2.5 2.5 0 010 3.5l-2 2a2.5 2.5 0 01-3.5 0"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTrash(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M6.5 7v5M9.5 7v5M4 4l.5 9a1 1 0 001 1h5a1 1 0 001-1l.5-9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M2.5 6.5h11M5.5 2v2.5M10.5 2v2.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconSpark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path d="M8 2v2M8 12v2M3 8h2M11 8h2M4.5 4.5l1.5 1.5M10 10l1.5 1.5M4.5 11.5L6 10M10 6l1.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function Md({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children: c }) => <h1 className="mb-1 mt-2 text-base font-semibold text-foreground">{c}</h1>,
        h2: ({ children: c }) => <h2 className="mb-1 mt-2 text-sm font-semibold text-foreground">{c}</h2>,
        h3: ({ children: c }) => <h3 className="mb-0.5 mt-1.5 text-xs font-semibold text-foreground">{c}</h3>,
        p: ({ children: c }) => <p className="mb-1 last:mb-0 leading-relaxed">{c}</p>,
        a: ({ href, children: c }) => (
          <a href={href} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2 hover:opacity-80">
            {c}
          </a>
        ),
        strong: ({ children: c }) => <strong className="font-semibold text-foreground">{c}</strong>,
        em: ({ children: c }) => <em className="italic text-foreground/80">{c}</em>,
        ul: ({ children: c }) => <ul className="mb-1 ml-4 list-disc space-y-0.5">{c}</ul>,
        ol: ({ children: c }) => <ol className="mb-1 ml-4 list-decimal space-y-0.5">{c}</ol>,
        li: ({ children: c }) => <li className="text-foreground">{c}</li>,
        code: ({ className: cls, children: c, ...props }) => {
          const isBlock = /language-/.test(cls ?? "");
          return isBlock ? (
            <code className="block overflow-x-auto rounded-md bg-muted/70 p-2 font-mono text-[11px] text-foreground" {...props}>
              {c}
            </code>
          ) : (
            <code className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[11px] text-foreground">{c}</code>
          );
        },
        pre: ({ children: c }) => <pre className="mb-1 overflow-x-auto">{c}</pre>,
        blockquote: ({ children: c }) => (
          <blockquote className="mb-1 border-l-2 border-border pl-3 italic text-muted-foreground">{c}</blockquote>
        ),
        hr: () => <hr className="my-2 border-border" />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

// ─── Stage badge ──────────────────────────────────────────────────────────────

const STAGE_STYLE: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  dispatched: "bg-brand/15 text-brand",
  running: "bg-warning/15 text-warning-foreground animate-pulse",
  completed: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function StageBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${STAGE_STYLE[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

// ─── Live agent session (transcript + steering) ───────────────────────────────

function TaskStreamLine({ m }: { m: TaskMessage }) {
  const [open, setOpen] = useState(false);

  if (m.kind === "thinking") {
    return (
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors">
          <svg className="h-2.5 w-2.5 flex-shrink-0 transition-transform group-open:rotate-90" viewBox="0 0 12 12" fill="none">
            <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Thinking…
        </summary>
        <p className="mt-1.5 whitespace-pre-wrap pl-4 font-mono text-[11px] leading-relaxed text-muted-foreground/50">{m.content}</p>
      </details>
    );
  }

  if (m.kind === "tool_use" || m.kind === "tool") {
    return (
      <div className="overflow-hidden rounded-lg border border-border/40 bg-muted/20 text-xs">
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30"
        >
          <svg className="h-3 w-3 flex-shrink-0 transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }} viewBox="0 0 12 12" fill="none">
            <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="flex-1 font-mono text-[11px] font-medium text-muted-foreground/80">{m.tool ?? "tool"}</span>
          <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/50">tool</span>
        </button>
        {open && m.tool_input && (
          <pre className="border-t border-border/30 px-3 py-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground/70 overflow-auto max-h-48 whitespace-pre-wrap break-all">
            {m.tool_input}
          </pre>
        )}
      </div>
    );
  }

  if (m.kind === "tool_result") {
    return (
      <div className="overflow-hidden rounded-lg border border-border/30 bg-muted/10 text-xs">
        {m.tool && (
          <div className="flex items-center gap-1.5 border-b border-border/30 px-3 py-1.5">
            <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3 text-success/70">
              <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.25" />
              <path d="M3.5 6l1.75 1.75 3.25-3.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-mono text-[10px] text-muted-foreground/50">{m.tool}</span>
          </div>
        )}
        <pre className="max-h-48 overflow-auto px-3 py-2.5 font-mono text-[10px] leading-relaxed text-foreground/70 whitespace-pre-wrap break-words">
          {m.content}
        </pre>
      </div>
    );
  }

  if (m.kind === "status") {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 italic">
        <span className="h-1 w-1 rounded-full bg-muted-foreground/30 flex-shrink-0" />
        {m.content}
      </p>
    );
  }

  return (
    <div className="text-sm leading-relaxed text-foreground">
      <Md className="text-sm">{m.content}</Md>
    </div>
  );
}

function AgentSessionPanel({
  issueId,
  isRunning,
  canSteer,
  canStop,
  onStop,
  stopBusy,
}: {
  issueId: string;
  isRunning: boolean;
  canSteer: boolean;
  canStop: boolean;
  onStop: () => void;
  stopBusy: boolean;
}) {
  const qc = useQueryClient();
  const createComment = useCreateComment();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [steerDraft, setSteerDraft] = useState("");

  const messages: TaskMessage[] = qc.getQueryData(["task:messages", issueId]) ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Only follow tail when already near bottom; scroll the container itself, never the page.
    if (distanceFromBottom <= 120) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length]);

  const [, forceUpdate] = useState(0);
  useEffect(() => {
    return qc.getQueryCache().subscribe(() => {
      const data = qc.getQueryData<TaskMessage[]>(["task:messages", issueId]);
      if (data) forceUpdate((n) => n + 1);
    });
  }, [qc, issueId]);

  const hasTranscript = messages.length > 0;

  if (!isRunning && !hasTranscript && !canSteer) {
    return null;
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/60 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/25" />
          )}
          <p className="text-xs font-medium text-foreground/80">
            {isRunning ? "Agent working" : hasTranscript ? "Last run" : "Agent session"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canStop && (
            <button
              type="button"
              disabled={stopBusy}
              onClick={onStop}
              className="rounded-md border border-border/80 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              {stopBusy ? "Stopping…" : "Stop"}
            </button>
          )}
        </div>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="min-h-[8rem] max-h-[min(48vh,480px)] space-y-3 overflow-y-auto border-t border-border/40 px-4 py-4">
        {!hasTranscript && isRunning && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
            <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Waiting for agent output…
          </div>
        )}
        {!hasTranscript && !isRunning && canSteer && (
          <p className="text-[11px] text-muted-foreground/50">
            No transcript yet — tool calls, output, and replies will appear here when the agent runs.
          </p>
        )}
        {messages.map((m, i) => (
          <TaskStreamLine key={`${m.kind}-${i}-${m.content.slice(0, 24)}`} m={m} />
        ))}
      </div>

      {/* Composer */}
      {canSteer && (
        <div className="border-t border-border/40 px-4 pb-3 pt-3">
          <div className="rounded-xl border border-border/75 bg-background shadow-sm">
            <textarea
              value={steerDraft}
              onChange={(e) => setSteerDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (steerDraft.trim() && !createComment.isPending) {
                    void createComment.mutateAsync({ issueId, content: steerDraft.trim() }).then(() => setSteerDraft(""));
                  }
                }
              }}
              placeholder="Steer the agent… (↵ to send)"
              rows={1}
              className="block w-full resize-none bg-transparent px-3 pb-1 pt-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              style={{ minHeight: "44px", maxHeight: "160px", overflowY: "auto" }}
            />
            <div className="flex items-center justify-between px-2.5 pb-2 pt-1">
              <p className="text-[11px] text-muted-foreground/45">Added as a comment · picked up on agent&apos;s next turn</p>
              <button
                type="button"
                disabled={!steerDraft.trim() || createComment.isPending}
                onClick={() => {
                  const t = steerDraft.trim();
                  if (!t) return;
                  void createComment.mutateAsync({ issueId, content: t }).then(() => setSteerDraft(""));
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {createComment.isPending ? (
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
                    <path d="M7 12V2M3 6l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Task history row ─────────────────────────────────────────────────────────

function TaskRow({ task, assignedAgent }: { task: AgentTask; assignedAgent?: Agent }) {
  const [expanded, setExpanded] = useState(false);
  const isActive = task.status === "running" || task.status === "dispatched";
  const hasOutput = !!task.output;

  const agentOffline =
    task.status === "queued" && assignedAgent && (!assignedAgent.runtime || assignedAgent.runtime.status === "offline");

  const queuedReason = agentOffline
    ? `Agent "${assignedAgent!.name}" is offline — task will run once it connects`
    : task.status === "queued"
      ? "Waiting to be picked up by the agent runner…"
      : null;

  return (
    <div className={`rounded-xl border p-3 shadow-sm ${isActive ? "border-brand/35 bg-brand/[0.04]" : "border-border/80 bg-card"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StageBadge status={task.status} />
          <span className="text-[11px] text-muted-foreground">{new Date(task.created_at).toLocaleString()}</span>
          {task.session_id && (
            <span className="max-w-[120px] truncate text-[10px] text-muted-foreground/60" title={task.session_id}>
              session {task.session_id.slice(0, 8)}…
            </span>
          )}
        </div>
        {hasOutput && (
          <button type="button" onClick={() => setExpanded(!expanded)} className="flex-shrink-0 text-[11px] text-muted-foreground hover:text-foreground">
            {expanded ? "Hide" : "Output"}
          </button>
        )}
      </div>

      {queuedReason && (
        <div
          className={`mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] ${
            agentOffline ? "bg-warning/10 text-warning-foreground" : "bg-muted/50 text-muted-foreground"
          }`}
        >
          <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${agentOffline ? "bg-warning" : "animate-pulse bg-muted-foreground/50"}`} />
          {queuedReason}
        </div>
      )}

      {task.error_message && (
        <p className="mt-2 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{task.error_message}</p>
      )}

      {expanded && task.output && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg bg-muted/40 p-3 text-[12px] text-foreground">
          <Md>{task.output}</Md>
        </div>
      )}
    </div>
  );
}

// ─── Activity avatar ───────────────────────────────────────────────────────────

function ActivityAvatar({ label }: { label: string }) {
  const ch = label.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted/60 text-xs font-semibold text-muted-foreground ring-2 ring-background">
      {ch}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  issueId: string;
}

const selectSurface =
  "w-full appearance-none rounded-lg border border-border/80 bg-background py-2.5 pl-9 pr-3 text-sm text-foreground shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring/35 hover:border-border";

// ─── Main view ────────────────────────────────────────────────────────────────

export function IssueDetailView({ issueId }: Props) {
  const { apiClient, workspaceId } = useCoreContext();
  const nav = useNavigation();
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();
  const createComment = useCreateComment();
  const stopIssueAgent = useStopIssueAgent();
  const [comment, setComment] = useState("");
  const [copied, setCopied] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);

  const { data: issue, isLoading } = useQuery(issueDetailOptions(apiClient, workspaceId, issueId));
  const { data: comments = [] } = useQuery(issueCommentsOptions(apiClient, issueId));
  const { data: tasks = [] } = useQuery({
    ...issueTasksOptions(apiClient, workspaceId, issueId),
    refetchInterval: (query) => {
      const raw = query.state.data as { tasks?: { status: string }[] } | undefined;
      if (!raw?.tasks) return false;
      const hasActive = raw.tasks.some((t) => t.status === "running" || t.status === "dispatched" || t.status === "queued");
      return hasActive ? 3000 : false;
    },
  });
  const { data: agents = [] } = useQuery(agentListOptions(apiClient, workspaceId));
  const { data: members = [] } = useQuery(workspaceMembersOptions(apiClient, workspaceId));

  useEffect(() => {
    if (issue) {
      setTitleDraft(issue.title);
      setDescDraft(issue.description ?? "");
    }
  }, [issue]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          Loading issue…
        </div>
      </div>
    );
  }
  if (!issue) {
    return <p className="p-8 text-sm text-destructive">Issue not found.</p>;
  }

  const iss = issue;

  function update(patch: IssuePatch) {
    updateIssue.mutate({ workspaceId, id: issueId, ...patch });
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    await createComment.mutateAsync({ issueId, content: comment.trim() });
    setComment("");
  }

  function copyLink() {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDelete() {
    if (!window.confirm(`Delete “${iss.title}”? This cannot be undone.`)) return;
    deleteIssue.mutate(
      { workspaceId, id: issueId },
      {
        onSuccess: () => nav.back(),
      }
    );
  }

  function saveDescription() {
    const next = descDraft.trim();
    const prev = (iss.description ?? "").trim();
    if (next === prev) {
      setEditingDesc(false);
      return;
    }
    update({ description: next.length > 0 ? next : undefined });
    setEditingDesc(false);
  }

  function saveTitle() {
    const t = titleDraft.trim();
    if (!t || t === iss.title) return;
    update({ title: t });
  }

  const activeTask = tasks.find((t) => t.status === "running" || t.status === "dispatched");
  const hasRunningTask = !!activeTask;
  const hasActiveAgentWork = tasks.some(
    (t) => t.status === "queued" || t.status === "dispatched" || t.status === "running"
  );

  const aid = agentIdForIssue(iss);
  const uid = userIdForIssue(iss);
  const assignedAgent = aid ? (agents as Agent[]).find((a) => a.id === aid) : undefined;
  const agentIsOffline = assignedAgent && (!assignedAgent.runtime || assignedAgent.runtime.status === "offline");
  const hasQueuedTasks = tasks.some((t) => t.status === "queued");
  const assigneeKind: AssigneeKind =
    iss.assignee_type === "agent" && aid ? "agent" : iss.assignee_type === "member" && uid ? "member" : "none";

  const issueKey = iss.number != null ? `#${iss.number}` : issueId.slice(0, 8);
  const st = statusStyle(iss.status);

  const sortedComments = [...comments].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Top bar */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 bg-card/40 px-4 py-2.5 backdrop-blur-sm sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={() => nav.back()}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
        >
          <IconBack className="h-4 w-4" />
          Back
        </button>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {hasRunningTask && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              Agent working
            </span>
          )}
          {aid && hasActiveAgentWork && (
            <button
              type="button"
              disabled={stopIssueAgent.isPending}
              onClick={() => void stopIssueAgent.mutateAsync(issueId)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/8 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/12 disabled:opacity-50"
            >
              {stopIssueAgent.isPending ? "Stopping…" : "Stop agent"}
            </button>
          )}
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60"
          >
            <IconLink className="h-3.5 w-3.5 text-muted-foreground" />
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteIssue.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/25 bg-background px-2.5 py-1.5 text-xs font-medium text-destructive shadow-sm transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            <IconTrash className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Main column */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
            {/* Issue id + status strip */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-muted/90 px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground ring-1 ring-border/60">
                {issueKey}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ring-1 ${st.bg} ${st.ring}`}
              >
                <StatusDot status={iss.status} />
                {humanStatus(iss.status)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <PriorityBars priority={iss.priority} />
                {humanPriority(iss.priority)}
              </span>
            </div>

            {/* Title */}
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => saveTitle()}
              className="mb-6 w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 sm:text-[1.65rem] sm:leading-tight"
              aria-label="Issue title"
            />

            {/* Agent offline banner */}
            {agentIsOffline && hasQueuedTasks && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/35 bg-warning/8 px-4 py-3">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1.5L1 14.5h14L8 1.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                  <path d="M8 6v4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                  <circle cx="8" cy="12" r="0.75" fill="currentColor" />
                </svg>
                <div>
                  <p className="text-xs font-medium text-warning-foreground">Agent &ldquo;{assignedAgent!.name}&rdquo; is offline</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Queued tasks start when the agent connects. Check the Agents tab for status.
                  </p>
                </div>
              </div>
            )}

            {/* Description */}
            <section className="mb-10">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Description</h2>
                {!editingDesc && (
                  <button
                    type="button"
                    onClick={() => setEditingDesc(true)}
                    className="text-[11px] font-medium text-brand hover:underline"
                  >
                    {iss.description ? "Edit" : "Add description"}
                  </button>
                )}
              </div>
              {editingDesc ? (
                <div className="space-y-2">
                  <textarea
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    placeholder="Write markdown…"
                    rows={8}
                    className="w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDescDraft(iss.description ?? "");
                        setEditingDesc(false);
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveDescription()}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : iss.description ? (
                <div className="rounded-xl border border-border/70 bg-card/50 px-4 py-4 text-sm shadow-sm">
                  <Md>{iss.description}</Md>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDesc(true)}
                  className="w-full rounded-xl border border-dashed border-border/90 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted/35"
                >
                  <IconSpark className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  Add a description
                </button>
              )}
            </section>

            {/* Task activity */}
            {tasks.length > 0 && (
              <section className="mb-10">
                <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Agent tasks</h2>
                <div className="space-y-2">
                  {aid && (
                    <AgentSessionPanel
                      issueId={issueId}
                      isRunning={!!activeTask}
                      canSteer={iss.assignee_type === "agent" && !!aid}
                      canStop={!!aid && hasActiveAgentWork}
                      onStop={() => void stopIssueAgent.mutateAsync(issueId)}
                      stopBusy={stopIssueAgent.isPending}
                    />
                  )}
                  {tasks.map((task) => (
                    <TaskRow key={task.id} task={task} assignedAgent={assignedAgent} />
                  ))}
                </div>
              </section>
            )}

            {/* Activity */}
            <section>
              <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Activity</h2>

              <div className="relative">
                <div className="absolute bottom-0 left-[15px] top-2 w-px bg-border/80" aria-hidden />
                <ul className="space-y-0">
                  <li className="relative flex gap-4 pb-6">
                    <ActivityAvatar label="System" />
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">Issue created</span>
                        <span className="text-muted-foreground"> · {formatRelativeTime(iss.created_at)}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">Opened in this workspace</p>
                    </div>
                  </li>
                  {sortedComments.map((c) => (
                    <li key={c.id} className="relative flex gap-4 pb-6">
                      <ActivityAvatar label={c.author_type === "agent" ? "Agent" : "Member"} />
                      <div className="min-w-0 flex-1 rounded-xl border border-border/70 bg-card/60 px-4 py-3 shadow-sm">
                        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="font-medium capitalize text-foreground">{c.author_type}</span>
                          <span>·</span>
                          <time dateTime={c.created_at}>{formatRelativeTime(c.created_at)}</time>
                          <span className="text-muted-foreground/70">({new Date(c.created_at).toLocaleString()})</span>
                        </div>
                        <div className="max-w-none text-sm leading-relaxed text-foreground">
                          <Md>{c.content}</Md>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <form onSubmit={(e) => void submitComment(e)} className="mt-2">
                <label className="mb-2 block text-[11px] font-medium text-muted-foreground">Comment</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Leave a comment… Markdown is supported."
                  rows={4}
                  className="mb-2 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-muted-foreground">Use **bold**, lists, and `code` for richer notes.</p>
                  <button
                    type="submit"
                    disabled={createComment.isPending || !comment.trim()}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {createComment.isPending ? "Sending…" : "Comment"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-border/70 bg-muted/15 px-5 py-6 lg:block">
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Properties</h3>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Status</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2">
                      <StatusDot status={iss.status} />
                    </div>
                    <select
                      value={iss.status}
                      onChange={(e) => update({ status: e.target.value })}
                      className={selectSurface}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {humanStatus(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Priority</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2">
                      <PriorityBars priority={iss.priority} />
                    </div>
                    <select
                      value={iss.priority}
                      onChange={(e) => update({ priority: e.target.value })}
                      className={selectSurface}
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {humanPriority(p)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <AssigneeSelector
                  kind={assigneeKind}
                  agentId={aid ?? ""}
                  userId={uid ?? ""}
                  agents={agents}
                  members={members}
                  onChange={(next) => {
                    if (next.kind === "none") {
                      update({
                        assignee_type: null,
                        agent_assignee_id: null,
                        user_assignee_id: null,
                        assignee_id: null,
                      });
                    } else if (next.kind === "agent") {
                      update({
                        assignee_type: "agent",
                        agent_assignee_id: next.agentId || null,
                        user_assignee_id: null,
                        assignee_id: next.agentId || null,
                      });
                    } else {
                      update({
                        assignee_type: "member",
                        user_assignee_id: next.userId || null,
                        agent_assignee_id: null,
                        assignee_id: null,
                      });
                    }
                  }}
                />
                {iss.assignee_type === "agent" && aid && (
                  <p className="text-[11px] leading-snug text-brand">
                    {hasRunningTask ? "Agent is executing tasks for this issue." : "Agent will pick up queued work when online."}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-card/50 p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <IconCalendar className="h-3.5 w-3.5" />
                Details
              </h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-[11px] text-muted-foreground">Created</dt>
                  <dd className="text-foreground">{new Date(iss.created_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Updated</dt>
                  <dd className="text-foreground">{new Date(iss.updated_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Identifier</dt>
                  <dd className="font-mono text-xs text-foreground">{issueKey}</dd>
                </div>
              </dl>
            </div>

            {tasks.length > 0 && (
              <div className="rounded-xl border border-border/70 bg-card/50 p-4 shadow-sm">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Task runs</h3>
                <p className="text-2xl font-semibold tabular-nums text-foreground">{tasks.length}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {tasks.filter((t) => t.status === "completed").length} completed · {tasks.filter((t) => t.status === "failed").length}{" "}
                  failed
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* Mobile: properties as accordion-style bottom sheet could be future; for now stack is main-only on small screens */}
      </div>

      {/* Mobile properties — compact bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/70 bg-card/60 px-4 py-3 lg:hidden">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Quick</span>
        <select
          value={iss.status}
          onChange={(e) => update({ status: e.target.value })}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanStatus(s)}
            </option>
          ))}
        </select>
        <select
          value={iss.priority}
          onChange={(e) => update({ priority: e.target.value })}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {humanPriority(p)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
