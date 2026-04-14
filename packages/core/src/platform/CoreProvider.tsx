import { QueryClient, QueryClientProvider, useQueryClient, useQuery } from "@tanstack/react-query";
import { type ReactNode, createContext, useContext, useRef, useEffect, useState } from "react";
import { ApiClient } from "../api/client";
import { WsClient } from "../api/ws";
import { useAuthStore } from "../auth/store";
import { onIssueCreated, onIssueUpdated, onIssueDeleted, issueKeys } from "../issues";
import { agentKeys, type ListAgentsResponse } from "../agents";
import type { Issue, Agent, AgentTask, TaskMessage, TaskStageEvent } from "../types";

interface CoreContextValue {
  apiClient: ApiClient;
  wsClient: WsClient;
  workspaceId: string;
  /** Live streaming messages keyed by issue_id */
  taskMessages: Map<string, TaskMessage[]>;
}

const CoreContext = createContext<CoreContextValue | null>(null);

export function useCoreContext(): CoreContextValue {
  const ctx = useContext(CoreContext);
  if (!ctx) throw new Error("useCoreContext must be used within CoreProvider");
  return ctx;
}

// Shared taskMessages map — mutated in place, components subscribe via wsClient events
const taskMessagesStore = new Map<string, TaskMessage[]>();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

interface CoreProviderProps {
  children: ReactNode;
  apiBaseUrl: string;
  wsUrl: string;
  workspaceId?: string;
}

function WsEventBridge({ workspaceId }: { workspaceId: string }) {
  const { wsClient } = useCoreContext();
  const qc = useQueryClient();

  useEffect(() => {
    wsClient.connect();

    // ── Issue events ──────────────────────────────────────────────────────
    const offCreated = wsClient.on("issue:created", (e) => {
      onIssueCreated(qc, workspaceId, e.payload as Issue);
    });
    const offUpdated = wsClient.on("issue:updated", (e) => {
      onIssueUpdated(qc, workspaceId, e.payload as Issue);
    });
    const offDeleted = wsClient.on("issue:deleted", (e) => {
      const { id } = e.payload as { id: string };
      onIssueDeleted(qc, workspaceId, id);
    });

    // ── Task stage transitions ─────────────────────────────────────────────
    const offTaskStage = wsClient.on("task:stage", (e) => {
      const evt = e.payload as TaskStageEvent;
      if (!evt.issue_id) return;

      // Invalidate task list for this issue so it refetches
      qc.invalidateQueries({ queryKey: issueKeys.tasks(workspaceId, evt.issue_id) });

      // Optimistically patch the task in the cache
      qc.setQueriesData<AgentTask[]>(
        { queryKey: issueKeys.tasks(workspaceId, evt.issue_id) },
        (old) => {
          if (!old) return old;
          return old.map((t) =>
            t.id === evt.task_id
              ? {
                  ...t,
                  status: evt.stage,
                  output: evt.output ?? t.output,
                  session_id: evt.session_id ?? t.session_id,
                  error_message: evt.error ?? t.error_message,
                  completed_at: (evt.stage === "completed" || evt.stage === "failed")
                    ? new Date().toISOString()
                    : t.completed_at,
                }
              : t
          );
        }
      );

      // If completed, clear live messages for this issue
      if (evt.stage === "completed" || evt.stage === "failed") {
        taskMessagesStore.delete(evt.issue_id);
      }
    });

    // ── Streaming task messages ───────────────────────────────────────────
    const offTaskMsg = wsClient.on("task:message", (e) => {
      const msg = e.payload as TaskMessage;
      if (!msg.issue_id) return;
      const prev = taskMessagesStore.get(msg.issue_id) ?? [];
      taskMessagesStore.set(msg.issue_id, [...prev, msg]);
      // Trigger query cache "touch" so subscribers re-render
      qc.setQueryData(["task:messages", msg.issue_id], [...(taskMessagesStore.get(msg.issue_id) ?? [])]);
    });

    // ── Agent status updates ──────────────────────────────────────────────
    const offAgentStatus = wsClient.on("agent:status", (e) => {
      const { agent_id, status } = e.payload as { agent_id: string; status: string };
      qc.setQueriesData<Agent[]>(
        { queryKey: agentKeys.list(workspaceId) },
        (old) => {
          if (!old) return old;
          return old.map((a) =>
            a.id === agent_id ? { ...a, status: status as Agent["status"] } : a
          );
        }
      );
    });

    return () => {
      offCreated();
      offUpdated();
      offDeleted();
      offTaskStage();
      offTaskMsg();
      offAgentStatus();
      wsClient.disconnect();
    };
  }, [wsClient, qc, workspaceId]);

  return null;
}

