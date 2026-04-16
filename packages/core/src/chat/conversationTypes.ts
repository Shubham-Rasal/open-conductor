import type { ProposedPlanIssue } from "../types";

export interface ConvMessage {
  id: string;
  role: "user" | "assistant" | "tool_use" | "tool_result" | "thinking" | "plan_proposal";
  content: string;
  createdAt: string;
  tool?: string;
  callId?: string;
  toolInput?: string;
  toolOutput?: string;
  planItems?: ProposedPlanIssue[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  messages: ConvMessage[];
}
