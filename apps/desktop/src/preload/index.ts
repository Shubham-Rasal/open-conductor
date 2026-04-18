import { contextBridge, ipcRenderer } from "electron";

// Expose a minimal API surface to the renderer process.
// Keep this as small as possible — prefer using fetch/WebSocket directly.
contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  gitClone: (url: string, parentPath: string) =>
    ipcRenderer.invoke("open-conductor:git-clone", { url, parentPath }) as Promise<{
      ok: boolean;
      target?: string;
      error?: string;
    }>,
  pickDirectory: () =>
    ipcRenderer.invoke("open-conductor:pick-directory") as Promise<
      { ok: true; path: string } | { ok: false }
    >,
  setup: {
    getContext: () => ipcRenderer.invoke("open-conductor:setup-context"),
  },
  localRuntime: {
    start: (opts: { postgres?: boolean; server?: boolean }) =>
      ipcRenderer.invoke("open-conductor:bundled-start", opts),
    stop: () => ipcRenderer.invoke("open-conductor:bundled-stop"),
    getState: () => ipcRenderer.invoke("open-conductor:bundled-state"),
  },
});
