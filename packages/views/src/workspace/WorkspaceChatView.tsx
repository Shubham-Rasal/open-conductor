import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  workspaceMessagesOptions,
  usePostWorkspaceMessage,
} from "@open-conductor/core/chat";
import { useCreateIssue } from "@open-conductor/core/issues";
import { useCoreContext } from "@open-conductor/core/platform";
import { agentListOptions } from "@open-conductor/core/agents";
import type { Agent, ProposedPlanIssue } from "@open-conductor/core/types";

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none">
      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="6" width="11" height="7.5" rx="1.75" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5.5" cy="9.75" r="1" fill="currentColor" />
      <circle cx="10.5" cy="9.75" r="1" fill="currentColor" />
      <path d="M8 6V3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="2.75" r="0.75" fill="currentColor" />
    </svg>
  );
}

function ImageAttachIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5.5" cy="7" r="1" fill="currentColor" />
      <path d="M2 11.5l3.5-3.5 2.5 2.5 2-2 3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 14 14" fill="none">
      <path d="M7 12V2M3 6l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XSmallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 10 10" fill="none">
      <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5L5 11M11 5l1.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none">
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <path d="M2.5 8a5.5 5.5 0 1 0 1.1-3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2.5 4v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 5.5V8l1.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MarkdownContent({ content, streaming = false }: { content: string; streaming?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        h1: ({ children }) => <h1 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-medium first:mt-0">{children}</h3>,
        ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ children, className }) =>
          className?.includes("language-") ? (
            <code className="block">{children}</code>
          ) : (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]">{children}</code>
          ),
        pre: ({ children }) => (
          <pre className="mb-2 overflow-x-auto rounded-lg bg-muted px-3 py-2.5 font-mono text-xs last:mb-0">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted-foreground last:mb-0">
            {children}
          </blockquote>
        ),
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:opacity-80">
            {children}
          </a>
        ),
        hr: () => <hr className="my-3 border-border/50" />,
        table: ({ children }) => (
          <div className="mb-2 overflow-x-auto last:mb-0">
            <table className="w-full text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-border/50 bg-muted px-2 py-1 text-left font-medium">{children}</th>,
        td: ({ children }) => <td className="border border-border/50 px-2 py-1">{children}</td>,
      }}
    >
      {streaming ? content + "▍" : content}
    </ReactMarkdown>
  );
}

// ── Tool call block ───────────────────────────────────────────────────────────

