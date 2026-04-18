import { existsSync, readdirSync } from "fs";
import { join } from "path";

function exeName(base: string): string {
  return process.platform === "win32" ? `${base}.exe` : base;
}

/** Paths under `process.resourcesPath` after electron-builder `extraResources`. */
export function bundledArtifactPaths(resourcesPath: string): {
  binDir: string;
  migrationsDir: string;
} {
  return {
    binDir: join(resourcesPath, "bin"),
    migrationsDir: join(resourcesPath, "migrations"),
  };
}

export function bundledArtifactsPresent(resourcesPath: string): boolean {
  const { binDir, migrationsDir } = bundledArtifactPaths(resourcesPath);
  if (
    !existsSync(join(binDir, exeName("server"))) ||
    !existsSync(join(binDir, exeName("migrate"))) ||
    !existsSync(migrationsDir)
  ) {
    return false;
  }
  try {
    const sql = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    return sql.length > 0;
  } catch {
    return false;
  }
}
