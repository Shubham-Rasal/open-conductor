import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { issueListOptions } from "@open-conductor/core/issues";
import { agentListOptions } from "@open-conductor/core/agents";
import { workspaceDetailOptions } from "@open-conductor/core/workspaces";
import { useCoreContext } from "@open-conductor/core/platform";

/**
 * Workspace home: shortcuts to planning chat, issues, agents, plus live agent counts.
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
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workspace</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{ws?.name ?? "…"}</h1>
        {ws?.working_directory && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">{ws.working_directory}</p>
        )}
      </header>

      <div className="mb-6 flex flex-wrap gap-3 rounded-xl border border-border/70 bg-card/40 px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          Agents: <strong className="text-foreground">{onlineAgents}</strong> active
        </span>
        {working > 0 && (
          <span className="text-amber-400">
            {working} working
          </span>
        )}
        <span className="text-muted-foreground">
          · {issues.length} issue{issues.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to={`${base}/chat`}
          className="group rounded-2xl border border-border/80 bg-card/90 p-6 shadow-sm transition hover:border-brand/40 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Plan</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">Planning chat</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Brainstorm with an assistant and break work into issues.
          </p>
        </Link>
        <Link
          to={`${base}/issues`}
          className="group rounded-2xl border border-border/80 bg-card/90 p-6 shadow-sm transition hover:border-brand/40 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Board</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">Issues</h2>
          <p className="mt-2 text-sm text-muted-foreground">Kanban and list views — assign humans or agents.</p>
        </Link>
        <Link
          to={`${base}/agents`}
          className="group rounded-2xl border border-border/80 bg-card/90 p-6 shadow-sm transition hover:border-brand/40 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Swarm</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">Agents</h2>
          <p className="mt-2 text-sm text-muted-foreground">Spawn runtimes, connect CLIs, manage the swarm.</p>
        </Link>
      </div>
    </div>
  );
}
