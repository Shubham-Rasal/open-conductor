import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  workspaceMessagesOptions,
  usePostWorkspaceMessage,
  useWorkspacePlan,
} from "@open-conductor/core/chat";
import { useCreateIssue } from "@open-conductor/core/issues";
import { useCoreContext } from "@open-conductor/core/platform";
import { agentListOptions } from "@open-conductor/core/agents";
import type { Agent, ProposedPlanIssue, WorkspaceMessage } from "@open-conductor/core/types";

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
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
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5.5" cy="7" r="1" fill="currentColor" />
      <path d="M2 11.5l3.5-3.5 2.5 2.5 2-2 3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 12V2M3 6l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XSmallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock ? (
            <code className="block">{children}</code>
          ) : (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]">{children}</code>
          );
        },
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
          <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground/80">
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

// ── Types ─────────────────────────────────────────────────────────────────────

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

  const { data: messages = [], isLoading } = useQuery(
    workspaceMessagesOptions(apiClient, workspaceId)
  );
  const { data: agents = [] } = useQuery(agentListOptions(apiClient, workspaceId));
  const postMsg = usePostWorkspaceMessage();
  const plan = useWorkspacePlan();
  const createIssue = useCreateIssue();

  const [input, setInput] = useState("");
  const [streamBuf, setStreamBuf] = useState<Record<string, string>>({});
  const [planItems, setPlanItems] = useState<ProposedPlanIssue[] | null>(null);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // Scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamBuf]);

  // WebSocket streaming
  useEffect(() => {
    if (!wsClient) return;
    const off = wsClient.on("chat:stream", (e) => {
      const p = e.payload as { stream_id?: string; delta?: string; done?: boolean };
      if (!p.stream_id) return;
      if (p.done) {
        setStreamBuf((b) => {
          const n = { ...b };
          delete n[p.stream_id!];
          return n;
        });
        return;
      }
      if (p.delta) {
        setStreamBuf((b) => ({ ...b, [p.stream_id!]: (b[p.stream_id!] ?? "") + p.delta }));
      }
    });
    return off;
  }, [wsClient]);

  // Close agent picker on outside click
  useEffect(() => {
    if (!showAgentPicker) return;
    function handleOutside(e: MouseEvent) {
      if (agentPickerRef.current && !agentPickerRef.current.contains(e.target as Node)) {
        setShowAgentPicker(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showAgentPicker]);

  const sorted = useMemo(
    () => [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [messages]
  );

  const selectedAgent = (agents as Agent[]).find((a) => a.id === selectedAgentId) ?? null;
  const isPending = postMsg.isPending || plan.isPending;
  const canSend = (input.trim().length > 0 || attachedImages.length > 0) && !isPending;

  // Image helpers
  const addImageFromFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setAttachedImages((prev) => [
        ...prev,
        { id: Math.random().toString(36).slice(2), dataUrl, name: file.name || "image.png" },
      ]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter((item) => item.type.startsWith("image/"));
      if (imageItems.length > 0) {
        e.preventDefault();
        imageItems.forEach((item) => {
          const file = item.getAsFile();
          if (file) addImageFromFile(file);
        });
      }
    },
    [addImageFromFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      Array.from(e.target.files ?? [])
        .filter((f) => f.type.startsWith("image/"))
        .forEach(addImageFromFile);
      e.target.value = "";
    },
    [addImageFromFile]
  );

  async function send() {
    const t = input.trim();
    if (!t && attachedImages.length === 0) return;

    setInput("");
    setAttachedImages([]);

    if (t.startsWith("/plan ")) {
      const goal = t.slice(6).trim();
      const res = await plan.mutateAsync({ goal });
      setPlanItems(res.issues ?? []);
      return;
    }

    await postMsg.mutateAsync({ content: t, respond_with_assistant: true });
  }

  async function acceptProposal(it: ProposedPlanIssue) {
    await createIssue.mutateAsync({
      workspaceId,
      title: it.title,
      description: it.description ?? undefined,
      priority: it.priority || "no_priority",
      status: "backlog",
      assignee_type: it.suggested_assignee === "agent" ? "agent" : "member",
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas/55 backdrop-blur-[2px]">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border/70 px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Planning chat</h1>
        <p className="text-sm text-muted-foreground">
          Type{" "}
          <code className="rounded bg-muted px-1 text-xs">/plan your goal</code> to propose
          issues. Messages also get an assistant reply when a CLI is available.
        </p>
      </header>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading messages…</p>}
        <div className="mx-auto max-w-3xl space-y-4">
          {sorted.map((m: WorkspaceMessage) => (
            <div
              key={m.id}
              className={`flex ${m.author_type === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-xl px-4 py-3 text-sm text-foreground ${
                  m.author_type === "user" ? "bg-card/90" : ""
                }`}
              >
                <MarkdownContent content={m.content} />
              </div>
            </div>
          ))}
          {Object.entries(streamBuf).map(([sid, text]) => (
            <div
              key={sid}
              className="mr-8 rounded-xl px-4 py-3"
            >
              <MarkdownContent content={text} streaming />
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Proposed issues */}
      {planItems && planItems.length > 0 && (
        <div className="flex-shrink-0 border-t border-border/70 bg-background/50 px-6 py-4">
          <p className="mb-2 text-sm font-medium text-foreground">Proposed issues</p>
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {planItems.map((it, i) => (
              <li
                key={`${it.title}-${i}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">{it.title}</p>
                  {it.description && (
                    <p className="text-xs text-muted-foreground">{it.description}</p>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {it.priority} · {it.suggested_assignee}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
                  onClick={() => void acceptProposal(it)}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setPlanItems(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Composer ────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-border/75 bg-background shadow-sm">

            {/* Attached image previews */}
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
                      onClick={() =>
                        setAttachedImages((prev) => prev.filter((i) => i.id !== img.id))
                      }
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
              placeholder="Message… or /plan <goal>"
              rows={1}
              className="block w-full resize-none bg-transparent px-3 pb-1 pt-3 text-sm text-foreground placeholder:text-muted-foreground/55 focus:outline-none"
              style={{ minHeight: "44px", maxHeight: "200px", overflowY: "auto" }}
            />

            {/* Toolbar */}
            <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1">
              {/* Left side */}
              <div className="flex items-center gap-1.5">
                {/* Mode pill */}
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-[5px] text-[11px] text-foreground transition-colors hover:bg-accent"
                >
                  <span className="font-semibold leading-none">∞</span>
                  <span>Agent</span>
                  <ChevronDownIcon className="h-2.5 w-2.5 text-muted-foreground" />
                </button>

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
                      <span className="max-w-[56px] truncate text-muted-foreground/60">
                        {selectedAgent.model}
                      </span>
                    )}
                    <ChevronDownIcon className="h-2.5 w-2.5 text-muted-foreground" />
                  </button>

                  {showAgentPicker && (
                    <div className="absolute bottom-full left-0 z-50 mb-2 w-60 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
                      <div className="max-h-64 overflow-y-auto p-1.5">
                        {/* No agent */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAgentId(null);
                            setShowAgentPicker(false);
                          }}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent ${
                            !selectedAgentId ? "bg-accent/70" : ""
                          }`}
                        >
                          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground/50" />
                          <span className="flex-1 text-muted-foreground">No agent (assistant only)</span>
                        </button>

                        {(agents as Agent[]).length === 0 && (
                          <p className="px-2.5 py-2 text-[11px] text-muted-foreground/60">
                            No agents connected yet
                          </p>
                        )}

                        {(agents as Agent[]).map((agent) => {
                          const dotColor =
                            agent.status === "idle"
                              ? "bg-success"
                              : agent.status === "working"
                                ? "bg-brand animate-pulse"
                                : agent.status === "error"
                                  ? "bg-destructive"
                                  : "bg-muted-foreground/40";
                          return (
                            <button
                              key={agent.id}
                              type="button"
                              onClick={() => {
                                setSelectedAgentId(agent.id);
                                setShowAgentPicker(false);
                              }}
                              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent ${
                                selectedAgentId === agent.id ? "bg-accent/70" : ""
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotColor}`}
                              />
                              <span className="flex-1 truncate font-medium text-foreground">
                                {agent.name}
                              </span>
                              {agent.model && (
                                <span className="flex-shrink-0 truncate text-muted-foreground/50">
                                  {agent.model}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right side */}
              <div className="flex items-center gap-1">
                {isPending && (
                  <svg
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
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

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={handleFileSelect}
        />
      </div>
    </div>
  );
}
