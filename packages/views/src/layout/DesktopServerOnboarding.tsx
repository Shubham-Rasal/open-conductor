import { type ReactNode, useCallback, useEffect, useState } from "react";

const HEALTH_URL = "http://localhost:8080/health";

type Diagnostics = {
  bundledBinariesPresent: boolean;
  packaged: boolean;
  dockerCliAvailable: boolean;
  dockerDaemonRunning: boolean;
  goCliAvailable: boolean;
  platform: string;
};

type BundledState =
  | { phase: "stopped" }
  | { phase: "starting"; message: string }
  | { phase: "running"; postgres: boolean; server: boolean }
  | { phase: "error"; message: string };

function StatusPill({
  ok,
  label,
  detail,
}: {
  ok: boolean | null;
  label: string;
  detail?: string;
}) {
  const tone =
    ok === null ? "bg-muted/50 text-muted-foreground" : ok ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/12 text-amber-200";
  return (
    <div
      className={`inline-flex max-w-full flex-col gap-0.5 rounded-lg border border-border/40 px-2.5 py-1.5 text-left ${tone}`}
    >
      <span className="text-[11px] font-medium leading-none">{label}</span>
      {detail && <span className="text-[10px] leading-snug text-muted-foreground/90">{detail}</span>}
    </div>
  );
}