/** Keeps agent_runtimes.last_seen_at fresh so the server does not mark runtimes offline (90s sweep). */
function DaemonRuntimeHeartbeat({ workspaceId }: { workspaceId: string }) {
  const { apiClient } = useCoreContext();

  useEffect(() => {
    if (!workspaceId) return;

    async function pingAll() {
      try {
        const res = await apiClient.get<ListAgentsResponse>(
          `/api/workspaces/${workspaceId}/agents`
        );
        for (const a of res.agents) {
          const rt = res.runtimes?.[a.id];
          if (rt?.status !== "online") {
            continue;
          }
          try {
            await apiClient.post("/api/daemon/heartbeat", { agent_id: a.id });
          } catch {
            // Transient error — next tick retries
          }
        }
      } catch {
        // Workspace or list fetch failed — try again on next interval
      }
    }

    void pingAll();
    const id = setInterval(() => void pingAll(), 45_000);
    return () => clearInterval(id);
  }, [apiClient, workspaceId]);

  return null;
}

function WorkspaceBootstrap({
  children,
  apiClient,
  wsClient,
  workspaceId: explicitId,
}: {
  children: ReactNode;
  apiClient: ApiClient;
  wsClient: WsClient;
  workspaceId?: string;
}) {
  // Resolve workspace: prefer explicit prop, then fetch /api/local (public, no auth needed)
  const { data: localConfig } = useQuery({
    queryKey: ["local-config"],
    queryFn: () => apiClient.get<{ workspace_id: string }>("/api/local"),
    enabled: !explicitId,
    staleTime: Infinity,
    retry: 3,
  });

  const [autoWorkspaceId, setAutoWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (explicitId) return;
    if (localConfig?.workspace_id) {
      setAutoWorkspaceId(localConfig.workspace_id);
    }
  }, [localConfig, explicitId]);

  const resolvedId = explicitId ?? autoWorkspaceId;

  const ctxValue: CoreContextValue = {
    apiClient,
    wsClient,
    workspaceId: resolvedId ?? "",
    taskMessages: taskMessagesStore,
  };

  if (!resolvedId) {
    return (
      <CoreContext.Provider value={ctxValue}>
        {children}
      </CoreContext.Provider>
    );
  }

  return (
    <CoreContext.Provider value={ctxValue}>
      <WsEventBridge workspaceId={resolvedId} />
      <DaemonRuntimeHeartbeat workspaceId={resolvedId} />
      {children}
    </CoreContext.Provider>
  );
}

export function CoreProvider({ children, apiBaseUrl, wsUrl, workspaceId }: CoreProviderProps) {
  const token = useAuthStore((s) => s.token);

  const apiClientRef = useRef(
    new ApiClient({
      baseUrl: apiBaseUrl,
      getToken: () => useAuthStore.getState().token,
    })
  );

  const wsClientRef = useRef(
    new WsClient(`${wsUrl}?token=${token ?? ""}`)
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceBootstrap
        apiClient={apiClientRef.current}
        wsClient={wsClientRef.current}
        workspaceId={workspaceId}
      >
        {children}
      </WorkspaceBootstrap>
    </QueryClientProvider>
  );
}