function ToolCallBlock({
  tool,
  input,
  output,
  pending,
}: {
  tool: string;
  input?: string;
  output?: string;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);

  let parsedInput: string | null = null;
  if (input) {
    try {
      parsedInput = JSON.stringify(JSON.parse(input), null, 2);
    } catch {
      parsedInput = input;
    }
  }

  let parsedOutput: string | null = null;
  if (output) {
    try {
      parsedOutput = JSON.stringify(JSON.parse(output), null, 2);
    } catch {
      parsedOutput = output;
    }
  }

  const isWorkspaceTool = [
    "bash", "computer", "str_replace_editor", "read_file", "write_file",
  ].includes(tool) === false;

  const toolLabel = tool === "bash" ? "bash" : tool;
  const accentClass = pending
    ? "border-border/50 bg-muted/30"
    : output
      ? "border-success/20 bg-success/5"
      : "border-border/50 bg-muted/30";

  return (
    <div className={`my-1 rounded-lg border text-xs ${accentClass}`}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {/* Status indicator */}
        {pending ? (
          <svg className="h-3 w-3 flex-shrink-0 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3 flex-shrink-0 text-success">
            <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.25" />
            <path d="M3.5 6l1.75 1.75 3.25-3.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}

        {/* Tool name */}
        <span className={`font-mono font-medium ${isWorkspaceTool ? "text-brand" : "text-foreground/80"}`}>
          {toolLabel}
        </span>

        {/* Brief preview of input when collapsed */}
        {!open && parsedInput && (
          <span className="flex-1 truncate text-muted-foreground/60">
            {parsedInput.slice(0, 80).replace(/\n/g, " ")}
          </span>
        )}

        {/* Chevron */}
        <ChevronDownIcon
          className={`ml-auto h-3 w-3 flex-shrink-0 text-muted-foreground/50 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border/40 px-3 pb-3 pt-2 space-y-2">
          {parsedInput && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Input</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/80">{parsedInput}</pre>
            </div>
          )}
          {parsedOutput && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Output</p>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/80">{parsedOutput}</pre>
            </div>
          )}
          {pending && !parsedOutput && (
            <p className="text-[11px] italic text-muted-foreground/50">Running…</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tool calls group ──────────────────────────────────────────────────────────

function ToolCallsGroup({ messages }: { messages: ConvMessage[] }) {
  const [open, setOpen] = useState(false);
  const anyPending = messages.some((m) => !m.toolOutput);
  const count = messages.length;

  return (
    <div className="my-1 max-w-[85%] overflow-hidden rounded-lg border border-border/40 bg-muted/20 text-xs">
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
      >
        {anyPending ? (
          <svg className="h-3 w-3 flex-shrink-0 animate-spin text-muted-foreground/70" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3 flex-shrink-0 text-success/80">
            <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.25" />
            <path d="M3.5 6l1.75 1.75 3.25-3.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}

        <span className="text-[11px] font-medium text-muted-foreground/70">
          {anyPending ? "Running" : "Used"} {count} tool{count !== 1 ? "s" : ""}
        </span>

        {/* Tool name pills */}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {messages.slice(0, 4).map((m) => (
            <span
              key={m.id}
              className="flex-shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/60"
            >
              {m.tool ?? "tool"}
            </span>
          ))}
          {messages.length > 4 && (
            <span className="text-[10px] text-muted-foreground/40">+{messages.length - 4}</span>
          )}
        </div>

        <ChevronDownIcon
          className={`ml-auto h-3 w-3 flex-shrink-0 text-muted-foreground/40 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-border/30 px-3 pb-3 pt-2 space-y-1.5">
          {messages.map((m) => (
            <ToolCallBlock
              key={m.id}
              tool={m.tool ?? "tool"}
              input={m.toolInput}
              output={m.toolOutput}
              pending={!m.toolOutput}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Message grouper ───────────────────────────────────────────────────────────

type MsgSegment =
  | { type: "single"; msg: ConvMessage }
  | { type: "tool_group"; msgs: ConvMessage[] };

function groupMessages(messages: ConvMessage[]): MsgSegment[] {
  const segments: MsgSegment[] = [];
  let toolBuf: ConvMessage[] = [];

  function flushTools() {
    if (toolBuf.length === 0) return;
    segments.push({ type: "tool_group", msgs: [...toolBuf] });
    toolBuf = [];
  }

  for (const m of messages) {
    if (m.role === "tool_use") {
      toolBuf.push(m);
    } else {
      flushTools();
      segments.push({ type: "single", msg: m });
    }
  }
  flushTools();
  return segments;
}

// ── Conversation types & storage ──────────────────────────────────────────────

interface ConvMessage {
  id: string;
  role: "user" | "assistant" | "tool_use" | "tool_result" | "thinking" | "plan_proposal";
  content: string;
  createdAt: string;
  // tool call fields
  tool?: string;
  callId?: string;
  toolInput?: string;
  toolOutput?: string;
  // plan proposal fields
  planItems?: ProposedPlanIssue[];
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  messages: ConvMessage[];
}

function makeConversation(): Conversation {
  return {
    id: Math.random().toString(36).slice(2),
    title: "New chat",
    createdAt: new Date().toISOString(),
    messages: [],
  };
}

function useConversations(workspaceId: string) {
  const storeKey = `oc_convs_${workspaceId}`;
  const tabsKey = `oc_tabs_${workspaceId}`;

  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Conversation[];
        if (parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return [makeConversation()];
  });

  const [openTabIds, setOpenTabIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(tabsKey);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return conversations[0] ? [conversations[0].id] : [];
  });

  const [activeId, setActiveId] = useState<string>(openTabIds[0] ?? "");

  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify(conversations)); } catch { /* ignore */ }
  }, [conversations, storeKey]);

  useEffect(() => {
    try { localStorage.setItem(tabsKey, JSON.stringify(openTabIds)); } catch { /* ignore */ }
  }, [openTabIds, tabsKey]);

  const openTabs = useMemo(
    () => openTabIds.map((id) => conversations.find((c) => c.id === id)).filter(Boolean) as Conversation[],
    [openTabIds, conversations]
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  const createTab = useCallback(() => {
    const conv = makeConversation();
    setConversations((prev) => [...prev, conv]);
    setOpenTabIds((prev) => [...prev, conv.id]);
    setActiveId(conv.id);
    return conv.id;
  }, []);

  const closeTab = useCallback((id: string) => {
    setOpenTabIds((prev) => {
      const next = prev.filter((tid) => tid !== id);
      if (next.length === 0) {
        const newConv = makeConversation();
        setConversations((cs) => [...cs, newConv]);
        setActiveId(newConv.id);
        return [newConv.id];
      }
      setActiveId((cur) => {
        if (cur !== id) return cur;
        const idx = prev.indexOf(id);
        return next[Math.max(0, idx - 1)] ?? "";
      });
      return next;
    });
  }, []);

  const openFromHistory = useCallback((id: string) => {
    setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveId(id);
  }, []);

  const addMessage = useCallback((convId: string, msg: ConvMessage) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const title =
          c.messages.length === 0 && msg.role === "user"
            ? msg.content.slice(0, 42) + (msg.content.length > 42 ? "…" : "")
            : c.title;
        return { ...c, title, messages: [...c.messages, msg] };
      })
    );
  }, []);

  const upsertStreamMessage = useCallback((convId: string, streamId: string, content: string) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const exists = c.messages.some((m) => m.id === `stream_${streamId}`);
        if (exists) {
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === `stream_${streamId}` ? { ...m, content } : m
            ),
          };
        }
        return {
          ...c,
          messages: [
            ...c.messages,
            { id: `stream_${streamId}`, role: "assistant", content, createdAt: new Date().toISOString() },
          ],
        };
      })
    );
  }, []);

  const finalizeStreamMessage = useCallback((convId: string, streamId: string) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        return {
          ...c,
          messages: c.messages.map((m) =>
            m.id === `stream_${streamId}` ? { ...m, id: `done_${streamId}` } : m
          ),
        };
      })
    );
  }, []);

  const resolveToolCall = useCallback((convId: string, callId: string, output: string) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        return {
          ...c,
          messages: c.messages.map((m) =>
            m.id === `tool_${callId}` ? { ...m, toolOutput: output } : m
          ),
        };
      })
    );
  }, []);

  const upsertThinkingMessage = useCallback((convId: string, streamId: string, content: string) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const exists = c.messages.some((m) => m.id === `think_${streamId}`);
        if (exists) {
          return { ...c, messages: c.messages.map((m) => m.id === `think_${streamId}` ? { ...m, content } : m) };
        }
        return {
          ...c,
          messages: [...c.messages, { id: `think_${streamId}`, role: "thinking" as const, content, createdAt: new Date().toISOString() }],
        };
      })
    );
  }, []);

  return {
    conversations,
    openTabs,
    activeId,
    activeConversation,
    setActiveId,
    createTab,
    closeTab,
    openFromHistory,
    addMessage,
    upsertStreamMessage,
    finalizeStreamMessage,
    resolveToolCall,
    upsertThinkingMessage,
  };
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({
  tabs,
  activeId,
  onSelect,
  onClose,
  onCreate,
  onToggleHistory,
  streamingConvIds,
  unreadConvIds,
}: {
  tabs: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: () => void;
  onToggleHistory: () => void;
  streamingConvIds: Set<string>;
  unreadConvIds: Set<string>;
}) {
  return (
    <div className="flex items-stretch border-b border-border/60 bg-background/20 min-h-[38px]">
      {/* Scrollable tab list */}
      <div className="flex flex-1 items-stretch overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          const isStreaming = streamingConvIds.has(tab.id);
          const isUnread = !isActive && unreadConvIds.has(tab.id);
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              className={`group relative flex min-w-0 max-w-[180px] items-center gap-1.5 px-3 py-2 text-xs transition-colors flex-shrink-0 ${
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground/70 hover:text-muted-foreground"
              }`}
            >
              <SparkleIcon className="h-3 w-3 flex-shrink-0 opacity-70" />
              <span className="truncate">{tab.title}</span>

              {/* Status dot — streaming (blink) or unread (yellow), hidden on active */}
              {!isActive && (isStreaming || isUnread) && (
                <span
                  className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                    isStreaming
                      ? "bg-muted-foreground/60 animate-pulse"
                      : "bg-yellow-400"
                  }`}
                />
              )}

              {/* Close button — only on hover, only if more than one tab */}
              {tabs.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onClose(tab.id); } }}
                  className="ml-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent cursor-pointer"
                >
                  <XSmallIcon className="h-2 w-2" />
                </span>
              )}

              {/* Active underline */}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-px bg-foreground/60 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* New tab */}
      <button
        type="button"
        onClick={onCreate}
        title="New chat (⌘N)"
        className="flex h-full w-9 flex-shrink-0 items-center justify-center text-muted-foreground/60 transition-colors hover:text-foreground"
      >
        <PlusIcon className="h-3 w-3" />
      </button>

      {/* History */}
      <button
        type="button"
        onClick={onToggleHistory}
        title="Chat history"
        className="flex h-full w-9 flex-shrink-0 items-center justify-center text-muted-foreground/60 transition-colors hover:text-foreground"
      >
        <HistoryIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── History panel ─────────────────────────────────────────────────────────────

function HistoryPanel({
  conversations,
  activeId,
  onSelect,
  onClose,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const sorted = useMemo(() => [...conversations].reverse(), [conversations]);

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-30"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="absolute inset-y-0 right-0 z-40 flex w-72 flex-col border-l border-border/60 bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <p className="text-sm font-medium text-foreground">History</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <XSmallIcon className="h-3 w-3" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {sorted.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">No conversations yet</p>
          )}
          {sorted.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => { onSelect(conv.id); onClose(); }}
              className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent ${
                conv.id === activeId ? "bg-accent/60" : ""
              }`}
            >
              <SparkleIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/50" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{conv.title}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                  {conv.messages.length} message{conv.messages.length !== 1 ? "s" : ""} · {formatDate(conv.createdAt)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Proposed issues card (inline in chat) ─────────────────────────────────────

function ProposedIssuesCard({
  items,
  onAdd,
}: {
  items: ProposedPlanIssue[];
  onAdd: (item: ProposedPlanIssue) => Promise<void>;
}) {
  const [itemState, setItemState] = useState<Record<string, "loading" | "done">>({});

  async function handleAdd(item: ProposedPlanIssue, key: string) {
    setItemState((s) => ({ ...s, [key]: "loading" }));
    try {
      await onAdd(item);
      setItemState((s) => ({ ...s, [key]: "done" }));
    } catch {
      setItemState((s) => { const n = { ...s }; delete n[key]; return n; });
    }
  }

  async function handleAddAll() {
    await Promise.all(
      items.map((it, i) => {
        const key = `${it.title}-${i}`;
        if (!itemState[key]) return handleAdd(it, key);
        return Promise.resolve();
      })
    );
  }

  const addedCount = Object.values(itemState).filter((s) => s === "done").length;
  const allAdded = addedCount === items.length;

  return (
    <div className="my-1 w-full max-w-xl rounded-xl border border-border/60 bg-card/60 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <svg className="h-3.5 w-3.5 text-brand" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5L5 11M11 5l1.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          <span className="text-xs font-semibold text-foreground">Proposed issues</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground/60">
            {addedCount}/{items.length} added
          </span>
          {!allAdded && (
            <button
              type="button"
              onClick={() => void handleAddAll()}
              className="rounded-md border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              Add all
            </button>
          )}
        </div>
      </div>

      {/* Issue list */}
      <ul className="divide-y divide-border/30">
        {items.map((it, i) => {
          const key = `${it.title}-${i}`;
          const state = itemState[key];
          return (
            <li key={key} className={`flex items-start gap-3 px-4 py-3 transition-colors ${state === "done" ? "opacity-50" : ""}`}>
              {/* Status dot / check */}
              <span className="mt-[3px] flex h-4 w-4 flex-shrink-0 items-center justify-center">
                {state === "done" ? (
                  <svg viewBox="0 0 12 12" fill="none" className="h-3.5 w-3.5 text-success">
                    <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.25" />
                    <path d="M3.5 6l1.75 1.75 3.25-3.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className={`text-xs font-medium ${state === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {it.title}
                </p>
                {it.description && (
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/70">{it.description}</p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground/50">
                  {it.priority} · {it.suggested_assignee}
                </p>
              </div>

              {/* Action */}
              {state === "loading" ? (
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : state === "done" ? (
                <span className="flex-shrink-0 rounded-md bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success">
                  Added
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleAdd(it, key)}
                  className="flex-shrink-0 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Add
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Composer image type ───────────────────────────────────────────────────────

interface AttachedImage {
  id: string;
  dataUrl: string;
  name: string;
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function WorkspaceChatView() {
  const { apiClient, workspaceId, wsClient } = useCoreContext();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const agentPickerRef = useRef<HTMLDivElement>(null);
  const streamConvMapRef = useRef<Record<string, string>>({});
  const streamBufRef = useRef<Record<string, string>>({});

  // Seed from API on first load (read-only reference, not for display)
  useQuery(workspaceMessagesOptions(apiClient, workspaceId));

  const { data: agents = [] } = useQuery(agentListOptions(apiClient, workspaceId));
  const postMsg = usePostWorkspaceMessage();
  const createIssue = useCreateIssue();

  const conv = useConversations(workspaceId);

  // ── Stable refs for WS handler (avoids re-registering on every render) ───────
  const activeConvIdRef = useRef(conv.activeId);
  const convMethodsRef = useRef(conv);
  // Update every render — no deps, runs after every render synchronously
  activeConvIdRef.current = conv.activeId;
  convMethodsRef.current = conv;

  const [input, setInput] = useState("");
  const [streamingIds, setStreamingIds] = useState<Set<string>>(new Set());
  // convId → streaming in progress
  const [streamingConvIds, setStreamingConvIds] = useState<Set<string>>(new Set());
  // convId → agent replied but tab not yet visited
  const [unreadConvIds, setUnreadConvIds] = useState<Set<string>>(new Set());
  // per-tab pending state — replaces global mutation isPending
  const [pendingConvIds, setPendingConvIds] = useState<Set<string>>(new Set());
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [mode, setMode] = useState<"plan" | "execute">("plan");

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const mountedRef = useRef(false);

  // On first render (tab open/switch) jump instantly to bottom; smooth-scroll for new messages
  useEffect(() => {
    const behavior = mountedRef.current ? "smooth" : "instant";
    mountedRef.current = true;
    bottomRef.current?.scrollIntoView({ behavior });
  }, [conv.activeConversation?.messages.length]);

  // When active tab changes: reset scroll flag + clear its unread dot
  useEffect(() => {
    mountedRef.current = false;
    setUnreadConvIds((prev) => { const n = new Set(prev); n.delete(conv.activeId); return n; });
  }, [conv.activeId]);

  // WebSocket streaming — only registers once per wsClient.
  // Uses refs for conv callbacks + activeId to always have fresh values without
  // re-registering the listener on every state update (which caused dropped events).
  useEffect(() => {
    if (!wsClient) return;
    const off = wsClient.on("chat:stream", (e) => {
      const p = e.payload as {
        stream_id?: string;
        kind?: "text" | "tool_use" | "tool_result" | "thinking" | "plan_proposal";
        delta?: string;
        done?: boolean;
        tool?: string;
        call_id?: string;
        input?: string;
        output?: string;
        issues?: ProposedPlanIssue[];
      };
      if (!p.stream_id) return;
      const sid = p.stream_id;
      const kind = p.kind ?? "text";
      const convId = streamConvMapRef.current[sid];
      const c = convMethodsRef.current;

      if (p.done) {
        if (convId) {
          c.finalizeStreamMessage(convId, sid);
          delete streamConvMapRef.current[sid];
          delete streamBufRef.current[sid];
          setStreamingConvIds((prev) => { const n = new Set(prev); n.delete(convId); return n; });
          if (convId !== activeConvIdRef.current) {
            setUnreadConvIds((prev) => new Set(prev).add(convId));
          }
        }
        setStreamingIds((prev) => { const next = new Set(prev); next.delete(sid); return next; });
        return;
      }

      if (kind === "plan_proposal" && p.issues?.length && convId) {
        c.addMessage(convId, {
          id: `plan_${Date.now()}`,
          role: "plan_proposal",
          content: "",
          createdAt: new Date().toISOString(),
          planItems: p.issues,
        });
        return;
      }

      if (kind === "tool_use" && p.call_id && convId) {
        c.addMessage(convId, {
          id: `tool_${p.call_id}`,
          role: "tool_use",
          content: "",
          createdAt: new Date().toISOString(),
          tool: p.tool,
          callId: p.call_id,
          toolInput: p.input,
        });
        return;
      }

      if (kind === "tool_result" && p.call_id && convId) {
        c.resolveToolCall(convId, p.call_id, p.output ?? "");
        return;
      }

      if (kind === "thinking" && p.delta && convId) {
        const thinkKey = `think_${sid}`;
        streamBufRef.current[thinkKey] = (streamBufRef.current[thinkKey] ?? "") + p.delta;
        c.upsertThinkingMessage(convId, sid, streamBufRef.current[thinkKey]);
        return;
      }

      if ((kind === "text" || kind === undefined) && p.delta) {
        streamBufRef.current[sid] = (streamBufRef.current[sid] ?? "") + p.delta;
        if (convId) {
          c.upsertStreamMessage(convId, sid, streamBufRef.current[sid]);
          setStreamingConvIds((prev) => new Set(prev).add(convId));
        }
        setStreamingIds((prev) => new Set(prev).add(sid));
      }
    });
    return off;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsClient]);

  // Cmd+N → new chat tab
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        conv.createTab();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [conv.createTab]);

  // Close agent picker on outside click
  useEffect(() => {
    if (!showAgentPicker) return;
    function handler(e: MouseEvent) {
      if (agentPickerRef.current && !agentPickerRef.current.contains(e.target as Node)) {
        setShowAgentPicker(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAgentPicker]);

  // Auto-select Claude when switching to Plan mode
  useEffect(() => {
    if (mode !== "plan") return;
    const agentList = agents as Agent[];
    if (agentList.length === 0) return;
    const claude = agentList.find(
      (a) =>
        a.name.toLowerCase().includes("claude") ||
        a.runtime?.provider === "claude"
    );
    if (claude) setSelectedAgentId(claude.id);
  }, [mode, agents]);

  const selectedAgent = (agents as Agent[]).find((a) => a.id === selectedAgentId) ?? null;
  const isPending = pendingConvIds.has(conv.activeId);
  const canSend = (input.trim().length > 0 || attachedImages.length > 0) && !isPending;

  // Image helpers
  const addImageFromFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setAttachedImages((prev) => [
        ...prev,
        { id: Math.random().toString(36).slice(2), dataUrl: e.target?.result as string, name: file.name || "image.png" },
      ]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const images = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith("image/"));
      if (images.length > 0) {
        e.preventDefault();
        images.forEach((item) => { const f = item.getAsFile(); if (f) addImageFromFile(f); });
      }
    },
    [addImageFromFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/")).forEach(addImageFromFile);
      e.target.value = "";
    },
    [addImageFromFile]
  );

  async function send() {
    const t = input.trim();
    if (!t && attachedImages.length === 0) return;

    const convId = conv.activeId;
    setInput("");
    setAttachedImages([]);
    setPendingConvIds((prev) => new Set(prev).add(convId));

    conv.addMessage(convId, {
      id: `user_${Date.now()}`,
      role: "user",
      content: t,
      createdAt: new Date().toISOString(),
    });

    try {
      // Collect prior turns so the agent has full conversation context.
      // Exclude tool/plan/thinking messages — only user↔assistant text matters.
      const history = (conv.activeConversation?.messages ?? [])
        .filter(
          (m): m is ConvMessage & { role: "user" | "assistant" } =>
            (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0
        )
        .slice(-24) // cap at 24 turns (~12 exchanges) to stay within context limits
        .map((m) => ({ role: m.role, content: m.content }));

      const result = await postMsg.mutateAsync({
        content: t,
        respond_with_assistant: true,
        history: history.length > 0 ? history : undefined,
      });
      if (result.stream_id) {
        streamConvMapRef.current[result.stream_id] = convId;
      }
    } finally {
      setPendingConvIds((prev) => { const n = new Set(prev); n.delete(convId); return n; });
    }
  }

  async function handleAddIssue(item: ProposedPlanIssue) {
    await createIssue.mutateAsync({
      workspaceId,
      title: item.title,
      description: item.description ?? undefined,
      priority: item.priority || "no_priority",
      status: "backlog",
      assignee_type: item.suggested_assignee === "agent" ? "agent" : "member",
    });
  }

  const displayMessages = conv.activeConversation?.messages ?? [];

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-canvas/85 backdrop-blur-[2px]">

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <TabBar
        tabs={conv.openTabs}
        activeId={conv.activeId}
        onSelect={(id) => {
          conv.setActiveId(id);
          setUnreadConvIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
        }}
        onClose={conv.closeTab}
        onCreate={conv.createTab}
        onToggleHistory={() => setShowHistory((s) => !s)}
        streamingConvIds={streamingConvIds}
        unreadConvIds={unreadConvIds}
      />

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {displayMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <SparkleIcon className="mb-3 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground/60">Start a conversation</p>
              <p className="mt-1 text-xs text-muted-foreground/40">
                Switch to <span className="font-medium">Plan</span> to propose issues, or <span className="font-medium">Execute</span> to run tasks
              </p>
            </div>
          )}

          {groupMessages(displayMessages).map((seg, segIdx) => {
            if (seg.type === "tool_group") {
              return <ToolCallsGroup key={`tg_${segIdx}`} messages={seg.msgs} />;
            }

            const m = seg.msg;
            const isStreaming = m.id.startsWith("stream_") && streamingIds.has(m.id.replace("stream_", ""));

            // Thinking block (collapsible, subtle)
            if (m.role === "thinking") {
              return (
                <details key={m.id} className="group max-w-[85%]">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground/70">
                    <svg className="h-3 w-3 transition-transform group-open:rotate-90" viewBox="0 0 12 12" fill="none">
                      <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Thinking…
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap pl-4 font-mono text-[11px] text-muted-foreground/50">{m.content}</p>
                </details>
              );
            }

            // Inline plan proposal card
            if (m.role === "plan_proposal" && m.planItems) {
              return (
                <div key={m.id} className="flex justify-start">
                  <ProposedIssuesCard items={m.planItems} onAdd={handleAddIssue} />
                </div>
              );
            }

            return (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-xl px-4 py-3 text-sm text-foreground ${
                    m.role === "user" ? "bg-card/90" : ""
                  }`}
                >
                  <MarkdownContent content={m.content} streaming={isStreaming} />
                </div>
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Composer ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-border/75 bg-background shadow-sm">

            {/* Image previews */}
            {attachedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 pt-3">
                {attachedImages.map((img) => (
                  <div key={img.id} className="group relative">
                    <img
                      src={img.dataUrl}
                      alt={img.name}
                      className="h-[68px] w-[68px] rounded-lg border border-border/60 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setAttachedImages((prev) => prev.filter((i) => i.id !== img.id))}
                      className="absolute -right-1.5 -top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-foreground text-background opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <XSmallIcon className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              onPaste={handlePaste}
              placeholder={mode === "plan" ? "Describe a goal to plan…" : "Message the agent…"}
              rows={1}
              className="block w-full resize-none bg-transparent px-3 pb-1 pt-3 text-sm text-foreground placeholder:text-muted-foreground/55 focus:outline-none"
              style={{ minHeight: "44px", maxHeight: "200px", overflowY: "auto" }}
            />

            {/* Toolbar */}
            <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1">
              {/* Left */}
              <div className="flex items-center gap-1.5">

                {/* Plan / Execute mode toggle */}
                <div className="flex items-center rounded-md border border-border/60 p-[3px] text-[11px]">
                  <button
                    type="button"
                    onClick={() => setMode("plan")}
                    className={`rounded px-2 py-[3px] transition-colors ${
                      mode === "plan"
                        ? "bg-foreground text-background font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Plan
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("execute")}
                    className={`rounded px-2 py-[3px] transition-colors ${
                      mode === "execute"
                        ? "bg-foreground text-background font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Execute
                  </button>
                </div>

                {/* Agent picker */}
                <div ref={agentPickerRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setShowAgentPicker((s) => !s)}
                    className="flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-[5px] text-[11px] text-foreground transition-colors hover:bg-accent"
                  >
                    <BotIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="max-w-[110px] truncate">
                      {selectedAgent ? selectedAgent.name : "No agent"}
                    </span>
                    {selectedAgent?.model && (
                      <span className="max-w-[56px] truncate text-muted-foreground/60">{selectedAgent.model}</span>
                    )}
                    <ChevronDownIcon className="h-2.5 w-2.5 text-muted-foreground" />
                  </button>

                  {showAgentPicker && (
                    <div className="absolute bottom-full left-0 z-50 mb-2 w-60 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
                      <div className="max-h-64 overflow-y-auto p-1.5">
                        <button
                          type="button"
                          onClick={() => { setSelectedAgentId(null); setShowAgentPicker(false); }}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent ${!selectedAgentId ? "bg-accent/70" : ""}`}
                        >
                          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground/50" />
                          <span className="flex-1 text-muted-foreground">No agent (assistant only)</span>
                        </button>

                        {(agents as Agent[]).length === 0 && (
                          <p className="px-2.5 py-2 text-[11px] text-muted-foreground/60">No agents connected yet</p>
                        )}

                        {(agents as Agent[]).map((agent) => {
                          const dot =
                            agent.status === "idle" ? "bg-success" :
                            agent.status === "working" ? "bg-brand animate-pulse" :
                            agent.status === "error" ? "bg-destructive" : "bg-muted-foreground/40";
                          return (
                            <button
                              key={agent.id}
                              type="button"
                              onClick={() => { setSelectedAgentId(agent.id); setShowAgentPicker(false); }}
                              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent ${selectedAgentId === agent.id ? "bg-accent/70" : ""}`}
                            >
                              <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot}`} />
                              <span className="flex-1 truncate font-medium text-foreground">{agent.name}</span>
                              {agent.model && (
                                <span className="flex-shrink-0 truncate text-muted-foreground/50">{agent.model}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right */}
              <div className="flex items-center gap-1">
                {isPending && (
                  <svg className="h-4 w-4 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Attach image"
                >
                  <ImageAttachIcon className="h-[15px] w-[15px]" />
                </button>
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={() => void send()}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-25"
                >
                  <ArrowUpIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleFileSelect} />
      </div>

      {/* ── History panel ────────────────────────────────────────────────────── */}
      {showHistory && (
        <HistoryPanel
          conversations={conv.conversations}
          activeId={conv.activeId}
          onSelect={conv.openFromHistory}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
