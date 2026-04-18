import { type ChildProcess, spawn } from "child_process";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";

import { app, ipcMain } from "electron";

import { bundledArtifactsPresent } from "./bundled-artifacts";
import { getSetupDiagnostics } from "./setup-diagnostics";

/** Embedded Postgres listens here so we don't clash with a system Postgres on 5432. */
export const BUNDLED_PG_PORT = 55432;

const DB_NAME = "open_conductor";
const DB_USER = "postgres";
const DB_PASS = "postgres";

type EmbeddedModule = { default: new (opts?: Record<string, unknown>) => EmbeddedPostgresLike };

interface EmbeddedPostgresLike {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  createDatabase(name: string): Promise<void>;
}

let embeddedPg: EmbeddedPostgresLike | null = null;
let serverProc: ChildProcess | null = null;
let starting = false;

export type BundledRuntimeState =
  | { phase: "stopped" }
  | { phase: "starting"; message: string }
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

function migrationsDir(): string {
  return join(process.resourcesPath, "migrations");
}

/** True when packaged app includes Go binaries + migrations (built in CI). */
export function canRunBundledStack(): boolean {
  if (!app.isPackaged) return false;
  return bundledArtifactsPresent(process.resourcesPath);
}

function databaseUrl(): string {
  return `postgresql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASS)}@127.0.0.1:${BUNDLED_PG_PORT}/${DB_NAME}?sslmode=disable`;
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

async function ensureClusterInitialized(
  databaseDir: string,
  embedded: EmbeddedPostgresLike
): Promise<void> {
  const marker = join(databaseDir, "PG_VERSION");
  if (!existsSync(marker)) {
    await embedded.initialise();
  }
}

async function ensureAppDatabase(embedded: EmbeddedPostgresLike): Promise<void> {
  try {
    await embedded.createDatabase(DB_NAME);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("already exists") || msg.includes("duplicate")) return;
    throw e;
  }
}

function runMigrate(migrateBin: string, databaseURL: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = migrationsDir();
    const child = spawn(
      migrateBin,
      ["-dir", dir],
      {
        env: { ...process.env, DATABASE_URL: databaseURL },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
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
  postgres: boolean;
  server: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canRunBundledStack()) {
    return { ok: false, error: "Bundled server is not available in this build." };
  }
  if (options.server && !options.postgres) {
    return {
      ok: false,
      error: "The API server needs a database. Enable PostgreSQL or use manual setup with your own Postgres.",
    };
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
    const bin = resourcesBinDir();
    const serverBin = join(bin, exeName("server"));
    const migrateBin = join(bin, exeName("migrate"));

    if (options.postgres) {
      setState({ phase: "starting", message: "Starting PostgreSQL…" });
      const mod = (await import(
        "embedded-postgres"
      )) as unknown as EmbeddedModule;
      const EmbeddedPostgres = mod.default;
      const dataRoot = join(app.getPath("userData"), "embedded-postgres");
      await mkdir(dataRoot, { recursive: true });
      const databaseDir = join(dataRoot, "data");

      embeddedPg = new EmbeddedPostgres({
        databaseDir,
        user: DB_USER,
        password: DB_PASS,
        port: BUNDLED_PG_PORT,
        persistent: true,
      });

      await ensureClusterInitialized(databaseDir, embeddedPg);
      await embeddedPg.start();
      await ensureAppDatabase(embeddedPg);
    }

    const dbUrl = databaseUrl();

    if (options.server) {
      setState({ phase: "starting", message: "Applying database migrations…" });
      await runMigrate(migrateBin, dbUrl);

      setState({ phase: "starting", message: "Starting API server…" });
      const jwt = await ensureJwtSecret();
      startServer(serverBin, dbUrl, jwt);
    }

    setState({
      phase: "running",
      postgres: options.postgres,
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

  if (embeddedPg) {
    try {
      await embeddedPg.stop();
    } catch {
      /* ignore */
    }
    embeddedPg = null;
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
      const postgres = payload?.postgres !== false;
      const server = payload?.server !== false;
      return startBundledStack({ postgres, server });
    }
  );

  ipcMain.removeHandler("open-conductor:bundled-stop");
  ipcMain.handle("open-conductor:bundled-stop", async () => {
    await shutdownBundledStack();
    return { ok: true as const };
  });
}
