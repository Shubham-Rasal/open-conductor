import type { Agent } from "../types/agent";

/** Collapse spaces so "Open Code" matches OpenCode / opencode. */
function compactLower(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

/** Map DB/runtime/provider variants to the three agent-model API keys. */
function normalizeRuntimeProvider(raw: string): "claude" | "codex" | "opencode" | null {
  const p = raw.trim().toLowerCase();
  if (p === "claude" || p === "codex" || p === "opencode") {
    return p;
  }
  const c = p.replace(/[-_\s]+/g, "");
  if (c === "claudecode" || c === "anthropic" || p === "claude-code" || p === "claude_code") {
    return "claude";
  }
  if (c === "openai" || p === "chatgpt") {
    return "codex";
  }
  if (c === "opencode" || p === "open-code" || p === "open_code") {
    return "opencode";
  }
  if (p.startsWith("claude")) return "claude";
  if (p.startsWith("codex")) return "codex";
  if (p.startsWith("opencode")) return "opencode";
  return null;
}

/** Align with server agent runtime `provider` (preferred) or agent name. */
export function inferChatAgentProvider(agent: Agent): "claude" | "codex" | "opencode" | null {
  const fromRuntime = normalizeRuntimeProvider(agent.runtime?.provider ?? "");
  if (fromRuntime) return fromRuntime;

  const n = compactLower(agent.name);
  if (n.includes("opencode")) return "opencode";
  if (n.includes("codex")) return "codex";
  if (n.includes("claude")) return "claude";
  return null;
}

/** Provider for loading `/api/agent-models` — never null when an agent row exists (defaults to Claude). */
export function inferChatAgentProviderForModels(agent: Agent): "claude" | "codex" | "opencode" {
  const p = inferChatAgentProvider(agent);
  if (p) return p;
  const n = compactLower(agent.name);
  if (n.includes("codex")) return "codex";
  if (n.includes("opencode")) return "opencode";
  return "claude";
}
