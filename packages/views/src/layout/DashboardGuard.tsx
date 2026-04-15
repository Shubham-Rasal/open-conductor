import { type ReactNode, useEffect, useState, useCallback } from "react";

const HEALTH_URL = "http://localhost:8080/health";
const POLL_OFFLINE = 3_000;
const POLL_ONLINE  = 30_000;

type ServerStatus = "checking" | "online" | "offline";

function useServerHealth(): { status: ServerStatus; recheck: () => void } {
  const [status, setStatus] = useState<ServerStatus>("checking");

  const check = useCallback(async () => {
    try {
      const r = await fetch(HEALTH_URL, { cache: "no-store" });
      setStatus(r.ok ? "online" : "offline");
    } catch {
      setStatus("offline");
    }
  }, []);

  useEffect(() => {
    void check();
    // Poll faster when offline so the app comes back immediately when server starts
    const interval = setInterval(
      () => void check(),
      status === "offline" ? POLL_OFFLINE : POLL_ONLINE
    );
    return () => clearInterval(interval);
  }, [check, status]);

  return { status, recheck: check };
}

// ── Offline screen ────────────────────────────────────────────────────────────

function ServerOffline({ onRetry, checking }: { onRetry: () => void; checking: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const steps = [
    {
      key: "env",
      label: "Set up environment",
      cmd: "cp .env.example .env",
      hint: "Then edit DATABASE_URL if needed",
    },
    {
      key: "migrate",
      label: "Run migrations (first time only)",
      cmd: "cd server && go run ./cmd/migrate",
      hint: null,
    },
    {
      key: "start",
      label: "Start the server",
      cmd: "cd server && go run ./cmd/server",
      hint: "Requires PostgreSQL to be running",
    },
  ];

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        {/* Status indicator */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-muted/30">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/60">
              <path d="M22 12H2" />
              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              <line x1="6" y1="16" x2="6.01" y2="16" />
              <line x1="10" y1="16" x2="10.01" y2="16" />
            </svg>
          </div>

          <h1 className="text-base font-semibold text-foreground">Server is not running</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Open Conductor needs a local server on{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">localhost:8080</code>.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={step.key} className="rounded-xl border border-border/50 bg-card/60 px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="text-xs font-medium text-foreground">{step.label}</span>
              </div>

              <div className="group flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/80">
                  {step.cmd}
                </code>
                <button
                  type="button"
                  onClick={() => copy(step.cmd, step.key)}
                  className="flex-shrink-0 rounded p-1 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                  title="Copy"
                >
                  {copied === step.key ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>

              {step.hint && (
                <p className="mt-1.5 text-[11px] text-muted-foreground/55">{step.hint}</p>
              )}
            </div>
          ))}
        </div>

        {/* Retry */}
        <div className="mt-5 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground/50">
            Checking automatically every 3 seconds…
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={checking}
            className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            {checking ? (
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
            )}
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Guard ─────────────────────────────────────────────────────────────────────

interface DashboardGuardProps {
  children: ReactNode;
}

export function DashboardGuard({ children }: DashboardGuardProps) {
  const { status, recheck } = useServerHealth();

  if (status === "checking") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <svg className="h-5 w-5 animate-spin text-muted-foreground/40" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (status === "offline") {
    return <ServerOffline onRetry={recheck} checking={false} />;
  }

  return <>{children}</>;
}
