import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCoreContext } from "@open-conductor/core/platform";
import { workspaceKeys } from "@open-conductor/core/workspaces";
import type { Workspace } from "@open-conductor/core/types";

interface Props {
  onCreated: (workspace: Workspace) => void;
}

export function WorkspaceSetupView({ onCreated }: Props) {
  const { apiClient } = useCoreContext();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const ws = await apiClient.post<Workspace>("/api/workspaces", {
        name,
        prefix: prefix.toUpperCase() || name.slice(0, 3).toUpperCase(),
      });
      qc.invalidateQueries({ queryKey: workspaceKeys.list() });
      onCreated(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-foreground">Create your workspace</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          A workspace holds your issues and agents.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Workspace name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="My Project"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Issue prefix</label>
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.slice(0, 5).toUpperCase())}
              placeholder="OC"
              maxLength={5}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Issues will be labeled {prefix || "OC"}-1, {prefix || "OC"}-2, …</p>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create workspace"}
          </button>
        </form>
      </div>
    </div>
  );
}
