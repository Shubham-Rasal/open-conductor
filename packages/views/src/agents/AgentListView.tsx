import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { agentKeys, agentListOptions, detectAgentsOptions } from "@open-conductor/core/agents";
import type { DetectedTool } from "@open-conductor/core/agents";
import { useCoreContext } from "@open-conductor/core/platform";
import type { Agent, AgentIntegrationTestResult } from "@open-conductor/core/types";
import { ConnectAgentModal } from "./ConnectAgentModal";
import { EditAgentPromptModal } from "./EditAgentPromptModal";

// ─── Status dot ────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  idle:    "bg-success",
  working: "bg-brand animate-pulse",
  blocked: "bg-warning",
  error:   "bg-destructive",
  offline: "bg-muted-foreground",
};

// ─── Provider icon / label ────────────────────────────────────────────────────

const PROVIDER_ICON: Record<string, string> = {
  claude:   "✦",
  opencode: "◈",
  codex:    "⬡",
};

// ─── Detected tool row ────────────────────────────────────────────────────────

function DetectedToolRow({
  tool,
  connected,
  onConnect,
}: {
  tool: DetectedTool;
  connected: boolean;
  onConnect: () => void;
}) {
  const unavailable = !tool.available && !connected;

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${unavailable ? "border-border/50 bg-muted/30 opacity-70" : "border-border bg-card"}`}>
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-base font-bold text-sidebar-accent-foreground">
        {PROVIDER_ICON[tool.provider] ?? "◉"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{tool.label}</p>
        <p className="text-xs text-muted-foreground">v{tool.version} · {tool.path}</p>
        {tool.default_model && (
          <p className="text-[11px] text-muted-foreground/70">model: {tool.default_model}</p>
        )}
        {unavailable && tool.reason && (
          <p className="text-[11px] text-destructive/80">⚠ {tool.reason}</p>
        )}
      </div>
      {connected ? (
        <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Connected
        </span>
      ) : unavailable ? (
        <span className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground cursor-not-allowed">
          Unavailable
        </span>
      ) : (
        <button
          onClick={onConnect}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          Connect
        </button>
      )}
    </div>
  );
}

// ─── Connected agent row ──────────────────────────────────────────────────────

type IntegrationTestRowState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: AgentIntegrationTestResult }
  | { status: "error"; message: string };

function AgentRow({
  agent,
  onEditPrompt,
  integrationTest,
  onTestIntegration,
  onDisconnect,
  onReconnect,
  actionBusy,
}: {
  agent: Agent;
  onEditPrompt: () => void;
  integrationTest: IntegrationTestRowState | undefined;
  onTestIntegration: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  actionBusy: "disconnect" | "reconnect" | null;
}) {
  const dot = STATUS_DOT[agent.status] ?? "bg-muted-foreground";
  const testing = integrationTest?.status === "loading";
  const runtimeOnline = agent.runtime?.status === "online";
  const testHint =
    integrationTest?.status === "done"
      ? { ok: integrationTest.result.ok, text: integrationTest.result.message }
      : integrationTest?.status === "error"
        ? { ok: false, text: integrationTest.message }
        : null;

  return (
    <div className="border-b border-border px-6 py-4 last:border-0">
      <div className="flex items-center gap-3">
        <span className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{agent.name}</p>
          {agent.instructions ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{agent.instructions}</p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground/70 italic">No system prompt set</p>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          {runtimeOnline ? (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={actionBusy !== null}
              className="rounded-md border border-destructive/40 bg-background px-2.5 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {actionBusy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onReconnect}
              disabled={actionBusy !== null}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              {actionBusy === "reconnect" ? "Reconnecting…" : "Reconnect"}
            </button>
          )}
          <button
            type="button"
            onClick={onTestIntegration}
            disabled={testing || actionBusy !== null}
            className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test integration"}
          </button>
          <button
            type="button"
            onClick={onEditPrompt}
            disabled={actionBusy !== null}
            className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            Edit prompt
          </button>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
            {agent.status}
          </span>
        </div>
      </div>
      {testHint && (
        <p
          className={`mt-2 pl-5 text-[11px] leading-snug ${testHint.ok ? "text-success" : "text-destructive"}`}
        >
          {testHint.text}
        </p>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function AgentListView() {
  const { apiClient, workspaceId } = useCoreContext();
  const qc = useQueryClient();
  const [connectTool, setConnectTool] = useState<DetectedTool | null>(null);
  const [promptAgent, setPromptAgent] = useState<Agent | null>(null);
  const [integrationTestByAgent, setIntegrationTestByAgent] = useState<
    Record<string, IntegrationTestRowState>
  >({});
  const [agentActionBusy, setAgentActionBusy] = useState<
    Record<string, "disconnect" | "reconnect" | undefined>
  >({});

  async function runIntegrationTest(agent: Agent) {
    if (!workspaceId) {
      setIntegrationTestByAgent((m) => ({
        ...m,
        [agent.id]: { status: "error", message: "Workspace is not ready yet." },
      }));
      return;
    }
    setIntegrationTestByAgent((m) => ({ ...m, [agent.id]: { status: "loading" } }));
    try {
      const result = await apiClient.post<AgentIntegrationTestResult>(
        `/api/workspaces/${workspaceId}/agents/${agent.id}/test`,
        {}
      );
      setIntegrationTestByAgent((m) => ({ ...m, [agent.id]: { status: "done", result } }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Request failed";
      setIntegrationTestByAgent((m) => ({ ...m, [agent.id]: { status: "error", message } }));
    }
  }

  async function disconnectAgent(agent: Agent) {
    if (!workspaceId) return;
    setAgentActionBusy((m) => ({ ...m, [agent.id]: "disconnect" }));
    try {
      await apiClient.post(`/api/workspaces/${workspaceId}/agents/${agent.id}/disconnect`);
      await qc.invalidateQueries({ queryKey: agentKeys.list(workspaceId) });
    } finally {
      setAgentActionBusy((m) => ({ ...m, [agent.id]: undefined }));
    }
  }

  async function reconnectAgent(agent: Agent) {
    if (!workspaceId) return;
    setAgentActionBusy((m) => ({ ...m, [agent.id]: "reconnect" }));
    try {
      await apiClient.post(`/api/workspaces/${workspaceId}/agents/${agent.id}/reconnect`, {});
      await qc.invalidateQueries({ queryKey: agentKeys.list(workspaceId) });
    } finally {
      setAgentActionBusy((m) => ({ ...m, [agent.id]: undefined }));
    }
  }

  const { data: agents = [], isLoading: agentsLoading } = useQuery(
    agentListOptions(apiClient, workspaceId)
  );
  const { data: detected = [], isLoading: detectLoading } = useQuery(
    detectAgentsOptions(apiClient)
  );

  // Which providers are already connected?
  // We don't store provider on Agent yet, so we use name matching as a heuristic.
  // The daemon register call sets the provider on agent_runtimes — for now, show
  // "Connected" if any agent shares the same label prefix as the tool.
  const connectedProviders = new Set(
    detected
      .filter((t) => agents.some((a: Agent) => a.name.toLowerCase().includes(t.provider)))
      .map((t) => t.provider)
  );

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-sm font-semibold text-foreground">Agents</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Detected tools section ── */}
        <div className="px-6 pt-5 pb-2">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Available on this machine
          </p>

          {detectLoading && (
            <p className="text-sm text-muted-foreground">Scanning for AI tools…</p>
          )}

          {!detectLoading && detected.length === 0 && (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
              <p className="text-sm font-medium text-foreground">No AI tools detected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Install Claude Code, OpenCode, or Codex and they will appear here automatically.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {detected.map((tool) => (
              <DetectedToolRow
                key={tool.provider}
                tool={tool}
                connected={connectedProviders.has(tool.provider)}
                onConnect={() => setConnectTool(tool)}
              />
            ))}
          </div>
        </div>

        {/* ── Connected agents section ── */}
        {(agentsLoading || agents.length > 0) && (
          <div className="mt-6 px-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Connected agents
            </p>
          </div>
        )}

        {agentsLoading && (
          <p className="px-6 py-4 text-sm text-muted-foreground">Loading…</p>
        )}

        {!agentsLoading && agents.length > 0 && (
          <div className="rounded-lg border border-border mx-6 mb-6 overflow-hidden">
            {agents.map((agent: Agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                integrationTest={integrationTestByAgent[agent.id]}
                onTestIntegration={() => void runIntegrationTest(agent)}
                onEditPrompt={() => setPromptAgent(agent)}
                onDisconnect={() => void disconnectAgent(agent)}
                onReconnect={() => void reconnectAgent(agent)}
                actionBusy={agentActionBusy[agent.id] ?? null}
              />
            ))}
          </div>
        )}
      </div>

      {/* Connect modal */}
      {connectTool && (
        <ConnectAgentModal
          tool={connectTool}
          onClose={() => setConnectTool(null)}
        />
      )}

      {promptAgent && (
        <EditAgentPromptModal
          agent={promptAgent}
          onClose={() => setPromptAgent(null)}
        />
      )}
    </div>
  );
}
