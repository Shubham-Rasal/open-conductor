import { type ReactNode, useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

/* ── Diagnostic chip ──────────────────────────────────────────────── */

function DiagChip({
  ok,
  label,
  detail,
  icon,
}: {
  ok: boolean | null;
  label: string;
  detail?: string;
  icon: ReactNode;
}) {
  const dotColor =
    ok === null
      ? "bg-amber-400"
      : ok
        ? "bg-emerald-400"
        : "bg-red-400/80";

  const borderColor =
    ok === null
      ? "border-amber-500/20"
      : ok
        ? "border-emerald-500/20"
        : "border-red-500/20";

  const bgColor =
    ok === null
      ? "bg-amber-500/5"
      : ok
        ? "bg-emerald-500/5"
        : "bg-red-500/5";

  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${borderColor} ${bgColor}`}
    >
      <div className="mt-0.5 flex-shrink-0 text-muted-foreground/60">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-foreground/90">{label}</span>
          <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotColor} ${ok === true ? "animate-pulse" : ""}`} />
        </div>
        {detail && (
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/70">{detail}</p>
        )}
      </div>
    </div>
  );
}

/* ── Terminal command row ─────────────────────────────────────────── */

function CmdRow({
  step,
  label,
  cmd,
  copied,
  onCopy,
}: {
  step: number;
  label: string;
  cmd: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="group rounded-xl border border-border/30 bg-black/20 p-3 transition-colors hover:border-border/50">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-muted/60 text-[9px] font-semibold text-muted-foreground">
          {step}
        </span>
        <span className="text-[11px] font-medium text-muted-foreground/90">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="font-mono text-[10px] text-emerald-400/60 flex-shrink-0">$</span>
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
            {cmd}
          </code>
        </div>
        <button
          type="button"
          title="Copy"
          onClick={onCopy}
          className="flex-shrink-0 rounded-md border border-border/0 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/50 transition-all hover:border-border/40 hover:bg-muted/30 hover:text-foreground/70 group-hover:border-border/30 group-hover:text-muted-foreground/80"
        >
          {copied ? (
            <span className="text-emerald-400/80">✓ copied</span>
          ) : (
            "copy"
          )}
        </button>
      </div>
    </div>
  );
}

/* ── Step card ────────────────────────────────────────────────────── */

function StepCard({
  n,
  title,
  badge,
  children,
}: {
  n: number;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/30 shadow-sm backdrop-blur-sm">
      {/* Card header */}
      <div className="flex items-center gap-3 border-b border-border/30 bg-muted/10 px-4 py-3">
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
          {n}
        </span>
        <h3 className="flex-1 text-[13px] font-semibold tracking-tight text-foreground">{title}</h3>
        {badge}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ── Icons ────────────────────────────────────────────────────────── */

function IconBox() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-70">
      <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" fillOpacity="0.6" />
      <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" fillOpacity="0.6" />
      <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" fillOpacity="0.6" />
      <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" />
    </svg>
  );
}

