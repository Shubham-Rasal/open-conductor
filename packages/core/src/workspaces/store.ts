import { create } from "zustand";
import type { Workspace } from "../types";

const STORAGE_KEY = "oc_workspace_id";

interface WorkspaceStore {
  workspace: Workspace | null;
  /**
   * Sync the current workspace against a fresh list.
   * - `preferredId` **undefined**: keep `workspace` only if its id is still in `wsList`; otherwise clear (no auto-pick of first workspace).
   * - `preferredId` **string**: select that id if present, else clear invalid id from storage.
   * If the id is missing from `wsList` but matches the in-memory workspace, keep it — the list can be briefly stale right after create/refetch.
   */
  hydrateWorkspace: (list: Workspace[], preferredId?: string | null) => Workspace | null;
  switchWorkspace: (ws: Workspace) => void;
  clearWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspace: null,

  hydrateWorkspace: (wsList, preferredId) => {
    set((prev) => {
      let want: string | null;
      if (preferredId === undefined) {
        want = prev.workspace?.id ?? null;
      } else if (preferredId === null) {
        want = null;
      } else {
        want = preferredId;
      }
      if (!want) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        return { workspace: null };
      }
      const next = wsList.find((w) => w.id === want) ?? null;
      if (!next) {
        // React Query can hand us a stale workspace list before the refetch that includes a
        // newly created workspace. Clearing here would wipe `workspaceId` in CoreProvider and
        // break agents detection (and other workspace-scoped queries) until the user re-selects
        // a workspace — noticeable in packaged builds where I/O is slower than in dev.
        if (prev.workspace?.id === want) {
          return { workspace: prev.workspace };
        }
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        return { workspace: null };
      }
      try {
        localStorage.setItem(STORAGE_KEY, next.id);
      } catch {
        /* ignore */
      }
      return { workspace: next };
    });
    return get().workspace;
  },

  switchWorkspace: (ws) => {
    try {
      localStorage.setItem(STORAGE_KEY, ws.id);
    } catch {
      /* ignore */
    }
    set({ workspace: ws });
  },

  clearWorkspace: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    set({ workspace: null });
  },
}));
