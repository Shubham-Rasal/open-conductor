/** Optional Electron bridge exposed from apps/desktop preload (may be absent in web builds). */
export interface OpenConductorElectron {
  platform: string;
  gitClone?: (
    url: string,
    parentPath: string
  ) => Promise<{ ok: boolean; target?: string; error?: string }>;
}

declare global {
  interface Window {
    electron?: OpenConductorElectron;
  }
}

export {};
