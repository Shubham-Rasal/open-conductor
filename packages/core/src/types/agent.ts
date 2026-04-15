export type AgentStatus = "idle" | "working" | "blocked" | "error" | "offline";

export interface AgentRuntime {
  id: string;
  agent_id: string;
  workspace_id: string;
  provider: string;
  status: "online" | "offline";
  device_name: string | null;
  last_seen_at: string | null;
}

export interface Agent {
  id: string;
  workspace_id: string;
  name: string;
  instructions: string;
  status: AgentStatus;
  max_concurrent_tasks: number;
  created_at: string;
  updated_at: string;
  model?: string | null;
  spawn_mode?: "daemon" | "managed";
  /** Present when listing agents; reflects agent_runtimes for this agent. */
  runtime?: AgentRuntime;
}

/** Result of POST .../agents/:id/test — checks daemon runtime + in-process task runner. */
export interface AgentIntegrationTestResult {
  ok: boolean;
  message: string;
  runner_active: boolean;
  runtime_online: boolean;
  provider?: string;
  last_seen_at?: string;
}
