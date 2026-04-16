import { useCallback, useEffect, useMemo } from "react";
import { create } from "zustand";
import type { ProposedPlanIssue } from "../types";
import type { Conversation, ConvMessage } from "./conversationTypes";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConversation(): Conversation {
  return {
    id: Math.random().toString(36).slice(2),
    title: "New chat",
    createdAt: new Date().toISOString(),
    messages: [],
  };
}

/** Mark unfinished stream / thinking rows as interrupted (crash / navigate away mid-stream). */
export function cleanupOrphanMessages(messages: ConvMessage[]): ConvMessage[] {
  return messages.map((m) => {
    if (m.id.startsWith("stream_")) {
      const sid = m.id.replace(/^stream_/, "");
      return {
        ...m,
        id: `interrupted_${sid}`,
        content: m.content
          ? `${m.content}\n\n[Stream interrupted — connection lost or app closed before completion]`
          : "[Stream interrupted]",
      };
    }
    if (m.role === "thinking" && m.id.startsWith("think_")) {
      return {
        ...m,
        content: m.content
          ? `${m.content}\n\n[Thinking stream interrupted]`
          : "[Thinking interrupted]",
      };
    }
    return m;
  });
}

function loadConversations(wsId: string): Conversation[] {
  try {
    const raw = localStorage.getItem(`oc_convs_${wsId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Conversation[];
      if (parsed.length > 0) {
        return parsed.map((c) => ({
          ...c,
          messages: cleanupOrphanMessages(c.messages),
        }));
      }
    }
  } catch {
    /* ignore */
  }
  return [makeConversation()];
}

function loadOpenTabIds(wsId: string, conversations: Conversation[]): string[] {
  try {
    const raw = localStorage.getItem(`oc_tabs_${wsId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore */
  }
  return conversations[0] ? [conversations[0].id] : [];
}

function persistConversations(wsId: string, conversations: Conversation[]) {
  try {
    localStorage.setItem(`oc_convs_${wsId}`, JSON.stringify(conversations));
  } catch {
    /* ignore */
  }
}

function persistTabs(wsId: string, openTabIds: string[]) {
  try {
    localStorage.setItem(`oc_tabs_${wsId}`, JSON.stringify(openTabIds));
  } catch {
    /* ignore */
  }
}

/** One-time scan of all oc_convs_* keys in localStorage for orphan stream rows. */
export function scanLocalStorageForOrphanStreams(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("oc_convs_")) keys.push(k);
    }
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Conversation[];
      const cleaned = parsed.map((c) => ({
        ...c,
        messages: cleanupOrphanMessages(c.messages),
      }));
      localStorage.setItem(k, JSON.stringify(cleaned));
    }
  } catch {
    /* ignore */
  }
}

// ─── Chat stream payload (matches server WS) ─────────────────────────────────

export interface ChatStreamPayload {
  stream_id?: string;
  workspace_id?: string;
  kind?: "text" | "tool_use" | "tool_result" | "thinking" | "plan_proposal";
  delta?: string;
  done?: boolean;
  tool?: string;
  call_id?: string;
  input?: string;
  output?: string;
  issues?: ProposedPlanIssue[];
}

// ─── Workspace slice ─────────────────────────────────────────────────────────

interface WorkspaceSlice {
  conversations: Conversation[];
  openTabIds: string[];
  activeId: string;
}

interface ConvStoreState {
  byWorkspace: Record<string, WorkspaceSlice>;
  /** stream_id → routing */
  streamToConv: Record<string, { workspaceId: string; convId: string }>;
  streamBuf: Record<string, string>;
  streamThinkBuf: Record<string, string>;
  streamingStreamIds: Record<string, boolean>;
  streamingConvIds: Record<string, boolean>;
  unreadConvIds: Record<string, boolean>;

  ensureWorkspace: (workspaceId: string) => void;
  setActiveId: (workspaceId: string, id: string) => void;
  createTab: (workspaceId: string) => string;
  closeTab: (workspaceId: string, id: string) => void;
  openFromHistory: (workspaceId: string, id: string) => void;
  addMessage: (workspaceId: string, convId: string, msg: ConvMessage) => void;
  upsertStreamMessage: (workspaceId: string, convId: string, streamId: string, content: string) => void;
  finalizeStreamMessage: (workspaceId: string, convId: string, streamId: string) => void;
  resolveToolCall: (workspaceId: string, convId: string, callId: string, output: string) => void;
  upsertThinkingMessage: (workspaceId: string, convId: string, streamId: string, content: string) => void;
  registerChatStream: (workspaceId: string, streamId: string, convId: string) => void;
  applyChatStreamEvent: (p: ChatStreamPayload) => void;
  clearUnread: (convId: string) => void;
}

