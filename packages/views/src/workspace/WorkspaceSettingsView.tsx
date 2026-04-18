import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCoreContext } from "@open-conductor/core/platform";
import {
  workspaceDetailOptions,
  workspaceListOptions,
  workspaceEnvVarsOptions,
  useUpdateWorkspace,
  useUpsertEnvVar,
  useDeleteEnvVar,
} from "@open-conductor/core/workspaces";
import { agentListOptions, useUpdateAgent } from "@open-conductor/core/agents";
import { getPickDirectory } from "../pickDirectory";
import { WorkspaceIdenticon } from "../layout/WorkspaceIdenticon";
import type { Agent, Workspace, WorkspaceEnvVar } from "@open-conductor/core/types";

const MAIN_NAV: { id: string; label: string }[] = [
  { id: "general", label: "General" },
  { id: "environment", label: "Environment" },
  { id: "agents", label: "Agents" },
  { id: "models", label: "Models" },
  { id: "providers", label: "Providers" },
  { id: "appearance", label: "Appearance" },
  { id: "git", label: "Git" },
  { id: "account", label: "Account" },
];

const MORE_NAV: { id: string; label: string }[] = [
  { id: "experimental", label: "Experimental" },
  { id: "advanced", label: "Advanced" },
];

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
    </svg>
  );
}

function NavButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
        active
          ? "bg-foreground/10 font-medium text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- Environment panel ----------

