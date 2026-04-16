export type TaskStatus = "queued" | "dispatched" | "running" | "completed" | "failed" | "cancelled";

export interface AgentTask {
  id: string;
  agent_id: string;
  issue_id: string | null;
  chat_session_id: string | null;
  status: TaskStatus;
  priority: number;
  output: string | null;
  error_message: string | null;
  session_id: string | null;
  work_dir: string | null;
  branch_name: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/** Streaming message emitted during task execution */
export interface TaskMessage {
  task_id: string;
  issue_id: string;
  content: string;
  kind: "text" | "tool" | "status";
  tool?: string;
  /** Present when emitted by server — use for cache keys when UI workspace differs from event workspace. */
  workspace_id?: string;
}

/** WS payload for task:stage events */
export interface TaskStageEvent {
  task_id: string;
  issue_id: string;
  stage: TaskStatus;
  output?: string;
  session_id?: string;
  error?: string;
  workspace_id?: string;
}
