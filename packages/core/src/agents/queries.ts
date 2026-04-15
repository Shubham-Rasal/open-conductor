import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../api/client";
import type { Agent, AgentRuntime } from "../types";

export const agentKeys = {
  list: (wsId: string) => ["agents", wsId, "list"] as const,
  detail: (wsId: string, id: string) => ["agents", wsId, "detail", id] as const,
  detected: (wsId?: string) => ["agents", "detected", wsId ?? "none"] as const,
};

export interface ListAgentsResponse {
  agents: Agent[];
  /** Map of agent id → runtime row (may be missing if never connected). */
  runtimes?: Record<string, AgentRuntime>;
}

export interface DetectedTool {
  provider: string; // "claude" | "opencode" | "codex"
  path: string;
  version: string;
  label: string;
  default_model: string;
  available: boolean;
  reason?: string;
  /** Non-blocking hint (e.g. local LLM from opencode.json not reachable). */
  warning?: string;
}

export function agentListOptions(api: ApiClient, wsId: string) {
  return queryOptions({
    queryKey: agentKeys.list(wsId),
    queryFn: () => api.get<ListAgentsResponse>(`/api/workspaces/${wsId}/agents`),
    select: (data): Agent[] =>
      data.agents.map((agent) => ({
        ...agent,
        runtime: data.runtimes?.[agent.id],
      })),
    // Empty wsId would produce /api/workspaces//agents → router 404 ("404 page not found")
    enabled: !!wsId,
  });
}

export function detectAgentsOptions(api: ApiClient, workspaceId?: string) {
  const q = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : "";
  return queryOptions({
    queryKey: agentKeys.detected(workspaceId),
    queryFn: () => api.get<DetectedTool[]>(`/api/detect-agents${q}`),
    staleTime: 60_000,
    enabled: Boolean(workspaceId),
  });
}
