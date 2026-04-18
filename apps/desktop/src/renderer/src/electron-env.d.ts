export {};

export type BundledRuntimeStatePayload =
  | { phase: "stopped" }
  | { phase: "starting"; message: string }
  | { phase: "running"; postgres: boolean; server: boolean }
  | { phase: "error"; message: string };

export type SetupDiagnosticsPayload = {
  bundledBinariesPresent: boolean;
  packaged: boolean;
  dockerCliAvailable: boolean;
  dockerDaemonRunning: boolean;
  goCliAvailable: boolean;
  platform: NodeJS.Platform;
};

export type SetupContextPayload = {
  diagnostics: SetupDiagnosticsPayload;
  bundledState: BundledRuntimeStatePayload;
};

declare global {
  interface Window {
    electron?: {
      platform: NodeJS.Platform;
      gitClone?: (
        url: string,
        parentPath: string
      ) => Promise<{ ok: boolean; target?: string; error?: string }>;
      pickDirectory?: () => Promise<{ ok: true; path: string } | { ok: false }>;
      setup?: {
        getContext: () => Promise<SetupContextPayload>;
      };
      localRuntime?: {
        start: (opts: {
          postgres?: boolean;
          server?: boolean;
        }) => Promise<{ ok: true } | { ok: false; error: string }>;
        stop: () => Promise<{ ok: true }>;
        getState: () => Promise<BundledRuntimeStatePayload>;
      };
    };
  }
}
