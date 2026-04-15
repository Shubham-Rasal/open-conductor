/** Desktop Electron preload: native folder dialog. Undefined in web or without preload. */

export type PickDirectoryFn = () => Promise<{ ok: true; path: string } | { ok: false }>;

export function getPickDirectory(): PickDirectoryFn | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & { electron?: { pickDirectory?: PickDirectoryFn } };
  return w.electron?.pickDirectory;
}
