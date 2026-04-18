import type { Agent, WorkspaceMemberRow } from "@open-conductor/core/types";

export type AssigneeKind = "none" | "agent" | "member";

const selectSurface =
  "w-full rounded-lg border border-border/80 bg-background px-3 py-2.5 text-sm text-foreground shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40 hover:border-border";

interface Props {
  kind: AssigneeKind;
  agentId: string;
  userId: string;
  agents: Agent[];
  members: WorkspaceMemberRow[];
  onChange: (next: { kind: AssigneeKind; agentId?: string; userId?: string }) => void;
  disabled?: boolean;
}

export function AssigneeSelector({ kind, agentId, userId, agents, members, onChange, disabled }: Props) {
  return (
    <div className="space-y-2">
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Assignee</label>
      <select
        value={kind}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value as AssigneeKind;
          if (v === "none") onChange({ kind: "none" });
          else if (v === "agent") onChange({ kind: "agent", agentId: agents[0]?.id ?? "" });
          else onChange({ kind: "member", userId: members[0]?.user_id ?? "" });
        }}
        className={selectSurface}
      >
        <option value="none">Unassigned</option>
        <option value="agent">Agent</option>
        <option value="member">Team member</option>
      </select>

      {kind === "agent" && (
        <select
          value={agentId}
          disabled={disabled}
          onChange={(e) => onChange({ kind: "agent", agentId: e.target.value })}
          className={selectSurface}
        >
          <option value="">Select agent…</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.status})
            </option>
          ))}
        </select>
      )}

      {kind === "member" && (
        <select
          value={userId}
          disabled={disabled}
          onChange={(e) => onChange({ kind: "member", userId: e.target.value })}
          className={selectSurface}
        >
          <option value="">Select member…</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
