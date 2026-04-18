import type { ProposedPlanIssue, ProposedTask } from "../types";

export interface ConvMessage {
  id: string;
  role:
    | "user"
    | "assistant"
    | "tool_use"
    | "tool_result"
    | "thinking"
    | "plan_proposal"
    | "orchestrator_proposal";
  content: string;
  createdAt: string;
  tool?: string;
  callId?: string;
  toolInput?: string;
  toolOutput?: string;
  planItems?: ProposedPlanIssue[];
  proposedTasks?: ProposedTask[];
  /** For orchestrator_proposal: local_id → issue id after user enqueued (persisted in local chat state). */
  orchestratorEnqueuedByLocalId?: Record<string, string>;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  messages: ConvMessage[];
}
