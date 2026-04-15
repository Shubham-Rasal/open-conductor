import { create } from "zustand";
import type { Workspace } from "../types";

const STORAGE_KEY = "oc_workspace_id";

interface WorkspaceStore {
  workspace: Workspace | null;
  /** Pick current workspace from a list; persists id to localStorage. */
  hydrateWorkspace: (list: Workspace[], preferredId?: string | null) => Workspace | null;
  switchWorkspace: (ws: Workspace) => void;
  clearWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspace: null,

  hydrateWorkspace: (wsList, preferredId) => {
    const next =
      (preferredId ? wsList.find((w) => w.id === preferredId) : undefined) ?? wsList[0] ?? null;
    if (!next) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      set({ workspace: null });
      return null;
    }
    try {
      localStorage.setItem(STORAGE_KEY, next.id);
    } catch {
      /* ignore */
    }
    set({ workspace: next });
    return next;
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
