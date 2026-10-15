import { useEffect, useRef, useState } from "react";
import { apiStream } from "../api/client";

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_MESSAGES = 40;
const STORAGE_PREFIX = "effortless:aiChat:";

export function loadAiChat(storageKey: string): AiChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + storageKey);
    const parsed = raw ? (JSON.parse(raw) as AiChatMessage[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAiChat(storageKey: string, messages: AiChatMessage[]) {
  if (messages.length === 0) {
    sessionStorage.removeItem(STORAGE_PREFIX + storageKey);
  } else {
    sessionStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(messages));
  }
}

export function startAiChat(storageKey: string, prompt: string) {
  saveAiChat(storageKey, [{ role: "user", content: prompt }]);
}

/** Keeps the opening prompt so the model never loses the task, then the most recent turns. */
function trimForRequest(messages: AiChatMessage[]): AiChatMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  return [messages[0]!, ...messages.slice(-(MAX_MESSAGES - 1))];
}

export function AiChatPanel({
  storageKey,
  introLabel,
  onClose,
}: {
  storageKey: string;
  introLabel: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<AiChatMessage[]>(() => loadAiChat(storageKey));
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isStreaming = streamingText !== null;

  useEffect(() => {
    saveAiChat(storageKey, messages);
  }, [storageKey, messages]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText]);

  useEffect(() => () => abortRef.current?.abort(), []);

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
          setMessages([...history, { role: "assistant", content: reply }]);
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
    void requestReply(next);
  }

  function retry() {
    if (isStreaming || messages.length === 0) return;
    const last = messages[messages.length - 1]!;
    const history = last.role === "assistant" ? messages.slice(0, -1) : messages;
    setMessages(history);
    void requestReply(history);
  }

  function startOver() {
    if (messages.length > 1 && !confirm("Clear this conversation and start over?")) return;
    abortRef.current?.abort();
    setMessages([]);
    saveAiChat(storageKey, []);
    onClose();
  }

  const [intro, ...turns] = messages;

  return (
    <div className="ai-chat neon-card">
      <div className="ai-chat-list" ref={listRef}>
        {intro && (
          <details className="ai-chat-intro">
            <summary>{introLabel}</summary>
            <pre className="ai-prompt-text">{intro.content}</pre>
          </details>
        )}
        {turns.map((message, index) => (
          <div key={index} className={`ai-chat-bubble ai-chat-bubble--${message.role}`}>
            {message.content}
          </div>
        ))}
        {isStreaming && (
          <div className="ai-chat-bubble ai-chat-bubble--assistant">
            {streamingText || <span className="ai-chat-typing">Thinking…</span>}
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

      <div className="ai-chat-footer">
        <button type="button" className="neon-btn neon-btn-sm" onClick={startOver}>
          Start over
        </button>
      </div>
    </div>
  );
}
