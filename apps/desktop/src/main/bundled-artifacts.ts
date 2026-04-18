import { existsSync } from "fs";
import { join } from "path";

function exeName(base: string): string {
  return process.platform === "win32" ? `${base}.exe` : base;
}

/** Paths under `process.resourcesPath` after electron-builder `extraResources`. */
export function bundledArtifactPaths(resourcesPath: string): { binDir: string } {
  return {
    binDir: join(resourcesPath, "bin"),
  };
}

export function bundledArtifactsPresent(resourcesPath: string): boolean {
  const { binDir } = bundledArtifactPaths(resourcesPath);
  return (
    existsSync(join(binDir, exeName("server"))) && existsSync(join(binDir, exeName("migrate")))
  );
}
