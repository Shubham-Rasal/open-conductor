import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  agentKeys,
  agentListOptions,
  detectAgentsOptions,
  useSpawnAgent,
  useStopManagedAgent,
} from "@open-conductor/core/agents";
import type { DetectedTool } from "@open-conductor/core/agents";
import { useCoreContext } from "@open-conductor/core/platform";
import type { Agent, AgentIntegrationTestResult } from "@open-conductor/core/types";
import { ConnectAgentModal } from "./ConnectAgentModal";
import { EditAgentPromptModal } from "./EditAgentPromptModal";
import { ProviderIcon } from "./ProviderIcon";

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  idle:    "bg-success",
  working: "bg-brand animate-pulse",
  blocked: "bg-warning",
  error:   "bg-destructive",
  offline: "bg-muted-foreground/50",
};

const STATUS_LABEL: Record<string, string> = {
  idle:    "Idle",
  working: "Working",
  blocked: "Blocked",
  error:   "Error",
  offline: "Offline",
};

// ── Unified agent card ────────────────────────────────────────────────────────

type IntegrationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: AgentIntegrationTestResult }
  | { status: "error"; message: string };

function AgentCard({
  tool,
  agent,
  onConnect,
  onEditPrompt,
  onDisconnect,
  onReconnect,
  onSpawn,
  onStop,
  actionBusy,
  integrationTest,
  onTestIntegration,
}: {
  tool?: DetectedTool;
  agent?: Agent;
  onConnect?: () => void;
  onEditPrompt?: () => void;
  onDisconnect?: () => void;
  onReconnect?: () => void;
  onSpawn?: () => void;
  onStop?: () => void;
  actionBusy: "disconnect" | "reconnect" | "spawn" | "stop" | null;
  integrationTest?: IntegrationState;
  onTestIntegration?: () => void;
}) {
  const provider = tool?.provider ?? agent?.name.toLowerCase().replace(/\s+/g, "") ?? "unknown";
  const displayName = agent?.name ?? tool?.label ?? provider;
  const runtimeOnline = agent?.runtime?.status === "online";
  const isConnected = !!agent;
  const unavailable = tool ? !tool.available && !isConnected : false;

  const agentStatus = agent?.status ?? "offline";
  const dotColor = isConnected ? (STATUS_COLOR[agentStatus] ?? "bg-muted-foreground/50") : "bg-muted-foreground/30";
  const statusLabel = isConnected ? (STATUS_LABEL[agentStatus] ?? agentStatus) : "Not connected";

  const testHint =
    integrationTest?.status === "done"
      ? { ok: integrationTest.result.ok, text: integrationTest.result.message }
      : integrationTest?.status === "error"
        ? { ok: false, text: integrationTest.message }
        : null;

  return (
    <div
      className={`rounded-xl border bg-card px-5 py-4 transition-opacity ${
        unavailable ? "border-border/40 opacity-50" : "border-border/70"
      }`}
    >
      {/* Top row: icon + info + primary action */}
      <div className="flex items-start gap-4">
        {/* Icon */}
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted [&_svg]:h-6 [&_svg]:w-6">
          <ProviderIcon provider={provider} className="h-6 w-6" />
        </span>

        {/* Name + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{displayName}</p>
            {/* Status dot + label */}
            <span className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
              <span className="text-[11px] text-muted-foreground">{statusLabel}</span>
            </span>
          </div>

          {/* Meta line */}
          <p className="mt-0.5 text-[11px] text-muted-foreground/60">
            {tool ? `v${tool.version} · ${tool.path}` : ""}
            {tool?.default_model ? ` · ${tool.default_model}` : ""}
          </p>

          {/* Prompt preview */}
          {agent?.instructions && (
            <p className="mt-1 truncate text-xs text-muted-foreground/70">
              {agent.instructions}
            </p>
          )}

          {/* Warnings */}
          {tool?.warning && (
            <p className="mt-1 text-[11px] text-amber-500">⚠ {tool.warning}</p>
          )}
          {unavailable && tool?.reason && (
            <p className="mt-1 text-[11px] text-destructive/70">⚠ {tool.reason}</p>
          )}

          {/* Integration test result */}
          {testHint && (
            <p className={`mt-1.5 text-[11px] ${testHint.ok ? "text-success" : "text-destructive"}`}>
              {testHint.ok ? "✓" : "✗"} {testHint.text}
            </p>
          )}
        </div>

        {/* Primary action */}
        <div className="flex flex-shrink-0 items-center gap-2">
          {!isConnected && !unavailable && (
            <button
              type="button"
              onClick={onConnect}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Connect
            </button>
          )}

          {isConnected && runtimeOnline && (
            <button
              type="button"
              onClick={onStop}
              disabled={actionBusy !== null}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors disabled:opacity-40"
            >
              {actionBusy === "stop" ? "Stopping…" : "Stop"}
            </button>
          )}

          {isConnected && !runtimeOnline && (
            <button
              type="button"
              onClick={onSpawn}
              disabled={actionBusy !== null}
              className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/15 transition-colors disabled:opacity-40"
            >
              {actionBusy === "spawn" ? "Spawning…" : "Spawn"}
            </button>
          )}
        </div>
      </div>

      {/* Bottom row: secondary actions (only when connected) */}
      {isConnected && (
        <div className="mt-3 flex items-center gap-2 border-t border-border/40 pt-3">
          <button
            type="button"
            onClick={onEditPrompt}
            disabled={actionBusy !== null}
            className="rounded-md border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
          >
            Edit prompt
          </button>

          <button
            type="button"
            onClick={onTestIntegration}
            disabled={integrationTest?.status === "loading" || actionBusy !== null}
            className="rounded-md border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
          >
            {integrationTest?.status === "loading" ? "Testing…" : "Test"}
          </button>

          <div className="flex-1" />

          {runtimeOnline ? (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={actionBusy !== null}
              className="rounded-md px-2.5 py-1 text-[11px] text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
            >
              {actionBusy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onReconnect}
              disabled={actionBusy !== null}
              className="rounded-md px-2.5 py-1 text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
            >
              {actionBusy === "reconnect" ? "Reconnecting…" : "Reconnect"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

type AgentActionBusy = "disconnect" | "reconnect" | "spawn" | "stop" | undefined;

export function AgentListView() {
  const { apiClient, workspaceId } = useCoreContext();
  const qc = useQueryClient();

  const [connectTool, setConnectTool] = useState<DetectedTool | null>(null);
  const [promptAgent, setPromptAgent] = useState<Agent | null>(null);
  const [integrationTestByAgent, setIntegrationTestByAgent] = useState<Record<string, IntegrationState>>({});
  const [agentActionBusy, setAgentActionBusy] = useState<Record<string, AgentActionBusy>>({});

  const spawnAgent = useSpawnAgent();
  const stopManaged = useStopManagedAgent();

  const { data: agents = [], isLoading: agentsLoading } = useQuery(agentListOptions(apiClient, workspaceId));
  const { data: detected = [], isLoading: detectLoading } = useQuery(detectAgentsOptions(apiClient, workspaceId));

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function runIntegrationTest(agent: Agent) {
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
    setAgentActionBusy((m) => ({ ...m, [agent.id]: "disconnect" }));
    try {
      await apiClient.post(`/api/workspaces/${workspaceId}/agents/${agent.id}/disconnect`);
      await qc.invalidateQueries({ queryKey: agentKeys.list(workspaceId) });
    } finally {
      setAgentActionBusy((m) => ({ ...m, [agent.id]: undefined }));
    }
  }

  async function reconnectAgent(agent: Agent) {
    setAgentActionBusy((m) => ({ ...m, [agent.id]: "reconnect" }));
    try {
      await apiClient.post(`/api/workspaces/${workspaceId}/agents/${agent.id}/reconnect`, {});
      await qc.invalidateQueries({ queryKey: agentKeys.list(workspaceId) });
    } finally {
      setAgentActionBusy((m) => ({ ...m, [agent.id]: undefined }));
    }
  }

  async function spawnManaged(agent: Agent) {
    setAgentActionBusy((m) => ({ ...m, [agent.id]: "spawn" }));
    try {
      await spawnAgent.mutateAsync(agent.id);
    } finally {
      setAgentActionBusy((m) => ({ ...m, [agent.id]: undefined }));
    }
  }

  async function stopSpawn(agent: Agent) {
    setAgentActionBusy((m) => ({ ...m, [agent.id]: "stop" }));
    try {
      await stopManaged.mutateAsync(agent.id);
    } finally {
      setAgentActionBusy((m) => ({ ...m, [agent.id]: undefined }));
    }
  }

  // ── Merge detected tools + connected agents into unified list ─────────────────

  // Map provider → connected agent (heuristic: name includes provider string)
  const agentByProvider = new Map<string, Agent>();
  for (const agent of agents as Agent[]) {
    for (const tool of detected) {
      if (agent.name.toLowerCase().includes(tool.provider)) {
        agentByProvider.set(tool.provider, agent);
      }
    }
  }

  // Agents with no matching detected tool
  const unmatchedAgents = (agents as Agent[]).filter(
    (a) => !detected.some((t) => a.name.toLowerCase().includes(t.provider))
  );

  const isLoading = agentsLoading || detectLoading;

  return (
    <div className="flex h-full flex-col bg-canvas/85 backdrop-blur-[2px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/70 bg-background/40 px-6 py-4">
        <h1 className="text-sm font-semibold text-foreground">Agents</h1>
        {(agents as Agent[]).length > 0 && (
          <button
            type="button"
            onClick={() => { for (const a of agents as Agent[]) void spawnManaged(a); }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            Spawn all
          </button>
        )}
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading agents…</p>
        )}

        {!isLoading && detected.length === 0 && (agents as Agent[]).length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">No agents found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Install Claude Code, OpenCode, or Codex and they will appear here.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {/* One card per detected tool */}
          {detected.map((tool) => {
            const agent = agentByProvider.get(tool.provider);
            return (
              <AgentCard
                key={tool.provider}
                tool={tool}
                agent={agent}
                onConnect={() => setConnectTool(tool)}
                onEditPrompt={agent ? () => setPromptAgent(agent) : undefined}
                onDisconnect={agent ? () => void disconnectAgent(agent) : undefined}
                onReconnect={agent ? () => void reconnectAgent(agent) : undefined}
                onSpawn={agent ? () => void spawnManaged(agent) : undefined}
                onStop={agent ? () => void stopSpawn(agent) : undefined}
                actionBusy={agent ? (agentActionBusy[agent.id] ?? null) : null}
                integrationTest={agent ? integrationTestByAgent[agent.id] : undefined}
                onTestIntegration={agent ? () => void runIntegrationTest(agent) : undefined}
              />
            );
          })}

          {/* Agents with no matching detected tool */}
          {unmatchedAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onEditPrompt={() => setPromptAgent(agent)}
              onDisconnect={() => void disconnectAgent(agent)}
              onReconnect={() => void reconnectAgent(agent)}
              onSpawn={() => void spawnManaged(agent)}
              onStop={() => void stopSpawn(agent)}
              actionBusy={agentActionBusy[agent.id] ?? null}
              integrationTest={integrationTestByAgent[agent.id]}
              onTestIntegration={() => void runIntegrationTest(agent)}
            />
          ))}
        </div>
      </div>

      <ConnectAgentModal
        open={connectTool !== null}
        tool={connectTool}
        onClose={() => setConnectTool(null)}
      />
      <EditAgentPromptModal
        open={promptAgent !== null}
        agent={promptAgent}
        onClose={() => setPromptAgent(null)}
      />
    </div>
  );
}
