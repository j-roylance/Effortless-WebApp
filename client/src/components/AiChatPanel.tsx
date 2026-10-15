import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiStream } from "../api/client";
import type { AiChat, AiChatMessage } from "../api/types";
import { appendGoals, createVision, visionChainQuery } from "../api/vision-chain";
import { ChainChecklist, NameConfirmBox } from "./AiChainTools";

const MAX_MESSAGES_PER_REQUEST = 40;

/** Keeps the opening prompt so the model never loses the task, then the most recent turns. */
function trimForRequest(messages: AiChatMessage[]): AiChatMessage[] {
  if (messages.length <= MAX_MESSAGES_PER_REQUEST) return messages;
  return [messages[0]!, ...messages.slice(-(MAX_MESSAGES_PER_REQUEST - 1))];
}

export function EditableTitle({
  title,
  onSave,
  className,
}: {
  title: string;
  onSave: (title: string) => Promise<unknown>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);

  async function commit() {
    const next = draft.trim();
    if (!next || next === title) {
      setEditing(false);
      setDraft(title);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className={`ai-chat-title-row ${className ?? ""}`}>
        <span className="ai-chat-title">{title}</span>
        <button
          type="button"
          className="ai-chat-link-btn"
          onClick={() => {
            setDraft(title);
            setEditing(true);
          }}
        >
          Rename
        </button>
      </div>
    );
  }

  return (
    <form
      className={`ai-chat-title-row ${className ?? ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        void commit();
      }}
    >
      <input
        className="neon-input ai-chat-title-input"
        value={draft}
        maxLength={120}
        autoFocus
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setEditing(false);
            setDraft(title);
          }
        }}
      />
      <button type="submit" className="neon-btn neon-btn-sm" disabled={saving}>
        Save
      </button>
    </form>
  );
}

export function AiChatPanel({
  chatId,
  introLabel,
  onClose,
}: {
  chatId: string;
  introLabel: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["ai-chat", chatId],
    queryFn: () => api<{ chat: AiChat }>(`/ai/chats/${chatId}`),
    staleTime: Infinity,
    retry: false,
  });

  if (isLoading) return <p className="empty-state">Loading chat…</p>;
  if (isError || !data) {
    return (
      <div className="ai-chat-error">
        Could not load this chat.{" "}
        <button type="button" className="neon-btn neon-btn-sm" onClick={onClose}>
          Back
        </button>
      </div>
    );
  }

  return <AiChatConversation chat={data.chat} introLabel={introLabel} onClose={onClose} />;
}

function AiChatConversation({
  chat,
  introLabel,
  onClose,
}: {
  chat: AiChat;
  introLabel: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<AiChatMessage[]>(chat.messages);
  const [action, setAction] = useState<"addVision" | "addGoal" | "saveChain" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { data: chain } = useQuery({
    ...visionChainQuery(chat.visionId ?? "", chat.goalId),
    enabled: !!chat.visionId,
  });
  const existingGoalNames = (chain?.goals ?? []).map((g) => g.name);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const listRef = useRef<HTMLDivElement>(null);

  const isStreaming = streamingText !== null;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function updateCachedChat(patch: Partial<AiChat>) {
    queryClient.setQueryData<{ chat: AiChat }>(["ai-chat", chat.id], (prev) =>
      prev ? { chat: { ...prev.chat, ...patch } } : prev
    );
  }

  /** Saves are chained so they reach the server in the order they were made. */
  function persist(next: AiChatMessage[]) {
    updateCachedChat({ messages: next });
    saveChainRef.current = saveChainRef.current
      .then(() =>
        api(`/ai/chats/${chat.id}`, {
          method: "PATCH",
          body: JSON.stringify({ messages: next }),
        })
      )
      .then(() => {
        setSaveError(null);
        void queryClient.invalidateQueries({ queryKey: ["ai-chats"] });
      })
      .catch((err: Error) => setSaveError(err.message || "Could not save chat"));
  }

  async function renameChat(title: string) {
    await api(`/ai/chats/${chat.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    updateCachedChat({ title });
    void queryClient.invalidateQueries({ queryKey: ["ai-chats"] });
  }

  async function requestReply(history: AiChatMessage[]) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setStreamingText("");

    let reply = "";
    try {
      await apiStream(
        "/ai/chat",
        { messages: trimForRequest(history) },
        (chunk) => {
          reply += chunk;
          setStreamingText(reply);
        },
        controller.signal
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        setError((err as Error).message || "AI request failed");
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setStreamingText(null);
        if (reply.trim()) {
          const next: AiChatMessage[] = [...history, { role: "assistant", content: reply }];
          setMessages(next);
          persist(next);
        }
      }
    }
  }

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "user") void requestReply(messages);
    // Only on mount: resume a chat whose last turn is still waiting for a reply.
  }, []);

  function send() {
    const text = input.trim();
    if (!text || isStreaming) return;
    const next: AiChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    persist(next);
    void requestReply(next);
  }

  function retry() {
    if (isStreaming || messages.length === 0) return;
    const last = messages[messages.length - 1]!;
    const history = last.role === "assistant" ? messages.slice(0, -1) : messages;
    if (history !== messages) {
      setMessages(history);
      persist(history);
    }
    void requestReply(history);
  }

  /** Rewinds the chat so the model never sees anything after `keepCount` messages. */
  function rewindTo(keepCount: number, confirmText: string): boolean {
    const removed = messages.length - keepCount;
    if (removed <= 0 || isStreaming) return false;
    if (!confirm(confirmText.replace("{n}", String(removed)))) return false;
    const next = messages.slice(0, keepCount);
    setMessages(next);
    setError(null);
    persist(next);
    return true;
  }

  function revertToAssistant(index: number) {
    rewindTo(
      index + 1,
      "Revert to this reply? The {n} later message(s) will be removed and the AI won't see them."
    );
  }

  function editUserMessage(index: number) {
    const text = messages[index]!.content;
    if (
      rewindTo(
        index,
        "Edit this message? It and everything after it ({n} message(s)) will be removed so you can resend."
      )
    ) {
      setInput(text);
    }
  }

  function suggestName(target: "vision" | "goal"): Promise<string> {
    return api<{ name: string }>("/ai/suggest-name", {
      method: "POST",
      body: JSON.stringify({ messages: trimForRequest(messages), target }),
    }).then((r) => r.name);
  }

  /** Creates the vision, links this chat to it, and moves to its chain page (the panel follows). */
  async function createVisionForChat(name: string): Promise<string> {
    const vision = await createVision(name);
    await api(`/ai/chats/${chat.id}`, {
      method: "PATCH",
      body: JSON.stringify({ visionId: vision.id, goalId: null }),
    });
    updateCachedChat({ visionId: vision.id, goalId: null });
    void queryClient.invalidateQueries({ queryKey: ["visions"] });
    void queryClient.invalidateQueries({ queryKey: ["ai-chats"] });
    navigate(`/visions/${vision.id}/chain`);
    return vision.id;
  }

  async function addGoalsToChain(visionId: string, names: string[]) {
    await appendGoals(visionId, chat.goalId, names);
    void queryClient.invalidateQueries({ queryKey: ["vision-goals", visionId] });
  }

  async function saveVision(name: string) {
    await createVisionForChat(name);
    setAction(null);
    setNotice(`Created vision "${name}". Keep chatting and use Add Goal for each step.`);
  }

  async function saveGoal(name: string) {
    await addGoalsToChain(chat.visionId!, [name]);
    setAction(null);
    setNotice(`Added "${name}" to the chain.`);
  }

  async function saveChain(name: string | null, goals: string[]) {
    const visionId = chat.visionId ?? (await createVisionForChat(name!));
    await addGoalsToChain(visionId, goals);
    setAction(null);
    setNotice(`Added ${goals.length} goal${goals.length === 1 ? "" : "s"} to the chain.`);
  }

  function openAction(next: "addVision" | "addGoal" | "saveChain") {
    setNotice(null);
    setAction(next);
  }

  const actionsDisabled = isStreaming || messages.length < 2;
  const [intro, ...turns] = messages;

  return (
    <div className="ai-chat neon-card">
      <div className="ai-chat-header">
        <EditableTitle title={chat.title} onSave={renameChat} />
        <button type="button" className="neon-btn neon-btn-sm" onClick={onClose}>
          All chats
        </button>
      </div>

      <div className="ai-chat-list" ref={listRef}>
        {intro && (
          <details className="ai-chat-intro">
            <summary>{introLabel}</summary>
            <pre className="ai-prompt-text">{intro.content}</pre>
          </details>
        )}
        {turns.map((message, turnIndex) => {
          const index = turnIndex + 1;
          const isLast = index === messages.length - 1;
          return (
            <div key={index} className={`ai-chat-turn ai-chat-turn--${message.role}`}>
              <div className={`ai-chat-bubble ai-chat-bubble--${message.role}`}>
                {message.content}
              </div>
              {!isStreaming && message.role === "assistant" && !isLast && (
                <button
                  type="button"
                  className="ai-chat-link-btn"
                  onClick={() => revertToAssistant(index)}
                >
                  Revert to here
                </button>
              )}
              {!isStreaming && message.role === "user" && (
                <button
                  type="button"
                  className="ai-chat-link-btn"
                  onClick={() => editUserMessage(index)}
                >
                  Edit
                </button>
              )}
            </div>
          );
        })}
        {isStreaming && (
          <div className="ai-chat-turn ai-chat-turn--assistant">
            <div className="ai-chat-bubble ai-chat-bubble--assistant">
              {streamingText || <span className="ai-chat-typing">Thinking…</span>}
            </div>
          </div>
        )}
        {error && (
          <div className="ai-chat-error">
            {error}{" "}
            <button type="button" className="neon-btn neon-btn-sm" onClick={retry}>
              Retry
            </button>
          </div>
        )}
      </div>

      {saveError && <div className="ai-chat-error">Not saved: {saveError}</div>}

      {action === null ? (
        <div className="ai-chat-actions">
          {chat.visionId ? (
            <button
              type="button"
              className="neon-btn neon-btn-sm"
              disabled={actionsDisabled}
              onClick={() => openAction("addGoal")}
            >
              Add Goal
            </button>
          ) : (
            <button
              type="button"
              className="neon-btn neon-btn-sm"
              disabled={actionsDisabled}
              onClick={() => openAction("addVision")}
            >
              Add Vision
            </button>
          )}
          <button
            type="button"
            className="neon-btn neon-btn-sm"
            disabled={actionsDisabled}
            onClick={() => openAction("saveChain")}
          >
            Save whole chain
          </button>
        </div>
      ) : action === "saveChain" ? (
        <ChainChecklist
          title="Save whole chain"
          existingNames={existingGoalNames}
          nameLabel={chat.visionId ? undefined : "Vision name"}
          load={async () => {
            const body = JSON.stringify({ messages: trimForRequest(messages) });
            const [extracted, name] = await Promise.all([
              api<{ goals: string[] }>("/ai/extract-chain", { method: "POST", body }),
              chat.visionId ? Promise.resolve(null) : suggestName("vision").catch(() => ""),
            ]);
            return { name, goals: extracted.goals };
          }}
          onSave={saveChain}
          onCancel={() => setAction(null)}
        />
      ) : (
        <NameConfirmBox
          key={action}
          label={action === "addVision" ? "New vision" : "New goal (added to the end of the chain)"}
          loadSuggestion={() => suggestName(action === "addVision" ? "vision" : "goal")}
          onSave={action === "addVision" ? saveVision : saveGoal}
          onCancel={() => setAction(null)}
        />
      )}

      {notice && <div className="ai-chat-notice">{notice}</div>}

      <div className="ai-chat-input-row">
        <textarea
          className="neon-textarea ai-chat-input"
          rows={2}
          value={input}
          placeholder="Reply…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        {isStreaming ? (
          <button
            type="button"
            className="neon-btn neon-btn-sm"
            onClick={() => abortRef.current?.abort()}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="neon-btn neon-btn-primary neon-btn-sm"
            onClick={send}
            disabled={!input.trim()}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