function IconDocker() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-70">
      <rect x="1" y="8" width="3" height="3" rx="0.5" fill="currentColor" />
      <rect x="5" y="8" width="3" height="3" rx="0.5" fill="currentColor" />
      <rect x="9" y="8" width="3" height="3" rx="0.5" fill="currentColor" />
      <rect x="5" y="4" width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.5" />
      <rect x="9" y="4" width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.5" />
      <path d="M13 9c0-1.5-1.5-2-2.5-1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function IconGo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-70">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpinnerSvg({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-4 w-4 animate-spin"} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-70" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ── Main component ───────────────────────────────────────────────── */

export function DesktopServerOnboarding({
  onConnected,
}: {
  onConnected: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [bundled, setBundled] = useState<BundledState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    const res = await electron.localRuntime.start({ server: apiOn });
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
    { key: "env", label: "Set DATABASE_URL (repo root .env)", cmd: "DATABASE_URL=file:./open_conductor.db" },
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

  /* ── Loading ─────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-5"
        >
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-border/50 bg-muted/20">
            <SpinnerSvg className="h-5 w-5 animate-spin text-muted-foreground/40" />
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/5 to-transparent" />
          </div>
          <div className="text-center">
            <p className="text-[13px] font-medium text-foreground/70">Checking environment</p>
            <p className="mt-1 text-[11px] text-muted-foreground/50">scanning for tools and bundled services</p>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ── Load error ──────────────────────────────────────────────── */
  if (loadError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-background px-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm overflow-hidden rounded-2xl border border-red-500/20 bg-red-500/5"
        >
          <div className="border-b border-red-500/15 bg-red-500/5 px-4 py-3">
            <p className="text-[12px] font-semibold text-red-300/90">Setup failed to load</p>
          </div>
          <div className="p-4">
            <p className="font-mono text-[11px] leading-relaxed text-muted-foreground/80">{loadError}</p>
            <button
              type="button"
              onClick={() => void refreshContext()}
              className="mt-4 w-full rounded-lg border border-border/50 bg-muted/20 py-2 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-muted/40"
            >
              Try again
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ── Main view ───────────────────────────────────────────────── */
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background">
      {/* Subtle radial glow in the center-top */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% -10%, hsl(var(--primary) / 0.15), transparent)",
        }}
      />

      <div className="relative mx-auto w-full max-w-md flex-1 px-5 py-10">
        {/* ── Header ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 text-center"
        >
          {/* Logo mark */}
          <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-[18px] border border-border/60 bg-gradient-to-b from-muted/50 to-muted/10 shadow-md shadow-black/20">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 2L20 7V15L11 20L2 15V7L11 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="text-primary" />
              <circle cx="11" cy="11" r="3" fill="currentColor" className="text-primary" fillOpacity="0.8" />
            </svg>
          </div>

          <h1 className="text-[17px] font-semibold tracking-tight text-foreground">
            Open Conductor
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-[12.5px] leading-relaxed text-muted-foreground/80">
            The desktop app needs a <span className="font-medium text-foreground/80">local server</span> to
            manage workspaces, issues, and agents. Get it running below.
          </p>
        </motion.div>

        {/* ── Diagnostics ──────────────────────────────────────────── */}
        {diag && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08 }}
            className="mb-5 grid grid-cols-3 gap-2"
          >
            <DiagChip
              ok={diag.bundledBinariesPresent}
              icon={<IconBox />}
              label="Bundled"
              detail={diag.bundledBinariesPresent ? "One-click available" : "Not in this build"}
            />
            <DiagChip
              ok={diag.dockerCliAvailable ? (diag.dockerDaemonRunning ? true : null) : false}
              icon={<IconDocker />}
              label="Docker"
              detail={
                !diag.dockerCliAvailable
                  ? "Not found"
                  : diag.dockerDaemonRunning
                    ? "Running"
                    : "Not running"
              }
            />
            <DiagChip
              ok={diag.goCliAvailable}
              icon={<IconGo />}
              label="Go"
              detail={diag.goCliAvailable ? "Found" : "Not found"}
            />
          </motion.div>
        )}

        {/* ── Primary path: bundled ─────────────────────────────────── */}
        <AnimatePresence>
          {diag?.bundledBinariesPresent && hasBundled && (
            <motion.div
              key="bundled-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.15 }}
              className="mb-3"
            >
              <StepCard
                n={1}
                title="One-click start"
                badge={
                  <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300/80">
                    recommended
                  </span>
                }
              >
                <p className="mb-4 text-[12px] leading-relaxed text-muted-foreground/80">
                  Creates a private SQLite database in your app-data folder, applies the schema, and
                  launches the server. First launch may take a moment.
                </p>

                {/* API on toggle */}
                <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border/30 bg-muted/10 px-3 py-2.5 transition-colors hover:bg-muted/20">
                  <div className="relative mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={apiOn}
                      onChange={(e) => setApiOn(e.target.checked)}
                      disabled={starting}
                    />
                    <div className="h-4 w-7 rounded-full border border-border/60 bg-muted/60 transition-colors peer-checked:border-primary/50 peer-checked:bg-primary/30" />
                    <div className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-muted-foreground/40 transition-all peer-checked:translate-x-3 peer-checked:bg-primary" />
                  </div>
                  <span>
                    <span className="text-[12px] font-medium text-foreground/90">Open Conductor server</span>
                    <span className="mt-0.5 block text-[10.5px] text-muted-foreground/60">
                      Serves the app at{" "}
                      <code className="rounded bg-muted/60 px-1 font-mono text-[10px]">localhost:8080</code>
                    </span>
                  </span>
                </label>

                {/* Status messages */}
                <AnimatePresence>
                  {bundled?.phase === "starting" && (
                    <motion.div
                      key="starting"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-3 overflow-hidden"
                    >
                      <div className="flex items-center gap-2 rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
                        <SpinnerSvg className="h-3 w-3 animate-spin text-primary/60" />
                        <span className="font-mono text-[11px] text-muted-foreground/80">{bundled.message}</span>
                      </div>
                    </motion.div>
                  )}

                  {bundled?.phase === "error" && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-3 overflow-hidden"
                    >
                      <div className="rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-2 font-mono text-[11px] text-red-300/80">
                        {bundled.message}
                      </div>
                    </motion.div>
                  )}

                  {actionError && (
                    <motion.div
                      key="action-error"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-3 overflow-hidden"
                    >
                      <div className="rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-2 font-mono text-[11px] text-red-300/80">
                        {actionError}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={starting || !apiOn}
                    onClick={() => void handleStartBundled()}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {starting && <SpinnerSvg className="h-3.5 w-3.5 animate-spin" />}
                    {starting ? "Starting…" : "Start Open Conductor"}
                  </button>
                  <button
                    type="button"
                    disabled={!starting && bundled?.phase !== "running" && bundled?.phase !== "error"}
                    onClick={() => void handleStopBundled()}
                    className="rounded-xl border border-border/50 bg-transparent px-4 py-2.5 text-[13px] font-medium text-foreground/70 transition-colors hover:bg-muted/30 disabled:opacity-30"
                  >
                    Stop
                  </button>
                </div>
              </StepCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Developer / manual path ───────────────────────────────── */}
        {diag && !diag.bundledBinariesPresent && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
            className="mb-3"
          >
            <StepCard n={diag.bundledBinariesPresent ? 2 : 1} title="Manual setup">
              <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground/80">
                From a clone of the repository, set{" "}
                <code className="rounded bg-muted/60 px-1 font-mono text-[11px]">DATABASE_URL</code> to a SQLite
                file, run migrate once, then start the API server.
              </p>

              {!diag.dockerCliAvailable && (
                <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                  <p className="text-[11px] leading-relaxed text-amber-200/80">
                    Docker not found on <code className="font-mono text-[10px]">PATH</code>. Install{" "}
                    <a
                      href="https://docs.docker.com/get-docker/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-amber-100"
                    >
                      Docker Desktop
                    </a>{" "}
                    and ensure <code className="font-mono text-[10px]">docker</code> works in a terminal, then
                    retry.
                  </p>
                </div>
              )}

              {diag.dockerCliAvailable && !diag.dockerDaemonRunning && (
                <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                  <p className="text-[11px] leading-relaxed text-amber-200/80">
                    Docker is installed but the daemon isn&apos;t running. Open Docker Desktop and wait until
                    it&apos;s ready, then come back here.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {devSteps.map((s, i) => (
                  <CmdRow
                    key={s.key}
                    step={i + 1}
                    label={s.label}
                    cmd={s.cmd}
                    copied={copied === s.key}
                    onCopy={() => copy(s.cmd, s.key)}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => onConnected()}
                className="mt-4 w-full rounded-xl border border-border/40 bg-transparent py-2.5 text-[12px] font-medium text-foreground/70 transition-colors hover:bg-muted/20 hover:text-foreground/90"
              >
                I&apos;ve started the server — check again
              </button>
            </StepCard>
          </motion.div>
        )}

        {/* ── Packaged without bundled ──────────────────────────────── */}
        {diag?.packaged && !diag.bundledBinariesPresent && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-4 text-center text-[11px] text-muted-foreground/60"
          >
            Download the latest{" "}
            <a
              href="https://github.com/Shubham-Rasal/open-conductor/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground/70 underline underline-offset-2 hover:text-foreground/90"
            >
              release build on GitHub
            </a>{" "}
            — it includes the bundled database and server so you don&apos;t need extra tools.
          </motion.p>
        )}

        {/* ── Non-packaged hint ─────────────────────────────────────── */}
        {diag && !diag.packaged && !diag.bundledBinariesPresent && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="mt-3"
          >
            <StepCard n={2} title="Already running the server?">
              <p className="text-[12px] leading-relaxed text-muted-foreground/80">
                If you started the API from a terminal (e.g. with{" "}
                <code className="rounded bg-muted/60 px-1 font-mono text-[11px]">make dev</code>), the app
                should connect automatically. You can also verify at{" "}
                <code className="rounded bg-muted/60 px-1 font-mono text-[11px]">localhost:8080/health</code>.
              </p>
              <button
                type="button"
                onClick={() => onConnected()}
                className="mt-4 w-full rounded-xl border border-border/40 bg-transparent py-2.5 text-[12px] font-medium text-foreground/70 transition-colors hover:bg-muted/20 hover:text-foreground/90"
              >
                Check connection again
              </button>
            </StepCard>
          </motion.div>
        )}

        {/* ── Footer note ──────────────────────────────────────────── */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 text-center text-[10px] text-muted-foreground/40"
        >
          Polling connection every few seconds · port{" "}
          <code className="font-mono text-[10px]">8080</code> must be free for the bundled server
        </motion.p>
      </div>
    </div>
  );
}