function StepCard({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/40 p-4 shadow-sm backdrop-blur-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
          {n}
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export function DesktopServerOnboarding({
  onConnected,
}: {
  onConnected: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [bundled, setBundled] = useState<BundledState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pgOn, setPgOn] = useState(true);
  const [apiOn, setApiOn] = useState(true);
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const electron = typeof window !== "undefined" ? window.electron : undefined;
  const hasBundled = Boolean(electron?.localRuntime && electron?.setup);

  const refreshContext = useCallback(async () => {
    if (!electron?.setup?.getContext) {
      setLoading(false);
      return;
    }
    try {
      const ctx = await electron.setup.getContext();
      setDiag(ctx.diagnostics);
      setBundled(ctx.bundledState);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not read setup status.");
    } finally {
      setLoading(false);
    }
  }, [electron?.setup]);

  useEffect(() => {
    void refreshContext();
  }, [refreshContext]);

  /** After bundled start, wait until /health responds. */
  useEffect(() => {
    if (!starting) return;
    const t = window.setInterval(async () => {
      try {
        const r = await fetch(HEALTH_URL, { cache: "no-store" });
        if (r.ok) {
          setStarting(false);
          onConnected();
        }
      } catch {
        /* still offline */
      }
    }, 500);
    return () => window.clearInterval(t);
  }, [starting, onConnected]);

  /** Reflect main-process starting messages. */
  useEffect(() => {
    if (!starting || !electron?.localRuntime?.getState) return;
    const t = window.setInterval(() => {
      void electron.localRuntime?.getState?.().then((s) => {
        if (s) setBundled(s);
      });
    }, 400);
    return () => window.clearInterval(t);
  }, [starting, electron?.localRuntime]);

  async function handleStartBundled() {
    if (!electron?.localRuntime?.start) return;
    setActionError(null);
    if (bundled?.phase === "error") {
      await handleStopBundled();
    }
    setStarting(true);
    const res = await electron.localRuntime.start({ postgres: pgOn, server: apiOn });
    if (!res.ok) {
      setStarting(false);
      setActionError("error" in res ? res.error : "Could not start services.");
      return;
    }
  }

  async function handleStopBundled() {
    await electron?.localRuntime?.stop?.();
    setStarting(false);
    await refreshContext();
  }

  const devSteps = [
    { key: "compose", label: "Start PostgreSQL (Docker)", cmd: "docker compose up -d" },
    { key: "migrate", label: "Apply database schema (first run)", cmd: "cd server && go run ./cmd/migrate" },
    { key: "serve", label: "Start the API server", cmd: "cd server && go run ./cmd/server" },
  ];

  const [copied, setCopied] = useState<string | null>(null);
  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    });
  }

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-background px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/50 bg-muted/20">
            <svg className="h-6 w-6 animate-spin text-muted-foreground/50" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">Checking your computer for tools and bundled services…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/50 p-6 text-center">
          <p className="text-sm font-medium text-foreground">Could not load setup</p>
          <p className="mt-2 text-xs text-muted-foreground">{loadError}</p>
          <button
            type="button"
            onClick={() => void refreshContext()}
            className="mt-4 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-lg flex-1 px-5 py-10">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-gradient-to-b from-muted/40 to-muted/10 shadow-inner">
            <span className="text-lg font-semibold text-primary">◆</span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Welcome to Open Conductor</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The desktop app talks to a small program on your computer (the <span className="text-foreground/90">local server</span>)
            that keeps your workspaces, issues, and agents in sync. Let&apos;s get it running — no terminal experience required.
          </p>
        </div>

        {/* Auto-detected environment */}
        {diag && (
          <div className="mb-6 flex flex-wrap justify-center gap-2">
            <StatusPill
              ok={diag.bundledBinariesPresent}
              label={diag.bundledBinariesPresent ? "One-click setup available" : "One-click setup not in this build"}
              detail={
                diag.bundledBinariesPresent
                  ? "This app includes PostgreSQL and the API server."
                  : hasBundled
                    ? "Install a release build from GitHub for bundled services, or follow the steps below."
                    : undefined
              }
            />
            <StatusPill
              ok={diag.dockerCliAvailable ? (diag.dockerDaemonRunning ? true : null) : false}
              label="Docker"
              detail={
                !diag.dockerCliAvailable
                  ? "Not found — optional; used for PostgreSQL in developer setups."
                  : diag.dockerDaemonRunning
                    ? "Docker Desktop is running."
                    : "Docker is installed but the engine is not running. Open Docker Desktop."
              }
            />
            <StatusPill
              ok={diag.goCliAvailable}
              label="Go toolkit"
              detail={diag.goCliAvailable ? "Found — only needed for manual developer setup." : "Not found — only needed for manual setup."}
            />
          </div>
        )}

        {/* Primary path: bundled */}
        {diag?.bundledBinariesPresent && hasBundled && (
          <StepCard n={1} title="Start everything (recommended)">
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
              We&apos;ll start a private database on your machine and then launch the Open Conductor server. First launch may
              take a minute while the database initializes.
            </p>

            <div className="mb-4 space-y-3 rounded-xl border border-border/40 bg-muted/20 p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border"
                  checked={pgOn}
                  onChange={(e) => setPgOn(e.target.checked)}
                  disabled={starting}
                />
                <span>
                  <span className="text-sm font-medium text-foreground">Start local PostgreSQL</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    Keeps your data on this computer. Uses a dedicated local port so it won&apos;t replace a PostgreSQL you
                    already use.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border"
                  checked={apiOn}
                  onChange={(e) => {
                    setApiOn(e.target.checked);
                    if (e.target.checked) setPgOn(true);
                  }}
                  disabled={starting}
                />
                <span>
                  <span className="text-sm font-medium text-foreground">Start Open Conductor server</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    Serves the app at <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">localhost:8080</code>
                    . Requires the database option above.
                  </span>
                </span>
              </label>
            </div>

            {bundled?.phase === "starting" && (
              <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {bundled.message}
              </p>
            )}

            {bundled?.phase === "error" && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {bundled.message}
              </div>
            )}

            {actionError && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {actionError}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={starting || (apiOn && !pgOn)}
                onClick={() => void handleStartBundled()}
                className="inline-flex flex-1 min-w-[8rem] items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {starting ? "Starting…" : "Start Open Conductor"}
              </button>
              <button
                type="button"
                disabled={
                  !starting && bundled?.phase !== "running" && bundled?.phase !== "error"
                }
                onClick={() => void handleStopBundled()}
                className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40"
              >
                Stop
              </button>
            </div>
            {apiOn && !pgOn && (
              <p className="mt-2 text-[11px] text-amber-200/90">Turn on PostgreSQL to run the server, or use manual setup.</p>
            )}
          </StepCard>
        )}

        {/* Docker-assisted developer path */}
        {diag && !diag.bundledBinariesPresent && (
          <StepCard n={diag.bundledBinariesPresent ? 2 : 1} title="Use Docker for PostgreSQL (developers)">
            <p className="mb-3 text-xs text-muted-foreground">
              If you cloned the repository and use Docker Desktop, start the database with Compose from the project folder, then
              run migrations and the server in two more commands.
            </p>
            {!diag.dockerCliAvailable && (
              <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100/90">
                Docker isn&apos;t available on your PATH. Install{" "}
                <a
                  href="https://docs.docker.com/get-docker/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  Docker Desktop
                </a>{" "}
                and ensure <code className="rounded bg-muted px-1">docker</code> works in a terminal, then retry.
              </p>
            )}
            {diag.dockerCliAvailable && !diag.dockerDaemonRunning && (
              <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100/90">
                Docker is installed but the daemon isn&apos;t running. Open Docker Desktop and wait until it says it&apos;s
                running, then come back here.
              </p>
            )}
            <div className="space-y-2">
              {devSteps.map((s, i) => (
                <div key={s.key} className="rounded-lg border border-border/40 bg-muted/15 px-3 py-2">
                  <div className="mb-1 text-[11px] font-medium text-foreground/90">
                    {i + 1}. {s.label}
                  </div>
                  <div className="group flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-muted-foreground">{s.cmd}</code>
                    <button
                      type="button"
                      title="Copy"
                      onClick={() => copy(s.cmd, s.key)}
                      className="flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      {copied === s.key ? "✓" : "⧉"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onConnected()}
              className="mt-4 w-full rounded-xl border border-border bg-background py-2 text-xs font-medium text-foreground hover:bg-accent"
            >
              I&apos;ve started the server — check again
            </button>
          </StepCard>
        )}

        {/* Packaged app without bundled assets */}
        {diag?.packaged && !diag.bundledBinariesPresent && (
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            Download the latest{" "}
            <a
              href="https://github.com/Shubham-Rasal/open-conductor/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-2"
            >
              release build on GitHub
            </a>{" "}
            — it includes the bundled database and server so you don&apos;t need extra tools.
          </p>
        )}

        {/* Non-packaged: hint */}
        {diag && !diag.packaged && !diag.bundledBinariesPresent && (
          <StepCard n={2} title="Already running the server?">
            <p className="text-xs text-muted-foreground">
              If you started the API from a terminal (for example with <code className="rounded bg-muted px-1">make dev</code>
              ), the app should connect automatically. You can also check that something responds at{" "}
              <code className="rounded bg-muted px-1 font-mono text-[11px]">http://localhost:8080/health</code>.
            </p>
            <button
              type="button"
              onClick={() => onConnected()}
              className="mt-4 w-full rounded-xl border border-border bg-background py-2 text-xs font-medium text-foreground hover:bg-accent"
            >
              Check connection again
            </button>
          </StepCard>
        )}

        <p className="mt-8 text-center text-[10px] text-muted-foreground/70">
          Checking connection every few seconds while this screen is open. Port{" "}
          <code className="font-mono text-[10px]">8080</code> must be free for the bundled server.
        </p>
      </div>
    </div>
  );
}
