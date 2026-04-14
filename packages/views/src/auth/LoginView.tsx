import { useState } from "react";
import { useAuthStore } from "@open-conductor/core/auth";
import { useCoreContext } from "@open-conductor/core/platform";
import { useNavigation } from "../navigation";

export function LoginView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);
  const { apiClient } = useCoreContext();
  const nav = useNavigation();

  async function signIn(email: string, password: string, displayName?: string) {
    setError(null);
    setLoading(true);
    try {
      let data: { token: string };
      if (displayName !== undefined) {
        // Register then login (guest / new account)
        try {
          await apiClient.post("/api/auth/register", { email, password, name: displayName });
        } catch {
          // Already exists — fall through to login
        }
        data = await apiClient.post<{ token: string }>("/api/auth/login", { email, password });
      } else if (mode === "login") {
        data = await apiClient.post<{ token: string }>("/api/auth/login", { email, password });
      } else {
        data = await apiClient.post<{ token: string }>("/api/auth/register", { email, password, name });
      }
      setToken(data.token);
      nav.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await signIn(email, password, mode === "register" ? name : undefined);
  }

  async function handleGuest() {
    await signIn("guest@open-conductor.local", "guest-password-123", "Guest");
  }

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-foreground">
          {mode === "login" ? "Sign in" : "Create account"}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {mode === "login" ? "Enter your credentials to continue" : "Set up your Open Conductor account"}
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {mode === "register" && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Your name"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="relative my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={() => void handleGuest()}
          disabled={loading}
          className="w-full rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          Continue as Guest
        </button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {mode === "login" ? "No account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
            className="text-foreground underline underline-offset-2 hover:opacity-70"
          >
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
