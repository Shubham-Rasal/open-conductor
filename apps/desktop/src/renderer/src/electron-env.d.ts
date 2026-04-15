export {};

declare global {
  interface Window {
    electron?: {
      platform: NodeJS.Platform;
      gitClone?: (
        url: string,
        parentPath: string
      ) => Promise<{ ok: boolean; target?: string; error?: string }>;
      pickDirectory?: () => Promise<{ ok: true; path: string } | { ok: false }>;
    };
  }
}
