import { type ChildProcess, spawn } from "child_process";
import { mkdir } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";

import { app, ipcMain } from "electron";

import { bundledArtifactsPresent } from "./bundled-artifacts";
import { getSetupDiagnostics } from "./setup-diagnostics";

let serverProc: ChildProcess | null = null;
let starting = false;

/** @deprecated Embedded PostgreSQL was removed; SQLite is always used. Kept for renderer/API compatibility. */
export const BUNDLED_PG_PORT = 55432;

export type BundledRuntimeState =
  | { phase: "stopped" }
  | { phase: "starting"; message: string }
  /** `postgres` is always false (historical field). */
  | { phase: "running"; postgres: boolean; server: boolean }
  | { phase: "error"; message: string };

let lastState: BundledRuntimeState = { phase: "stopped" };

function setState(s: BundledRuntimeState) {
  lastState = s;
}

export function getBundledRuntimeState(): BundledRuntimeState {
  return lastState;
}

function exeName(base: string): string {
  return process.platform === "win32" ? `${base}.exe` : base;
}

function resourcesBinDir(): string {
  return join(process.resourcesPath, "bin");
}

/** True when packaged app includes Go binaries (built in CI). */
export function canRunBundledStack(): boolean {
  if (!app.isPackaged) return false;
  return bundledArtifactsPresent(process.resourcesPath);
}

/** SQLite database file in app userData (WAL/journal siblings alongside it). */
function databaseFilePath(): string {
  return join(app.getPath("userData"), "open-conductor.db");
}

/** DSN for modernc.org/sqlite (foreign keys + WAL applied in Go). */
function databaseUrl(): string {
  return pathToFileURL(databaseFilePath()).href;
}

async function ensureUserDataDir(): Promise<void> {
  await mkdir(app.getPath("userData"), { recursive: true });
}

async function ensureJwtSecret(): Promise<string> {
  const { readFile, writeFile } = await import("fs/promises");
  const p = join(app.getPath("userData"), "bundled-jwt-secret.txt");
  try {
    const existing = (await readFile(p, "utf8")).trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* missing */
  }
  const crypto = await import("crypto");
  const secret = crypto.randomBytes(32).toString("hex");
  await writeFile(p, secret, "utf8");
  return secret;
}

function runMigrate(migrateBin: string, databaseURL: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(migrateBin, [], {
      env: { ...process.env, DATABASE_URL: databaseURL },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr?.on("data", (c: Buffer) => {
      err += c.toString();
    });
    child.stdout?.on("data", (c: Buffer) => {
      err += c.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `migrate exited with code ${code}`));
    });
  });
}

function startServer(serverBin: string, databaseURL: string, jwtSecret: string): void {
  if (serverProc) return;
  serverProc = spawn(serverBin, [], {
    env: {
      ...process.env,
      DATABASE_URL: databaseURL,
      PORT: "8080",
      JWT_SECRET: jwtSecret,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProc.stderr?.on("data", (c: Buffer) => {
    console.error("[open-conductor-server]", c.toString());
  });
  serverProc.stdout?.on("data", (c: Buffer) => {
    console.log("[open-conductor-server]", c.toString());
  });
  serverProc.on("error", (err) => {
    console.error("server process error", err);
  });
  serverProc.on("close", (code) => {
    serverProc = null;
    if (code !== 0 && code !== null) {
      setState({ phase: "error", message: `API server exited (code ${code})` });
    }
  });
}

export async function startBundledStack(options: {
  /** Ignored; SQLite is always used. */
  postgres?: boolean;
  server: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canRunBundledStack()) {
    return { ok: false, error: "Bundled server is not available in this build." };
  }
  if (starting) {
    return { ok: false, error: "Already starting…" };
  }
  if (lastState.phase === "running") {
    return { ok: true };
  }

  starting = true;
  setState({ phase: "starting", message: "Starting…" });

  try {
    await ensureUserDataDir();
    const bin = resourcesBinDir();
    const serverBin = join(bin, exeName("server"));
    const migrateBin = join(bin, exeName("migrate"));

    const dbUrl = databaseUrl();

    if (options.server) {
      setState({ phase: "starting", message: "Applying database schema…" });
      await runMigrate(migrateBin, dbUrl);

      setState({ phase: "starting", message: "Starting API server…" });
      const jwt = await ensureJwtSecret();
      startServer(serverBin, dbUrl, jwt);
    }

    setState({
      phase: "running",
      postgres: false,
      server: options.server,
    });
    return { ok: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    setState({ phase: "error", message });
    await shutdownBundledStack().catch(() => undefined);
    return { ok: false, error: message };
  } finally {
    starting = false;
  }
}

export async function shutdownBundledStack(): Promise<void> {
  if (serverProc) {
    try {
      if (process.platform === "win32") {
        serverProc.kill();
      } else {
        serverProc.kill("SIGTERM");
      }
    } catch {
      /* ignore */
    }
    serverProc = null;
  }

  setState({ phase: "stopped" });
}

export function registerBundledRuntimeIpc(): void {
  ipcMain.removeHandler("open-conductor:setup-context");
  ipcMain.handle("open-conductor:setup-context", async () => ({
    diagnostics: await getSetupDiagnostics(),
    bundledState: getBundledRuntimeState(),
  }));

  ipcMain.removeHandler("open-conductor:bundled-capabilities");
  ipcMain.handle("open-conductor:bundled-capabilities", async () => ({
    canRunBundled: canRunBundledStack(),
  }));

  ipcMain.removeHandler("open-conductor:bundled-state");
  ipcMain.handle("open-conductor:bundled-state", async () => getBundledRuntimeState());

  ipcMain.removeHandler("open-conductor:bundled-start");
  ipcMain.handle(
    "open-conductor:bundled-start",
    async (_evt, payload: { postgres?: boolean; server?: boolean }) => {
      const server = payload?.server !== false;
      return startBundledStack({ postgres: false, server });
    }
  );

  ipcMain.removeHandler("open-conductor:bundled-stop");
  ipcMain.handle("open-conductor:bundled-stop", async () => {
    await shutdownBundledStack();
    return { ok: true as const };
  });
}
