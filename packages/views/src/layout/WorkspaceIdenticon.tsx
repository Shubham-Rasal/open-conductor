/**
 * Deterministic GitHub-style identicons: vertically symmetric 5×5 tile grid (same idea as Gravatar/GitHub defaults)
 * with hue derived from workspace id.
 */

function hashString32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function cellFilled(workspaceId: string, row: number, col: number): boolean {
  const mirrorCol = col < 3 ? col : 4 - col;
  const n = hashString32(`${workspaceId}\0${row}\0${mirrorCol}`);
  return (n & 8) !== 0;
}

/** Hue 0–359 for fills (stable per workspace). */
export function workspaceIdenticonHue(workspaceId: string): number {
  return hashString32(`${workspaceId}:hue`) % 360;
}

const ADJ = [
  "swift", "quiet", "bright", "stale", "lucky", "noble", "brave", "calm", "eager", "fancy", "jolly", "merry", "proud", "witty", "zesty", "humble",
] as const;
const NOUN = [
  "octocat", "monolith", "vector", "kernel", "branch", "commit", "buffer", "socket", "thread", "parcel", "beacon", "cipher", "pixel", "shader", "lambda", "delta",
] as const;

/** GitHub-style handle for tooltips: `swift-octocat-7421` (deterministic from id). */
export function workspaceDeterministicHandle(workspaceId: string): string {
  let h = hashString32(`${workspaceId}:handle`);
  const a = ADJ[h % ADJ.length];
  h = Math.imul(h ^ 0x9e3779b9, 0x9e3779b9) >>> 0;
  const n = NOUN[h % NOUN.length];
  h = Math.imul(h ^ 0x85ebca6b, 0x85ebca6b) >>> 0;
  const num = 1000 + (h % 9000);
  return `${a}-${n}-${num}`;
}

interface Props {
  workspaceId: string;
  /** Accessible label, e.g. workspace name */
  label: string;
  className?: string;
}

/**
 * Small rounded identicon matching the sidebar row height (~24px).
 */
export function WorkspaceIdenticon({ workspaceId, label, className }: Props) {
  const handle = workspaceDeterministicHandle(workspaceId);
  const hue = workspaceIdenticonHue(workspaceId);
  // Single fill that reads on both light and dark neutral tile backgrounds
  const fg = `hsl(${hue} 50% 48%)`;
  const cells: { key: string; x: number; y: number; on: boolean }[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      cells.push({
        key: `${r}-${c}`,
        x: c,
        y: r,
        on: cellFilled(workspaceId, r, c),
      });
    }
  }

  return (
    <span
      className={
        className ??
        "relative flex h-6 w-6 flex-shrink-0 overflow-hidden rounded-[5px] border border-black/10 bg-neutral-200/90 dark:border-white/[0.12] dark:bg-neutral-700/60"
      }
      title={`${label} · @${handle}`}
      aria-label={`${label}, avatar ${handle}`}
      role="img"
    >
      <svg viewBox="0 0 5 5" className="h-full w-full" aria-hidden>
        {cells.map(({ key, x, y, on }) =>
          on ? (
            <rect
              key={key}
              x={x + 0.08}
              y={y + 0.08}
              width={0.84}
              height={0.84}
              rx={0.22}
              fill={fg}
            />
          ) : null
        )}
      </svg>
    </span>
  );
}