function getSlice(state: ConvStoreState, wsId: string): WorkspaceSlice | undefined {
  return state.byWorkspace[wsId];
}

function updateWorkspace(
  state: ConvStoreState,
  wsId: string,
  fn: (slice: WorkspaceSlice) => WorkspaceSlice
): ConvStoreState {
  const slice = state.byWorkspace[wsId];
  if (!slice) return state;
  const next = fn(slice);
  persistConversations(wsId, next.conversations);
  persistTabs(wsId, next.openTabIds);
  return {
    ...state,
    byWorkspace: { ...state.byWorkspace, [wsId]: next },
  };
}

export const useConvStore = create<ConvStoreState>((set, get) => ({
  byWorkspace: {},
  streamToConv: {},
  streamBuf: {},
  streamThinkBuf: {},
  streamingStreamIds: {},
  streamingConvIds: {},
  unreadConvIds: {},

  ensureWorkspace: (workspaceId: string) => {
    if (!workspaceId) return;
    if (get().byWorkspace[workspaceId]) return;
    const conversations = loadConversations(workspaceId);
    const openTabIds = loadOpenTabIds(workspaceId, conversations);
    const activeId = openTabIds[0] ?? conversations[0]?.id ?? "";
    set((s) => ({
      byWorkspace: {
        ...s.byWorkspace,
        [workspaceId]: { conversations, openTabIds, activeId },
      },
    }));
  },

  setActiveId: (workspaceId, id) => {
    set((state) =>
      updateWorkspace(state, workspaceId, (slice) =>
        slice.activeId === id ? slice : { ...slice, activeId: id }
      )
    );
    set((s) => {
      const u = { ...s.unreadConvIds };
      delete u[id];
      return { unreadConvIds: u };
    });
  },

  createTab: (workspaceId) => {
    const conv = makeConversation();
    set((state) =>
      updateWorkspace(state, workspaceId, (slice) => ({
        conversations: [...slice.conversations, conv],
        openTabIds: [...slice.openTabIds, conv.id],
        activeId: conv.id,
      }))
    );
    return conv.id;
  },

  closeTab: (workspaceId, id) => {
    set((state) => {
      const slice = getSlice(state, workspaceId);
      if (!slice) return state;
      const nextTabs = slice.openTabIds.filter((tid) => tid !== id);
      if (nextTabs.length === 0) {
        const newConv = makeConversation();
        const nextSlice: WorkspaceSlice = {
          conversations: [...slice.conversations, newConv],
          openTabIds: [newConv.id],
          activeId: newConv.id,
        };
        persistConversations(workspaceId, nextSlice.conversations);
        persistTabs(workspaceId, nextSlice.openTabIds);
        return {
          ...state,
          byWorkspace: { ...state.byWorkspace, [workspaceId]: nextSlice },
        };
      }
      const idx = slice.openTabIds.indexOf(id);
      const newActive: string =
        slice.activeId === id ? (nextTabs[Math.max(0, idx - 1)] ?? nextTabs[0] ?? "") : slice.activeId;
      const nextSlice: WorkspaceSlice = {
        ...slice,
        openTabIds: nextTabs,
        activeId: newActive,
      };
      persistConversations(workspaceId, nextSlice.conversations);
      persistTabs(workspaceId, nextSlice.openTabIds);
      return { ...state, byWorkspace: { ...state.byWorkspace, [workspaceId]: nextSlice } };
    });
  },

  openFromHistory: (workspaceId, id) => {
    set((state) =>
      updateWorkspace(state, workspaceId, (slice) => ({
        ...slice,
        openTabIds: slice.openTabIds.includes(id) ? slice.openTabIds : [...slice.openTabIds, id],
        activeId: id,
      }))
    );
  },

  addMessage: (workspaceId, convId, msg) => {
    set((state) =>
      updateWorkspace(state, workspaceId, (slice) => ({
        ...slice,
        conversations: slice.conversations.map((c) => {
          if (c.id !== convId) return c;
          const title =
            c.messages.length === 0 && msg.role === "user"
              ? msg.content.slice(0, 42) + (msg.content.length > 42 ? "…" : "")
              : c.title;
          return { ...c, title, messages: [...c.messages, msg] };
        }),
      }))
    );
  },

  upsertStreamMessage: (workspaceId, convId, streamId, content) => {
    set((state) =>
      updateWorkspace(state, workspaceId, (slice) => ({
        ...slice,
        conversations: slice.conversations.map((c) => {
          if (c.id !== convId) return c;
          const mid = `stream_${streamId}`;
          const exists = c.messages.some((m) => m.id === mid);
          if (exists) {
            return {
              ...c,
              messages: c.messages.map((m) => (m.id === mid ? { ...m, content } : m)),
            };
          }
          return {
            ...c,
            messages: [
              ...c.messages,
              {
                id: mid,
                role: "assistant" as const,
                content,
                createdAt: new Date().toISOString(),
              },
            ],
          };
        }),
      }))
    );
  },

  finalizeStreamMessage: (workspaceId, convId, streamId) => {
    set((state) =>
      updateWorkspace(state, workspaceId, (slice) => ({
        ...slice,
        conversations: slice.conversations.map((c) => {
          if (c.id !== convId) return c;
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === `stream_${streamId}` ? { ...m, id: `done_${streamId}` } : m
            ),
          };
        }),
      }))
    );
  },

  resolveToolCall: (workspaceId, convId, callId, output) => {
    set((state) =>
      updateWorkspace(state, workspaceId, (slice) => ({
        ...slice,
        conversations: slice.conversations.map((c) => {
          if (c.id !== convId) return c;
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === `tool_${callId}` ? { ...m, toolOutput: output } : m
            ),
          };
        }),
      }))
    );
  },

  upsertThinkingMessage: (workspaceId, convId, streamId, content) => {
    set((state) =>
      updateWorkspace(state, workspaceId, (slice) => ({
        ...slice,
        conversations: slice.conversations.map((c) => {
          if (c.id !== convId) return c;
          const tid = `think_${streamId}`;
          const exists = c.messages.some((m) => m.id === tid);
          if (exists) {
            return {
              ...c,
              messages: c.messages.map((m) => (m.id === tid ? { ...m, content } : m)),
            };
          }
          return {
            ...c,
            messages: [
              ...c.messages,
              {
                id: tid,
                role: "thinking" as const,
                content,
                createdAt: new Date().toISOString(),
              },
            ],
          };
        }),
      }))
    );
  },

  registerChatStream: (workspaceId, streamId, convId) => {
    set((s) => ({
      streamToConv: { ...s.streamToConv, [streamId]: { workspaceId, convId } },
    }));
    const buf = get().streamBuf[streamId];
    if (buf) {
      get().upsertStreamMessage(workspaceId, convId, streamId, buf);
      set((s) => ({
        streamingConvIds: { ...s.streamingConvIds, [convId]: true },
      }));
    }
  },

  applyChatStreamEvent: (p) => {
    if (!p.stream_id) return;
    const sid = p.stream_id;
    const kind = p.kind ?? "text";
    const mapping = get().streamToConv[sid];
    const convId = mapping?.convId;
    const workspaceId = mapping?.workspaceId;

    if (p.done) {
      if (convId && workspaceId) {
        get().finalizeStreamMessage(workspaceId, convId, sid);
        set((s) => {
          const nextToConv = { ...s.streamToConv };
          delete nextToConv[sid];
          const nextBuf = { ...s.streamBuf };
          delete nextBuf[sid];
          const tk = `think_${sid}`;
          const nextThink = { ...s.streamThinkBuf };
          delete nextThink[tk];
          const nextSS = { ...s.streamingStreamIds };
          delete nextSS[sid];
          const nextSC = { ...s.streamingConvIds };
          delete nextSC[convId];
          const active = s.byWorkspace[workspaceId]?.activeId;
          const unread =
            convId !== active ? { ...s.unreadConvIds, [convId]: true } : { ...s.unreadConvIds };
          return {
            streamToConv: nextToConv,
            streamBuf: nextBuf,
            streamThinkBuf: nextThink,
            streamingStreamIds: nextSS,
            streamingConvIds: nextSC,
            unreadConvIds: unread,
          };
        });
      } else {
        set((s) => {
          const next = { ...s.streamingStreamIds };
          delete next[sid];
          return { streamingStreamIds: next };
        });
      }
      return;
    }

    if (!convId || !workspaceId) {
      if ((kind === "text" || kind === undefined) && p.delta) {
        set((s) => ({
          streamBuf: { ...s.streamBuf, [sid]: (s.streamBuf[sid] ?? "") + p.delta },
          streamingStreamIds: { ...s.streamingStreamIds, [sid]: true },
        }));
      }
      return;
    }

    const c = get();

    if (kind === "plan_proposal" && p.issues?.length) {
      c.addMessage(workspaceId, convId, {
        id: `plan_${Date.now()}`,
        role: "plan_proposal",
        content: "",
        createdAt: new Date().toISOString(),
        planItems: p.issues,
      });
      return;
    }

    if (kind === "tool_use" && p.call_id) {
      c.addMessage(workspaceId, convId, {
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

    if (kind === "tool_result" && p.call_id) {
      c.resolveToolCall(workspaceId, convId, p.call_id, p.output ?? "");
      return;
    }

    if (kind === "thinking" && p.delta) {
      const thinkKey = `think_${sid}`;
      const nextThink = (get().streamThinkBuf[thinkKey] ?? "") + p.delta;
      set((s) => ({ streamThinkBuf: { ...s.streamThinkBuf, [thinkKey]: nextThink } }));
      c.upsertThinkingMessage(workspaceId, convId, sid, nextThink);
      return;
    }

    if ((kind === "text" || kind === undefined) && p.delta) {
      const next = (get().streamBuf[sid] ?? "") + p.delta;
      set((s) => ({
        streamBuf: { ...s.streamBuf, [sid]: next },
        streamingStreamIds: { ...s.streamingStreamIds, [sid]: true },
        streamingConvIds: { ...s.streamingConvIds, [convId]: true },
      }));
      c.upsertStreamMessage(workspaceId, convId, sid, next);
    }
  },

  clearUnread: (convId) => {
    set((s) => {
      const { [convId]: _, ...rest } = s.unreadConvIds;
      return { unreadConvIds: rest };
    });
  },
}));