function EnvironmentPanel({ workspaceId }: { workspaceId: string }) {
  const { apiClient } = useCoreContext();
  const { data: envVars = [], isLoading } = useQuery(workspaceEnvVarsOptions(apiClient, workspaceId));
  const upsert = useUpsertEnvVar(apiClient, workspaceId);
  const remove = useDeleteEnvVar(apiClient, workspaceId);

  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const key = newKey.trim();
    if (!key) { setAddError("Key is required"); return; }
    try {
      await upsert.mutateAsync({ key, value: newValue });
      setNewKey("");
      setNewValue("");
    } catch {
      setAddError("Failed to save variable");
    }
  }

  async function handleSaveEdit(key: string) {
    const val = editing[key] ?? "";
    await upsert.mutateAsync({ key, value: val });
    setEditing((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }

  async function handleDelete(key: string) {
    await remove.mutateAsync(key);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Environment variables are injected into agent processes when they run tasks in this workspace. Values are stored server-side and never exposed in the UI after saving.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : envVars.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-6 py-8 text-center text-sm text-muted-foreground">
          No environment variables yet.
        </div>
      ) : (
        <div className="divide-y divide-border/50 rounded-xl border border-border/60 bg-card/40 overflow-hidden">
          {envVars.map((v: WorkspaceEnvVar) => {
            const isEditing = v.key in editing;
            const editVal = editing[v.key] ?? v.value;
            return (
              <div key={v.key} className="flex items-center gap-3 px-4 py-3">
                <span className="w-48 shrink-0 truncate font-mono text-[13px] font-medium text-foreground">{v.key}</span>
                {isEditing ? (
                  <>
                    <input
                      autoFocus
                      value={editVal}
                      onChange={(e) => setEditing((prev) => ({ ...prev, [v.key]: e.target.value }))}
                      className="min-w-0 flex-1 rounded-md border border-border/80 bg-background px-2 py-1 font-mono text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleSaveEdit(v.key);
                        if (e.key === "Escape") setEditing((prev) => { const n = { ...prev }; delete n[v.key]; return n; });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveEdit(v.key)}
                      className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing((prev) => { const n = { ...prev }; delete n[v.key]; return n; })}
                      className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing((prev) => ({ ...prev, [v.key]: v.value }))}
                      className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-left font-mono text-[13px] text-muted-foreground hover:border-border/60 hover:bg-muted/30"
                    >
                      {"•".repeat(Math.min(v.value.length, 20)) || <span className="italic opacity-50">empty</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(v.key)}
                      aria-label={`Delete ${v.key}`}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <TrashIcon />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={(e) => void handleAdd(e)} className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Add variable</h2>
        <div className="flex gap-2">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="KEY"
            className="w-48 shrink-0 rounded-lg border border-border/80 bg-background px-3 py-2 font-mono text-[13px] uppercase text-foreground placeholder:normal-case placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            className="min-w-0 flex-1 rounded-lg border border-border/80 bg-background px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={upsert.isPending || !newKey.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <PlusIcon />
            Add
          </button>
        </div>
        {addError && <p className="text-[12px] text-destructive">{addError}</p>}
      </form>
    </div>
  );
}

// ---------- Agents panel ----------

function AgentRow({ agent }: { agent: Agent }) {
  const update = useUpdateAgent();

  const [name, setName] = useState(agent.name);
  const [instructions, setInstructions] = useState(agent.instructions);
  const [model, setModel] = useState(agent.model ?? "");
  const [maxTasks, setMaxTasks] = useState(String(agent.max_concurrent_tasks));
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setName(agent.name);
    setInstructions(agent.instructions);
    setModel(agent.model ?? "");
    setMaxTasks(String(agent.max_concurrent_tasks));
  }, [agent]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      await update.mutateAsync({
        agentId: agent.id,
        name: name.trim() || agent.name,
        instructions: instructions.trim(),
        model: model.trim() || null,
        max_concurrent_tasks: Math.max(1, parseInt(maxTasks, 10) || agent.max_concurrent_tasks),
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const statusDot =
    agent.status === "working"
      ? "bg-amber-500"
      : agent.runtime?.status === "online"
        ? "bg-emerald-500"
        : "bg-muted-foreground/30";

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-foreground/5"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
        <span className="flex-1 truncate text-sm font-medium text-foreground">{agent.name}</span>
        {agent.model && (
          <span className="shrink-0 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            {agent.model}
          </span>
        )}
        <ChevronDownIcon className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4 border-t border-border/60 px-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Model <span className="normal-case font-normal">(optional)</span>
              </label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. claude-opus-4-5, ollama/qwen3:8b"
                className="w-full rounded-lg border border-border/80 bg-background px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Max concurrent tasks
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxTasks}
              onChange={(e) => setMaxTasks(e.target.value)}
              className="w-24 rounded-lg border border-border/80 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              System instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-border/80 bg-background px-3 py-2 font-mono text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-[12px] text-muted-foreground">
              Prepended as a system prompt before every task assigned to this agent.
            </p>
          </div>

          {err && <p className="text-[12px] text-destructive">{err}</p>}
          {saved && <p className="text-[12px] text-emerald-600 dark:text-emerald-400">Saved.</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function AgentsPanel({ workspaceId }: { workspaceId: string }) {
  const { apiClient } = useCoreContext();
  const { data: agents = [], isLoading } = useQuery(agentListOptions(apiClient, workspaceId));

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (agents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-6 py-8 text-center text-sm text-muted-foreground">
        No agents in this workspace. Add one from the sidebar.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Configure each agent&apos;s name, model override, concurrency limit, and system instructions.
      </p>
      {agents.map((a: Agent) => (
        <AgentRow key={a.id} agent={a} />
      ))}
    </div>
  );
}

function PlaceholderPanel({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        This section is not available in Open Conductor yet. Use <strong className="text-foreground">General</strong>{" "}
        for workspace paths and naming.
      </p>
    </div>
  );
}

export function WorkspaceSettingsView() {
  const { workspaceId, section: sectionParam } = useParams<{ workspaceId: string; section?: string }>();
  const navigate = useNavigate();
  const { apiClient } = useCoreContext();
  const section = sectionParam ?? "general";

  const { data: ws, isLoading } = useQuery({
    ...workspaceDetailOptions(apiClient, workspaceId ?? ""),
    enabled: !!workspaceId,
  });
  const { data: workspaces = [] } = useQuery(workspaceListOptions(apiClient));

  const updateWs = useUpdateWorkspace(apiClient);

  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [workingDir, setWorkingDir] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pickBusy, setPickBusy] = useState(false);

  useEffect(() => {
    if (!ws) return;
    setName(ws.name);
    setPrefix(ws.prefix ?? "");
    setWorkingDir(ws.working_directory ?? "");
    setFormError(null);
  }, [ws]);

  function goSection(next: string) {
    if (!workspaceId) return;
    navigate(`/w/${workspaceId}/settings/${next}`);
  }

  function backToApp() {
    if (!workspaceId) return;
    navigate(`/w/${workspaceId}/issues`);
  }

  async function browseRoot() {
    const pick = getPickDirectory();
    if (!pick) return;
    setPickBusy(true);
    try {
      const res = await pick();
      if (res.ok) setWorkingDir(res.path);
    } finally {
      setPickBusy(false);
    }
  }

  async function saveGeneral(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !ws) return;
    setFormError(null);
    try {
      await updateWs.mutateAsync({
        id: workspaceId,
        name: name.trim() || ws.name,
        prefix: prefix.trim().toUpperCase() || undefined,
        working_directory: workingDir.trim() === "" ? null : workingDir.trim(),
      });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  if (!workspaceId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">No workspace.</div>
    );
  }

  if (isLoading || !ws) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">Loading workspace…</div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-canvas/55 backdrop-blur-[2px]">
      {/* Left sidebar */}
      <aside className="flex w-[220px] flex-shrink-0 flex-col border-r border-border/70 bg-background/50">
        <div className="border-b border-border/60 p-2">
          <button
            type="button"
            onClick={backToApp}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <span aria-hidden className="text-base">
              ←
            </span>
            Back to app
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 p-2" aria-label="Settings sections">
          {MAIN_NAV.map((item) => (
            <NavButton key={item.id} active={section === item.id} onClick={() => goSection(item.id)}>
              {item.label}
            </NavButton>
          ))}
        </nav>

        <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">More</p>
        <nav className="flex flex-col gap-0.5 px-2 pb-2">
          {MORE_NAV.map((item) => (
            <NavButton key={item.id} active={section === item.id} onClick={() => goSection(item.id)}>
              {item.label}
            </NavButton>
          ))}
        </nav>

        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          Repositories
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {workspaces.map((w: Workspace) => {
            const active = w.id === workspaceId;
            return (
              <Link
                key={w.id}
                to={`/w/${w.id}/settings/${section}`}
                className={`mb-0.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                  active ? "bg-foreground/10 font-medium text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                }`}
              >
                <WorkspaceIdenticon workspaceId={w.id} label={w.name} />
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
              </Link>
            );
          })}
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-8 py-8">
          <header className="mb-8 flex items-center gap-3 border-b border-border/60 pb-6">
            <WorkspaceIdenticon
              workspaceId={ws.id}
              label={ws.name}
              className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-border/80 bg-neutral-200/90 dark:border-white/[0.12] dark:bg-neutral-700/60"
            />
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{ws.name}</h1>
          </header>

          {section === "general" && (
            <form onSubmit={(e) => void saveGeneral(e)} className="space-y-8">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Workspace name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Issue prefix
                </label>
                <input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.slice(0, 5).toUpperCase())}
                  maxLength={5}
                  className="w-full max-w-[120px] rounded-lg border border-border/80 bg-background px-3 py-2 font-mono text-sm uppercase text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <section className="space-y-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Root path</h2>
                <button
                  type="button"
                  onClick={() => void browseRoot()}
                  disabled={pickBusy || !getPickDirectory()}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/80 bg-background/80 px-3 py-2.5 text-left transition-colors hover:bg-accent/50 disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">
                    {workingDir || "— Not set —"}
                  </span>
                  <ChevronDownIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </button>
                <p className="flex gap-2 text-[12px] leading-relaxed text-muted-foreground">
                  <InfoIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/80" />
                  <span>
                    This folder is the project root for agents and tools. Prefer choosing a path with{" "}
                    <strong className="text-foreground/90">Browse</strong> (desktop) so it stays valid on disk.
                  </span>
                </p>
              </section>

              <section className="space-y-3 opacity-80">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Workspaces path</h2>
                <div className="flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2.5">
                  <span className="truncate font-mono text-[12px] text-muted-foreground">Managed by Open Conductor server</span>
                  <ChevronDownIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                </div>
                <p className="flex gap-2 text-[12px] leading-relaxed text-muted-foreground">
                  <InfoIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>In this app, per-workspace data lives on the API server; there is no separate checkout path to configure here.</span>
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Preview URL</h2>
                <input
                  value={previewUrl}
                  onChange={(e) => setPreviewUrl(e.target.value)}
                  placeholder="https://localhost:3000 (optional, local only)"
                  className="w-full rounded-lg border border-border/80 bg-background px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-[12px] text-muted-foreground">
                  Not persisted yet — placeholder for a future release. Use the root path above for real agent runs.
                </p>
              </section>

              {formError && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>
              )}
              {savedFlash && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={updateWs.isPending}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {updateWs.isPending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          )}

          {section === "environment" && workspaceId && <EnvironmentPanel workspaceId={workspaceId} />}

          {section === "agents" && workspaceId && <AgentsPanel workspaceId={workspaceId} />}

          {section === "git" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border/60 bg-card/40 p-6">
                <h2 className="text-sm font-medium text-foreground">Repository</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Workspace type: <span className="font-medium text-foreground">{ws.type}</span>
                </p>
                {ws.type === "remote" && ws.connection_url && (
                  <p className="mt-3 font-mono text-[13px] text-foreground">{ws.connection_url}</p>
                )}
                {ws.type === "local" && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Remote push/pull and PR flows are not wired in Open Conductor yet. Your <strong className="text-foreground">root path</strong>{" "}
                    above is the Git working tree agents use.
                  </p>
                )}
              </div>
            </div>
          )}

          {section !== "general" && section !== "environment" && section !== "agents" && section !== "git" && (
            <PlaceholderPanel title={MAIN_NAV.concat(MORE_NAV).find((x) => x.id === section)?.label ?? "Settings"} />
          )}
        </div>
      </div>
    </div>
  );
}
