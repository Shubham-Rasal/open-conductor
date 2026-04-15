import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateIssueInput } from "@open-conductor/core/issues";
import { issueDetailOptions, issueCommentsOptions, issueTasksOptions, useUpdateIssue, useCreateComment } from "@open-conductor/core/issues";
import { agentListOptions } from "@open-conductor/core/agents";
import { workspaceMembersOptions } from "@open-conductor/core/workspaces";
import { useCoreContext } from "@open-conductor/core/platform";
import type { AgentTask, TaskMessage } from "@open-conductor/core/types";
import { useNavigation } from "../navigation";
import { AssigneeSelector, type AssigneeKind } from "./AssigneeSelector";
import { agentIdForIssue, userIdForIssue } from "./issueAssignee";

type IssuePatch = Omit<UpdateIssueInput, "workspaceId" | "id">;

const STATUSES = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "blocked"];
const PRIORITIES = ["no_priority", "urgent", "high", "medium", "low"];

// ─── Stage badge ──────────────────────────────────────────────────────────────

const STAGE_STYLE: Record<string, string> = {
  queued:     "bg-muted text-muted-foreground",
  dispatched: "bg-brand/15 text-brand",
  running:    "bg-warning/15 text-warning-foreground animate-pulse",
  completed:  "bg-success/15 text-success",
  failed:     "bg-destructive/15 text-destructive",
  cancelled:  "bg-muted text-muted-foreground",
};

function StageBadge({ status }: { status: string }) {
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold capitalize ${STAGE_STYLE[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

// ─── Live output stream ───────────────────────────────────────────────────────

function LiveOutput({ issueId }: { issueId: string }) {
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const messages: TaskMessage[] = qc.getQueryData(["task:messages", issueId]) ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Subscribe to cache updates
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    return qc.getQueryCache().subscribe(() => {
      const data = qc.getQueryData<TaskMessage[]>(["task:messages", issueId]);
      if (data) forceUpdate((n) => n + 1);
    });
  }, [qc, issueId]);

  if (messages.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Live output</p>
      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {messages.map((m, i) => (
          <div key={i} className={
            m.kind === "tool" ? "text-brand" :
            m.kind === "status" ? "text-muted-foreground italic" :
            "text-foreground"
          }>
            {m.kind === "tool" && <span className="mr-1 opacity-60">⚙</span>}
            {m.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Task history row ─────────────────────────────────────────────────────────

function TaskRow({ task }: { task: AgentTask }) {
  const [expanded, setExpanded] = useState(false);
  const isActive = task.status === "running" || task.status === "dispatched";
  const hasOutput = !!task.output;

  return (
    <div className={`rounded-lg border ${isActive ? "border-brand/40 bg-brand/5" : "border-border bg-card"} p-3`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StageBadge status={task.status} />
          <span className="text-xs text-muted-foreground">
            {new Date(task.created_at).toLocaleString()}
          </span>
          {task.session_id && (
            <span className="text-[10px] text-muted-foreground/60 truncate max-w-[120px]" title={task.session_id}>
              session: {task.session_id.slice(0, 8)}…
            </span>
          )}
        </div>
        {hasOutput && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? "▲ hide" : "▼ output"}
          </button>
        )}
      </div>

      {task.error_message && (
        <p className="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {task.error_message}
        </p>
      )}

      {expanded && task.output && (
        <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px] text-foreground">
          {task.output}
        </pre>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  issueId: string;
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function IssueDetailView({ issueId }: Props) {
  const { apiClient, workspaceId } = useCoreContext();
  const nav = useNavigation();
  const updateIssue = useUpdateIssue();
  const createComment = useCreateComment();
  const [comment, setComment] = useState("");

  const { data: issue, isLoading } = useQuery(issueDetailOptions(apiClient, workspaceId, issueId));
  const { data: comments = [] } = useQuery(issueCommentsOptions(apiClient, issueId));
  const { data: tasks = [] } = useQuery({
    ...issueTasksOptions(apiClient, workspaceId, issueId),
    refetchInterval: (query) => {
      const raw = query.state.data as { tasks?: { status: string }[] } | undefined;
      if (!raw?.tasks) return false;
      const hasActive = raw.tasks.some((t) =>
        t.status === "running" || t.status === "dispatched" || t.status === "queued"
      );
      return hasActive ? 3000 : false;
    },
  });
  const { data: agents = [] } = useQuery(agentListOptions(apiClient, workspaceId));
  const { data: members = [] } = useQuery(workspaceMembersOptions(apiClient, workspaceId));

  if (isLoading) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  if (!issue) return <p className="p-8 text-sm text-destructive">Issue not found.</p>;

  function update(patch: IssuePatch) {
    updateIssue.mutate({ workspaceId, id: issueId, ...patch });
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    await createComment.mutateAsync({ issueId, content: comment.trim() });
    setComment("");
  }

  const activeTask = tasks.find((t) => t.status === "running" || t.status === "dispatched");
  const hasRunningTask = !!activeTask;

  const aid = agentIdForIssue(issue);
  const uid = userIdForIssue(issue);
  const assigneeKind: AssigneeKind =
    issue.assignee_type === "agent" && aid ? "agent" : issue.assignee_type === "member" && uid ? "member" : "none";

  return (
    <div className="flex h-full flex-col">
      {/* Back */}
      <div className="flex items-center gap-2 border-b border-border px-6 py-3">
        <button onClick={() => nav.back()} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </button>
        {hasRunningTask && (
          <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-brand">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
            Agent working…
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <h1 className="text-xl font-semibold text-foreground">{issue.title}</h1>

          {/* Task activity */}
          {tasks.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Task activity</h2>
              <div className="space-y-2">
                {activeTask && <LiveOutput issueId={issueId} />}
                {tasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </section>
          )}

          {/* Comments */}
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Comments</h2>
            {comments.length === 0 && !hasRunningTask && (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            )}
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg border border-border bg-card p-4">
                  <p className="mb-1 text-xs text-muted-foreground">
                    {c.author_type} · {new Date(c.created_at).toLocaleString()}
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
                </div>
              ))}
            </div>

            <form onSubmit={(e) => void submitComment(e)} className="mt-3 flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment…"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={createComment.isPending || !comment.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </section>
        </div>

        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 overflow-y-auto border-l border-border px-5 py-6 space-y-5">
          {/* Status */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={issue.status}
              onChange={(e) => update({ status: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Priority</label>
            <select
              value={issue.priority}
              onChange={(e) => update({ priority: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          {/* Assignee */}
          <div>
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
            {issue.assignee_type === "agent" && aid && (
              <p className="mt-1 text-xs text-brand">
                {hasRunningTask ? "Agent is working on this…" : "Agent will pick this up automatically"}
              </p>
            )}
          </div>

          {/* Task stats */}
          {tasks.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Task runs</label>
              <p className="text-sm text-foreground">{tasks.length} total</p>
              <p className="text-xs text-muted-foreground">
                {tasks.filter((t) => t.status === "completed").length} completed ·{" "}
                {tasks.filter((t) => t.status === "failed").length} failed
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
