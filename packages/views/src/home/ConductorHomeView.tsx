import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { issueListOptions } from "@open-conductor/core/issues";
import { useCoreContext } from "@open-conductor/core/platform";
import { useUpdateWorkspace } from "@open-conductor/core/workspaces";

function BranchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9v5a3 3 0 01-3 3h-3" />
    </svg>
  );
}

function SegmentedWordmark() {
  const letters = "CONDUCTOR".split("");
  return (
    <div className="flex flex-col items-center gap-3 md:gap-4">
      <p className="text-xs font-semibold uppercase tracking-[0.45em] text-muted-foreground md:text-sm">
        Open
      </p>
      <div className="flex flex-wrap items-center justify-center gap-[3px] md:gap-1">
        {letters.map((ch, i) => (
          <span
            key={`${ch}-${i}`}
            className="inline-flex min-w-[0.65em] items-center justify-center border border-white/[0.12] bg-white/[0.04] px-[0.2em] py-[0.15em] font-black text-[clamp(1.75rem,7vw,3.25rem)] leading-none tracking-tight text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md"
          >
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}

function GlassActionCard({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-8 text-center shadow-[0_8px_40px_rgba(0,0,0,0.25)] backdrop-blur-xl transition-[background,box-shadow,transform] hover:bg-white/[0.06] hover:shadow-[0_12px_48px_rgba(0,0,0,0.35)] hover:-translate-y-0.5"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-foreground/90 backdrop-blur-sm transition-colors group-hover:border-white/[0.12]">
        {icon}
      </span>
      <span className="text-[15px] font-medium text-foreground/95">{label}</span>
    </button>
  );
}

export function ConductorHomeView() {
  const navigate = useNavigate();
  const { apiClient, workspaceId } = useCoreContext();
  const updateWs = useUpdateWorkspace(apiClient);

  const { data: issues = [] } = useQuery({
    ...issueListOptions(apiClient, workspaceId),
    enabled: !!workspaceId,
  });

  const done = issues.filter((i) => i.status === "done").length;
  const total = issues.length;

  async function openProject() {
    if (!workspaceId) {
      window.alert("Select a workspace in the sidebar first.");
      return;
    }
    const raw = window.prompt(
      "Set the working directory for this workspace (absolute path, or ~/…):"
    );
    if (raw == null) return;
    const t = raw.trim();
    if (!t) return;
    try {
      await updateWs.mutateAsync({ id: workspaceId, working_directory: t });
    } catch {
      /* mutation surfaces via global error handling if added */
    }
  }

  function cloneFromUrl() {
    window.alert("Clone from URL will be available in a future update.");
  }

  function quickStart() {
    if (!workspaceId) {
      window.alert("Select a workspace in the sidebar first.");
      return;
    }
    navigate(`/w/${workspaceId}/issues`);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-transparent px-6 py-10 md:px-12 md:py-14">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center">
        <div className="mb-12 w-full md:mb-16">
          <SegmentedWordmark />
        </div>

        <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
          <GlassActionCard
            label="Open project"
            onClick={() => void openProject()}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M3 7h5l2-3h6a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
            }
          />
          <GlassActionCard
            label="Clone from URL"
            onClick={cloneFromUrl}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h5a4 4 0 008 0h5" />
                <path d="M12 3v5a4 4 0 004 4" />
              </svg>
            }
          />
          <GlassActionCard
            label="Quick start"
            onClick={quickStart}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M3 7h5l2-3h6a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                <path d="M12 11v6M9 14h6" strokeLinecap="round" />
              </svg>
            }
          />
        </div>

        <div className="mt-auto flex items-center gap-2 pt-16 text-sm text-muted-foreground">
          <BranchIcon className="opacity-60" />
          <span>
            {!workspaceId
              ? "Choose a workspace to get started"
              : total === 0
                ? "No issues yet"
                : `${done}/${total} issues completed`}
          </span>
        </div>
      </div>
    </div>
  );
}
