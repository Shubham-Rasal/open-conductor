export type BundledRuntimeStatePayload =
  | { phase: "stopped" }
  | { phase: "starting"; message: string }
  | { phase: "running"; postgres: boolean; server: boolean }
  | { phase: "error"; message: string };

/** Optional Electron bridge exposed from apps/desktop preload (may be absent in web builds). */
export interface OpenConductorElectron {
  platform: string;
  getFullscreen?: () => Promise<boolean>;
  subscribeFullscreen?: (callback: (fullscreen: boolean) => void) => () => void;
  gitClone?: (
    url: string,
    parentPath: string
  ) => Promise<{ ok: boolean; target?: string; error?: string }>;
  pickDirectory?: () => Promise<{ ok: true; path: string } | { ok: false }>;
  setup?: {
    getContext: () => Promise<{
      diagnostics: {
        bundledBinariesPresent: boolean;
        packaged: boolean;
        dockerCliAvailable: boolean;
        dockerDaemonRunning: boolean;
        goCliAvailable: boolean;
        platform: string;
      };
      bundledState: BundledRuntimeStatePayload;
    }>;
  };
  localRuntime?: {
    start: (opts: {
      postgres?: boolean;
      server?: boolean;
    }) => Promise<{ ok: true } | { ok: false; error: string }>;
    stop: () => Promise<{ ok: true }>;
    getState: () => Promise<BundledRuntimeStatePayload>;
  };
}

declare global {
  interface Window {
    electron?: OpenConductorElectron;
  }
}

export {};