/** React hook — same surface as legacy `useConversations`, backed by global store. */
export function useWorkspaceConversations(workspaceId: string) {
  if (workspaceId) {
    const st = useConvStore.getState();
    if (!st.byWorkspace[workspaceId]) {
      st.ensureWorkspace(workspaceId);
    }
  }

  const slice = useConvStore((s) => (workspaceId ? s.byWorkspace[workspaceId] : undefined));
  const streamingStreamIds = useConvStore((s) => s.streamingStreamIds);
  const streamingConvIdsRec = useConvStore((s) => s.streamingConvIds);
  const unreadConvIdsRec = useConvStore((s) => s.unreadConvIds);

  const openTabs = useMemo(() => {
    if (!slice) return [];
    return slice.openTabIds
      .map((id) => slice.conversations.find((c) => c.id === id))
      .filter(Boolean) as Conversation[];
  }, [slice]);

  const activeConversation = useMemo(
    () => slice?.conversations.find((c) => c.id === slice?.activeId) ?? null,
    [slice]
  );

  const streamingIds = useMemo(
    () => new Set(Object.keys(streamingStreamIds)),
    [streamingStreamIds]
  );

  const streamingConvIds = useMemo(
    () => new Set(Object.keys(streamingConvIdsRec)),
    [streamingConvIdsRec]
  );

  const unreadConvIds = useMemo(
    () => new Set(Object.keys(unreadConvIdsRec)),
    [unreadConvIdsRec]
  );

  const setActiveId = useCallback(
    (id: string) => {
      useConvStore.getState().setActiveId(workspaceId, id);
    },
    [workspaceId]
  );

  const createTab = useCallback(() => useConvStore.getState().createTab(workspaceId), [workspaceId]);
  const closeTab = useCallback((id: string) => useConvStore.getState().closeTab(workspaceId, id), [workspaceId]);
  const openFromHistory = useCallback(
    (id: string) => useConvStore.getState().openFromHistory(workspaceId, id),
    [workspaceId]
  );
  const addMessage = useCallback(
    (convId: string, msg: ConvMessage) => useConvStore.getState().addMessage(workspaceId, convId, msg),
    [workspaceId]
  );

  return {
    conversations: slice?.conversations ?? [],
    openTabs,
    activeId: slice?.activeId ?? "",
    activeConversation,
    setActiveId,
    createTab,
    closeTab,
    openFromHistory,
    addMessage,
    streamingIds,
    streamingConvIds,
    unreadConvIds,
  };
}

// Run once on module load (browser only)
if (typeof window !== "undefined") {
  scanLocalStorageForOrphanStreams();
}
