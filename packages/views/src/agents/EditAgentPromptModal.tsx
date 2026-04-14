import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCoreContext } from "@open-conductor/core/platform";
import { agentKeys } from "@open-conductor/core/agents";
import type { Agent } from "@open-conductor/core/types";

interface Props {
  agent: Agent;
  onClose: () => void;
}

export function EditAgentPromptModal({ agent, onClose }: Props) {
  const { apiClient, workspaceId } = useCoreContext();
  const qc = useQueryClient();
  const [instructions, setInstructions] = useState(agent.instructions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) {
      setError("Workspace is not ready yet.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await apiClient.patch<Agent>(`/api/workspaces/${workspaceId}/agents/${agent.id}`, {
        instructions,
      });
      await qc.invalidateQueries({ queryKey: agentKeys.list(workspaceId) });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-foreground">System prompt</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {agent.name} — appended to the agent before each task (provider-specific behavior).
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Prompt text
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[120px]"
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
              disabled={loading}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
