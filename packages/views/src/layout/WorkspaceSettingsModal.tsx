import { useEffect, useState } from "react";
import { getPickDirectory } from "../pickDirectory";
import { useQuery } from "@tanstack/react-query";
import { useCoreContext } from "@open-conductor/core/platform";
import { workspaceDetailOptions, useUpdateWorkspace } from "@open-conductor/core/workspaces";

interface Props {
  workspaceId: string | null;
  open: boolean;
  onClose: () => void;
}

export function WorkspaceSettingsModal({ workspaceId, open, onClose }: Props) {
  const { apiClient } = useCoreContext();
  const updateWs = useUpdateWorkspace(apiClient);
  const { data: ws, isLoading } = useQuery({
    ...workspaceDetailOptions(apiClient, workspaceId ?? ""),
    enabled: open && !!workspaceId,
  });

  const [workingDir, setWorkingDir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pickBusy, setPickBusy] = useState(false);

  useEffect(() => {
    if (!open || !ws) return;
    setWorkingDir(ws.working_directory ?? "");
    setError(null);
  }, [open, ws]);

  if (!open || !workspaceId) {
    return null;
  }

  const id = workspaceId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const trimmed = workingDir.trim();
      await updateWs.mutateAsync({
        id,
        working_directory: trimmed === "" ? "" : trimmed,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-foreground">Workspace settings</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Default directory for agent CLIs when running tasks in this workspace (local workspaces only).
        </p>

        {isLoading || !ws ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor="ws-cwd">
                Working directory
              </label>
              <div className="flex gap-2">
                <input
                  id="ws-cwd"
                  type="text"
                  value={workingDir}
                  onChange={(e) => setWorkingDir(e.target.value)}
                  placeholder="/path/to/project or ~/projects/repo"
                  autoComplete="off"
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
                Leave empty to use the server process default (usually where Open Conductor was started). Changes apply to new tasks; reconnect agents if needed.
              </p>
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateWs.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {updateWs.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
