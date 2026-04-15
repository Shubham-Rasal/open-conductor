import { useState } from "react";
import { getPickDirectory } from "../pickDirectory";
import { useCoreContext } from "@open-conductor/core/platform";
import { useCreateWorkspace } from "@open-conductor/core/workspaces";
import type { Workspace, WorkspaceType } from "@open-conductor/core/types";

interface Props {
  onCreated: (workspace: Workspace) => void;
  onCancel?: () => void;
  /** When true, render a compact card for use inside a modal overlay. */
  compact?: boolean;
}

export function WorkspaceSetupView({ onCreated, onCancel, compact }: Props) {
  const { apiClient } = useCoreContext();
  const createWs = useCreateWorkspace(apiClient);
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [wsType, setWsType] = useState<WorkspaceType>("local");
  const [connectionURL, setConnectionURL] = useState("");
  const [workingDir, setWorkingDir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pickBusy, setPickBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const wd = workingDir.trim();
      const ws = await createWs.mutateAsync({
        name: name.trim(),
        prefix: prefix.toUpperCase() || undefined,
        type: wsType,
        connection_url: wsType === "remote" ? connectionURL.trim() || null : null,
        working_directory: wd === "" ? null : wd,
      });
      onCreated(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    }
  }

  async function browseWorkingDir() {
    const pick = getPickDirectory();
    if (!pick) return;
    setPickBusy(true);
    try {
      const res = await pick();
      if (res.ok) setWorkingDir(res.path);
    } finally {
      setPickBusy(false);
    }
  }

  const inner = (
    <>
      <h1 className="mb-1 text-xl font-semibold text-foreground">Create workspace</h1>
      <p className="mb-6 text-sm text-muted-foreground">A workspace holds your issues and agents.</p>

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
          <label className="text-sm font-medium text-foreground">Type</label>
          <select
            value={wsType}
            onChange={(e) => setWsType(e.target.value as WorkspaceType)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="local">Local — agents run on this machine</option>
            <option value="remote">Remote — connect to another Open Conductor server</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Working directory</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              placeholder="/path/to/repo (optional)"
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              disabled={pickBusy || !getPickDirectory()}
              title={getPickDirectory() ? "Choose folder" : "Available in the desktop app"}
              onClick={() => void browseWorkingDir()}
              className="shrink-0 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              {pickBusy ? "…" : "Browse…"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Agents run CLI tools with this folder as the current directory. Tilde (~) is expanded.
          </p>
        </div>

        {wsType === "remote" && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Server base URL</label>
            <input
              type="url"
              value={connectionURL}
              onChange={(e) => setConnectionURL(e.target.value)}
              required={wsType === "remote"}
              placeholder="https://host:8080"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Must expose GET /api/detect-agents (same API as this app).
            </p>
          </div>
        )}

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
          <p className="text-xs text-muted-foreground">
            Issues will be labeled {prefix || "…"}-1, {prefix || "…"}-2, …
          </p>
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={createWs.isPending || !name.trim() || (wsType === "remote" && !connectionURL.trim())}
            className="min-w-0 flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {createWs.isPending ? "Creating…" : "Create workspace"}
          </button>
        </div>
      </form>
    </>
  );

  if (compact) {
    return <div className="text-left">{inner}</div>;
  }

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">{inner}</div>
    </div>
  );
}
