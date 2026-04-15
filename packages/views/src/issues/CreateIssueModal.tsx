import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreateIssue } from "@open-conductor/core/issues";
import { agentListOptions } from "@open-conductor/core/agents";
import { workspaceMembersOptions } from "@open-conductor/core/workspaces";
import { useCoreContext } from "@open-conductor/core/platform";
import { AssigneeSelector, type AssigneeKind } from "./AssigneeSelector";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateIssueModal({ onClose, onCreated }: Props) {
  const { apiClient, workspaceId } = useCoreContext();
  const createIssue = useCreateIssue();
  const { data: agents = [] } = useQuery(agentListOptions(apiClient, workspaceId));
  const { data: members = [] } = useQuery(workspaceMembersOptions(apiClient, workspaceId));

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("no_priority");
  const [kind, setKind] = useState<AssigneeKind>("none");
  const [agentId, setAgentId] = useState("");
  const [userId, setUserId] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const body: Parameters<typeof createIssue.mutateAsync>[0] = {
      workspaceId,
      title: title.trim(),
      status,
      priority,
    };

    if (kind === "agent" && agentId) {
      body.assignee_type = "agent";
      body.agent_assignee_id = agentId;
    } else if (kind === "member" && userId) {
      body.assignee_type = "member";
      body.user_assignee_id = userId;
    }

    await createIssue.mutateAsync(body);

    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-foreground">New Issue</h2>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title"
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="backlog">Backlog</option>
                <option value="todo">Todo</option>
                <option value="in_progress">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="in_review">In Review</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="no_priority">No Priority</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <AssigneeSelector
            kind={kind}
            agentId={agentId}
            userId={userId}
            agents={agents}
            members={members}
            onChange={(next) => {
              setKind(next.kind);
              if (next.agentId !== undefined) setAgentId(next.agentId);
              if (next.userId !== undefined) setUserId(next.userId);
            }}
          />

          {createIssue.error && (
            <p className="text-sm text-destructive">{createIssue.error.message}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createIssue.isPending || !title.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {createIssue.isPending ? "Creating…" : "Create Issue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
