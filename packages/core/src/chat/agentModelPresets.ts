import type { Agent } from "../types/agent";

/** Align with server `inferProviderFromAgentName` / `normalizeAgentProvider`. */
export function inferChatAgentProvider(agent: Agent): "claude" | "codex" | "opencode" | null {
  const p = (agent.runtime?.provider ?? "").toLowerCase();
  for (const k of ["claude", "opencode", "codex"] as const) {
    if (p.includes(k)) return k;
  }
  const n = agent.name.toLowerCase();
  if (n.includes("opencode")) return "opencode";
  if (n.includes("codex")) return "codex";
  if (n.includes("claude")) return "claude";
  return null;
}

export interface ChatModelPreset {
  value: string;
  label: string;
}

/** Suggested model ids for each CLI; users can still type a custom id. */
export const CHAT_MODEL_PRESETS: Record<"claude" | "codex" | "opencode", ChatModelPreset[]> = {
  claude: [
    { value: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5" },
    { value: "claude-opus-4-5-20251101", label: "Opus 4.5" },
    { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  ],
  codex: [
    { value: "gpt-5", label: "GPT-5" },
    { value: "gpt-5-mini", label: "GPT-5 mini" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "o4-mini", label: "o4-mini" },
  ],
  opencode: [
    { value: "anthropic/claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "openai/gpt-4.1", label: "GPT-4.1" },
    { value: "ollama/qwen3:8b", label: "Ollama · Qwen3 8B" },
    { value: "ollama/llama3.2", label: "Ollama · Llama 3.2" },
  ],
};

export function presetsForProvider(p: "claude" | "codex" | "opencode" | null): ChatModelPreset[] {
  if (!p) return [];
  return CHAT_MODEL_PRESETS[p];
}
