import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCoreContext } from "@open-conductor/core/platform";
import { agentKeys } from "@open-conductor/core/agents";
import type { DetectedTool } from "@open-conductor/core/agents";
import type { Agent } from "@open-conductor/core/types";
import { ProviderIcon } from "./ProviderIcon";

interface Props {
  tool: DetectedTool;
  onClose: () => void;
}

const DEFAULT_INSTRUCTIONS: Record<string, string> = {
  claude: "You are a helpful software engineering assistant. Complete the assigned task by reading the issue description, understanding the codebase, and implementing the required changes. Write clean, well-tested code.",
  opencode: "You are a helpful software engineering assistant. Complete the assigned task by reading the issue description, understanding the codebase, and implementing the required changes.",
  codex: "You are a helpful software engineering assistant. Implement the task described in the issue. Prefer minimal, focused changes.",
};

export function ConnectAgentModal({ tool, onClose }: Props) {
  const { apiClient, workspaceId } = useCoreContext();
  const qc = useQueryClient();
  const [name, setName] = useState(tool.label);
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS[tool.provider] ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) {
      setError("Workspace is not ready yet. Wait a moment and try again.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // 1. Create the agent record (include default_model if the tool provided one)
      const agent = await apiClient.post<Agent>(`/api/workspaces/${workspaceId}/agents`, {
        name,
        instructions,
        max_concurrent_tasks: 1,
        model: tool.default_model || null,
      });

      // 2. Register runtime → starts the in-process runner
      await apiClient.post("/api/daemon/register", {
        agent_id: agent.id,
        provider: tool.provider,
        default_model: tool.default_model || null,
      });

      // 3. Refresh agent list
      qc.invalidateQueries({ queryKey: agentKeys.list(workspaceId) });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect agent");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground [&_svg]:h-8 [&_svg]:w-8">
            <ProviderIcon provider={tool.provider} className="h-8 w-8" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">Connect {tool.label}</h2>
            <p className="text-xs text-muted-foreground">v{tool.version} · {tool.path}</p>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Agent name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              System instructions
              <span className="ml-1 text-muted-foreground/60">(passed to the agent before every task)</span>
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Connecting…" : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
