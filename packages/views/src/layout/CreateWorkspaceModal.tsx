import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useCoreContext } from "@open-conductor/core/platform";
import {
  flowStepVariants,
  modalBackdropVariants,
  modalPanelVariants,
  ocTransition,
  ocTransitionFast,
} from "../motion/presets";
import { useCreateWorkspace } from "@open-conductor/core/workspaces";
import type { Workspace } from "@open-conductor/core/types";
import { getPickDirectory } from "../pickDirectory";

type Flow = "menu" | "local" | "clone" | "remote";

function deriveRepoFolderName(url: string): string {
  const t = url.trim().replace(/\.git$/i, "");
  const githubIdx = t.indexOf("github.com");
  if (githubIdx >= 0) {
    const after = t.slice(githubIdx + "github.com".length).replace(/^[/:]/, "");
    const parts = after.split("/").filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 1]!.replace(/\.git$/i, "");
  }
  const parts = t.split(/[/:]/).filter(Boolean);
  return parts[parts.length - 1]?.replace(/\.git$/i, "") || "repo";
}

function buildGitCloneCommand(url: string, parentPath: string): string {
  const name = deriveRepoFolderName(url);
  const parent = parentPath.replace(/\/$/, "");
  return `git clone ${url} ${parent}/${name}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (ws: Workspace) => void;
}

export function CreateWorkspaceModal({ open, onClose, onCreated }: Props) {
  const { apiClient } = useCoreContext();
  const createWs = useCreateWorkspace(apiClient);
  const [flow, setFlow] = useState<Flow>("menu");

  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [workingDir, setWorkingDir] = useState("");

  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneParent, setCloneParent] = useState("");
  const [cloneError, setCloneError] = useState<string | null>(null);

  const [remoteUrl, setRemoteUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pickBusy, setPickBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFlow("menu");
    setName("");
    setPrefix("");
    setWorkingDir("");
    setCloneUrl("");
    setCloneParent("");
    setCloneError(null);
    setRemoteUrl("");
    setFormError(null);
    setPickBusy(false);
  }, [open]);

  async function browseIntoSetter(setPath: (v: string) => void) {
    const pick = getPickDirectory();
    if (!pick) return;
    setPickBusy(true);
    try {
      const res = await pick();
      if (res.ok) setPath(res.path);
    } finally {
      setPickBusy(false);
    }
  }

  useEffect(() => {
    if (flow !== "clone" || !cloneUrl.trim()) return;
    const derived = deriveRepoFolderName(cloneUrl);
    setName((n) => (n.trim() === "" ? derived : n));
  }, [cloneUrl, flow]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const inputGlass =
    "w-full rounded-[10px] border border-white/[0.08] bg-black/20 px-3 py-2.5 text-[13px] text-white/95 shadow-inner shadow-black/20 placeholder:text-white/35 backdrop-blur-sm transition focus:border-white/18 focus:outline-none focus:ring-1 focus:ring-white/12";
  const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45";
  const ghostBtn =
    "rounded-[10px] border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-white/90 shadow-sm backdrop-blur-sm transition hover:bg-white/[0.09]";
  const primaryBtn =
    "rounded-[10px] bg-white/[0.92] px-4 py-2 text-[13px] font-semibold text-neutral-900 shadow-md shadow-black/25 transition hover:bg-white disabled:opacity-45";

  async function submitLocal(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const wd = workingDir.trim();
    if (!wd) {
      setFormError("Path to your local repository is required.");
      return;
    }
    try {
      const ws = await createWs.mutateAsync({
        name: name.trim() || "Workspace",
        prefix: prefix.toUpperCase() || undefined,
        type: "local",
        working_directory: wd,
      });
      onCreated(ws);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create workspace");
    }
  }

  async function submitClone(e: React.FormEvent) {
    e.preventDefault();
    setCloneError(null);
    const url = cloneUrl.trim();
    const parent = cloneParent.trim();
    if (!url || !parent) {
      setCloneError("Repository URL and parent folder are required.");
      return;
    }

    const electron = typeof window !== "undefined" ? window.electron : undefined;
    if (!electron?.gitClone) {
      setCloneError("Automatic clone needs the desktop app. Use “Create workspace (path only)” or copy the git command.");
      return;
    }

    const res = await electron.gitClone(url, parent);
    if (!res.ok) {
      setCloneError(res.error ?? "git clone failed");
      return;
    }
    const targetDir = res.target;
    if (!targetDir) {
      setCloneError("Clone did not return a target path.");
      return;
    }

    try {
      const ws = await createWs.mutateAsync({
        name: name.trim() || deriveRepoFolderName(url),
        prefix: prefix.toUpperCase() || undefined,
        type: "local",
        working_directory: targetDir,
      });
      onCreated(ws);
      onClose();
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Failed to create workspace");
    }
  }

  async function submitCloneManual() {
    setCloneError(null);
    setFormError(null);
    const url = cloneUrl.trim();
    const parent = cloneParent.trim();
    if (!url || !parent) {
      setFormError("Repository URL and parent folder are required.");
      return;
    }
    const expected = `${parent.replace(/\/$/, "")}/${deriveRepoFolderName(url)}`;
    try {
      const ws = await createWs.mutateAsync({
        name: name.trim() || deriveRepoFolderName(url),
        prefix: prefix.toUpperCase() || undefined,
        type: "local",
        working_directory: expected,
      });
      onCreated(ws);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create workspace");
    }
  }

  async function submitRemote(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const u = remoteUrl.trim();
    if (!name.trim() || !u) {
      setFormError("Name and connection URL are required.");
      return;
    }
    try {
      const ws = await createWs.mutateAsync({
        name: name.trim(),
        prefix: prefix.toUpperCase() || undefined,
        type: "remote",
        connection_url: u,
      });
      onCreated(ws);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create workspace");
    }
  }

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="oc-create-ws"
          variants={modalBackdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={ocTransition}
          className="fixed inset-0 z-[500] flex items-center justify-center bg-black/35 p-5 backdrop-blur-2xl backdrop-saturate-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-ws-title"
          onClick={onClose}
        >
          <motion.div
            variants={modalPanelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={ocTransition}
            className="pointer-events-auto flex max-h-[min(90vh,760px)] w-full min-w-0 max-w-[min(100%,480px)] flex-col overflow-hidden rounded-2xl border border-white/[0.12] bg-gradient-to-b from-white/[0.14] to-white/[0.05] shadow-[0_32px_120px_-16px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-3xl backdrop-saturate-150 sm:max-w-[480px]"
            onClick={(e) => e.stopPropagation()}
          >
        {/* Raycast-style top chrome */}
        <div className="border-b border-white/[0.06] px-4 pb-3 pt-4">
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.08] shadow-inner shadow-black/20"
              aria-hidden
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white/85" stroke="currentColor" strokeWidth="1.75">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="create-ws-title" className="text-[15px] font-semibold tracking-tight text-white/95">
                New workspace
              </h2>
              <p className="mt-0.5 text-[12px] leading-relaxed text-white/45">
                Choose how you want to connect a project to Open Conductor.
              </p>
            </div>
            <button
              type="button"
              className="-mr-1 rounded-lg p-2 text-white/45 transition hover:bg-white/[0.08] hover:text-white/90"
              aria-label="Close"
              onClick={onClose}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-4 py-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={flow}
              variants={flowStepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={ocTransitionFast}
              className="max-h-[min(60vh,520px)] min-h-0 overflow-y-auto"
            >
        {flow === "menu" && (
          <div>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">Connect</p>
            <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => setFlow("local")}
              className="group flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.08] focus:bg-white/[0.08] focus:outline-none"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-black/25 text-sky-300/90 shadow-inner shadow-black/30">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M3 7h5l2-3h6a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-white/95">Add a local repo</span>
                  <span className="shrink-0 text-[11px] text-white/35">Local</span>
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-white/42">
                  Point at a folder on this machine that already contains your code.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFlow("clone")}
              className="group flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.08] focus:bg-white/[0.08] focus:outline-none"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-black/25 text-violet-300/90 shadow-inner shadow-black/30">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h5a4 4 0 008 0h5" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-white/95">Clone from GitHub</span>
                  <span className="shrink-0 text-[11px] text-white/35">Git</span>
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-white/42">
                  Clone a repository into a folder (desktop runs <code className="rounded bg-black/30 px-1 font-mono text-[11px] text-white/55">git clone</code>).
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFlow("remote");
                setName("");
              }}
              className="group flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.08] focus:bg-white/[0.08] focus:outline-none"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-black/25 text-amber-200/85 shadow-inner shadow-black/30">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-white/95">Remote setup</span>
                  <span className="shrink-0 text-[11px] text-white/35">Remote</span>
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-white/42">
                  SSH (<code className="rounded bg-black/30 px-1 font-mono text-[11px] text-white/55">ssh://…</code>) or remote API URL.
                </span>
              </span>
            </button>
            </div>
          </div>
        )}

        {flow === "local" && (
          <form onSubmit={(e) => void submitLocal(e)} className="space-y-4">
            <button
              type="button"
              className="text-[13px] text-white/45 transition hover:text-white/85"
              onClick={() => setFlow("menu")}
            >
              ← Back
            </button>
            <div>
              <label className={labelClass}>Workspace name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="My app"
                className={inputGlass}
              />
            </div>
            <div>
              <label className={labelClass}>Local repository path</label>
              <div className="flex gap-2">
                <input
                  value={workingDir}
                  onChange={(e) => setWorkingDir(e.target.value)}
                  required
                  placeholder="/Users/you/projects/my-repo or ~/projects/my-repo"
                  className={`min-w-0 flex-1 ${inputGlass} font-mono text-[12px]`}
                />
                <button
                  type="button"
                  disabled={pickBusy || !getPickDirectory()}
                  title={getPickDirectory() ? "Choose folder" : "Available in the desktop app"}
                  onClick={() => void browseIntoSetter(setWorkingDir)}
                  className={`${ghostBtn} shrink-0 px-3`}
                >
                  {pickBusy ? "…" : "Browse…"}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-white/38">
                Absolute path to the project root. Agents use this as their working directory.
              </p>
            </div>
            <div>
              <label className={labelClass}>Issue prefix</label>
              <input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.slice(0, 5).toUpperCase())}
                placeholder="APP"
                maxLength={5}
                className={`${inputGlass} uppercase`}
              />
            </div>
            {formError && <p className="text-[13px] text-rose-300/95">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className={ghostBtn}>
                Cancel
              </button>
              <button type="submit" disabled={createWs.isPending} className={primaryBtn}>
                {createWs.isPending ? "Creating…" : "Create workspace"}
              </button>
            </div>
          </form>
        )}

        {flow === "clone" && (
          <div className="space-y-4">
            <button
              type="button"
              className="text-[13px] text-white/45 transition hover:text-white/85"
              onClick={() => setFlow("menu")}
            >
              ← Back
            </button>
            <form onSubmit={(e) => void submitClone(e)} className="space-y-4">
              <div>
                <label className={labelClass}>GitHub / Git URL</label>
                <input
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  required
                  placeholder="https://github.com/org/repo.git"
                  className={`${inputGlass} font-mono text-[12px]`}
                />
              </div>
              <div>
                <label className={labelClass}>Parent folder</label>
                <div className="flex gap-2">
                  <input
                    value={cloneParent}
                    onChange={(e) => setCloneParent(e.target.value)}
                    required
                    placeholder="/Users/you/Code"
                    className={`min-w-0 flex-1 ${inputGlass} font-mono text-[12px]`}
                  />
                  <button
                    type="button"
                    disabled={pickBusy || !getPickDirectory()}
                    title={
                      getPickDirectory() ? "Choose parent folder for the clone" : "Available in the desktop app"
                    }
                    onClick={() => void browseIntoSetter(setCloneParent)}
                    className={`${ghostBtn} shrink-0 px-3`}
                  >
                    {pickBusy ? "…" : "Browse…"}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-white/38">
                  Repository will be cloned as{" "}
                  <span className="font-mono text-white/65">
                    {cloneParent.replace(/\/$/, "")}/{cloneUrl ? deriveRepoFolderName(cloneUrl) : "repo"}
                  </span>
                </p>
              </div>
              <div>
                <label className={labelClass}>Workspace name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={cloneUrl ? deriveRepoFolderName(cloneUrl) : "repo"}
                  className={inputGlass}
                />
              </div>
              <div>
                <label className={labelClass}>Issue prefix</label>
                <input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.slice(0, 5).toUpperCase())}
                  placeholder="GH"
                  maxLength={5}
                  className={`${inputGlass} uppercase`}
                />
              </div>

              {cloneUrl && cloneParent && (
                <div className="rounded-[10px] border border-white/[0.08] bg-black/25 p-3 shadow-inner shadow-black/30 backdrop-blur-sm">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">Terminal equivalent</p>
                  <code className="block break-all font-mono text-[11px] leading-relaxed text-white/75">
                    {buildGitCloneCommand(cloneUrl, cloneParent)}
                  </code>
                </div>
              )}

              {cloneError && <p className="text-[13px] text-amber-200/90">{cloneError}</p>}
              {formError && <p className="text-[13px] text-rose-300/95">{formError}</p>}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className={ghostBtn}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitCloneManual()}
                  disabled={createWs.isPending}
                  className={ghostBtn}
                >
                  Create workspace (path only)
                </button>
                <button
                  type="submit"
                  disabled={createWs.isPending || !window.electron?.gitClone}
                  className={primaryBtn}
                  title={
                    window.electron?.gitClone
                      ? undefined
                      : "Available in the desktop app (runs git clone for you)"
                  }
                >
                  {createWs.isPending ? "Working…" : "Clone & create"}
                </button>
              </div>
            </form>
          </div>
        )}

        {flow === "remote" && (
          <form onSubmit={(e) => void submitRemote(e)} className="space-y-4">
            <button
              type="button"
              className="text-[13px] text-white/45 transition hover:text-white/85"
              onClick={() => setFlow("menu")}
            >
              ← Back
            </button>
            <div>
              <label className={labelClass}>Workspace name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Staging server"
                className={inputGlass}
              />
            </div>
            <div>
              <label className={labelClass}>Connection URL</label>
              <input
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                required
                placeholder="ssh://user@host:22 or https://remote-host:8080"
                className={`${inputGlass} font-mono text-[12px]`}
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-white/38">
                SSH for agent execution on a remote host, or HTTPS if the remote exposes the same API (e.g. detect-agents).
              </p>
            </div>
            <div>
              <label className={labelClass}>Issue prefix</label>
              <input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.slice(0, 5).toUpperCase())}
                placeholder="REM"
                maxLength={5}
                className={`${inputGlass} uppercase`}
              />
            </div>
            {formError && <p className="text-[13px] text-rose-300/95">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className={ghostBtn}>
                Cancel
              </button>
              <button type="submit" disabled={createWs.isPending} className={primaryBtn}>
                {createWs.isPending ? "Creating…" : "Create workspace"}
              </button>
            </div>
          </form>
        )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.08] bg-black/15 px-4 py-3 backdrop-blur-md">
          <span className="text-[11px] font-medium text-white/30">Open Conductor</span>
          <div className="flex items-center gap-3 text-[11px] text-white/38">
            <span className="hidden sm:inline">Submit</span>
            <kbd className="rounded-md border border-white/[0.1] bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/55">Enter</kbd>
            <span className="text-white/20">·</span>
            <span className="hidden sm:inline">Close</span>
            <kbd className="rounded-md border border-white/[0.1] bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/55">Esc</kbd>
          </div>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
