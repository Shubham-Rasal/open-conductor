import { contextBridge } from "electron";

// Expose a minimal API surface to the renderer process.
// Keep this as small as possible — prefer using fetch/WebSocket directly.
contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
});
