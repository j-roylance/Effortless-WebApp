import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AiChat, AiChatKind, AiChatSummary } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { AiChatPanel, EditableTitle } from "../components/AiChatPanel";
import { buildGoalBreakdownPrompt, buildVisionBreakdownPrompt } from "../domain/ai-prompts";

interface AiStatus {
  enabled: boolean;
  model: string | null;
}

const OPEN_CHAT_STORAGE_PREFIX = "effortless:aiOpenChat:";

function readOpenChatId(kind: AiChatKind): string | null {
  try {
    return sessionStorage.getItem(OPEN_CHAT_STORAGE_PREFIX + kind);
  } catch {
    return null;
  }
}

function writeOpenChatId(kind: AiChatKind, id: string | null) {
  try {
    if (id) sessionStorage.setItem(OPEN_CHAT_STORAGE_PREFIX + kind, id);
    else sessionStorage.removeItem(OPEN_CHAT_STORAGE_PREFIX + kind);
  } catch {
    // Storage unavailable (private mode); the open chat just won't survive a refresh.
  }
}

function defaultChatTitle(text: string): string {
  const firstLine = text.trim().split("\n")[0]!.trim();
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
}

function SavedChatList({
  kind,
  onOpen,
}: {
  kind: AiChatKind;
  onOpen: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["ai-chats", kind],
    queryFn: () => api<{ chats: AiChatSummary[] }>(`/ai/chats?kind=${kind}`),
  });
  const chats = data?.chats ?? [];
  if (chats.length === 0) return null;

  async function rename(id: string, title: string) {
    await api(`/ai/chats/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });
    void queryClient.invalidateQueries({ queryKey: ["ai-chats"] });
    void queryClient.invalidateQueries({ queryKey: ["ai-chat", id] });
  }

  async function remove(chat: AiChatSummary) {
    if (!confirm(`Delete "${chat.title}"? This can't be undone.`)) return;
    await api(`/ai/chats/${chat.id}`, { method: "DELETE" });
    queryClient.removeQueries({ queryKey: ["ai-chat", chat.id] });
    void queryClient.invalidateQueries({ queryKey: ["ai-chats"] });
  }

  return (
    <div className="ai-saved-chats">
      <h4 className="ai-saved-chats-title">Saved chats</h4>
      <ul className="ai-saved-chats-list">
        {chats.map((chat) => (
          <li key={chat.id} className="ai-saved-chat">
            <div className="ai-saved-chat-main">
              <EditableTitle title={chat.title} onSave={(title) => rename(chat.id, title)} />
              <span className="ai-saved-chat-date">
                {new Date(chat.updatedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>
            <div className="ai-saved-chat-actions">
              <button
                type="button"
                className="neon-btn neon-btn-primary neon-btn-sm"
                onClick={() => onOpen(chat.id)}
              >
                Open
              </button>
              <button
                type="button"
                className="neon-btn neon-btn-sm"
                onClick={() => void remove(chat)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PromptOutput({
  prompt,
  onCopy,
  copied,
}: {
  prompt: string | null;
  onCopy: () => void;
  copied: boolean;
}) {
  if (!prompt) return null;

  return (
    <div className="ai-prompt-output neon-card">
      <div className="ai-prompt-output-header">
        <h4 className="ai-prompt-output-title">Generated prompt</h4>
        <button type="button" className="neon-btn neon-btn-sm" onClick={onCopy}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="ai-prompt-text">{prompt}</pre>
    </div>
  );
}

function BreakdownSection({
  sectionId,
  kind,
  title,
  description,
  primaryLabel,
  primaryPlaceholder,
  secondaryLabel,
  secondaryPlaceholder,
  generateLabel,
  introLabel,
  buildPrompt,
  aiEnabled,
}: {
  sectionId: string;
  kind: AiChatKind;
  title: string;
  description: string;
  primaryLabel: string;
  primaryPlaceholder: string;
  secondaryLabel: string;
  secondaryPlaceholder: string;
  generateLabel: string;
  introLabel: string;
  buildPrompt: (primary: string, secondary: string) => string;
  aiEnabled: boolean;
}) {
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const [openChatId, setOpenChatIdState] = useState<string | null>(() => readOpenChatId(kind));
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  function setOpenChatId(id: string | null) {
    writeOpenChatId(kind, id);
    setOpenChatIdState(id);
  }

  function generatePrompt() {
    setPrompt(buildPrompt(primary, secondary));
    setCopied(false);
  }

  async function startChat() {
    setStarting(true);
    setStartError(null);
    try {
      const { chat } = await api<{ chat: AiChat }>("/ai/chats", {
        method: "POST",
        body: JSON.stringify({
          kind,
          title: defaultChatTitle(primary),
          messages: [{ role: "user", content: buildPrompt(primary, secondary) }],
        }),
      });
      queryClient.setQueryData(["ai-chat", chat.id], { chat });
      void queryClient.invalidateQueries({ queryKey: ["ai-chats"] });
      setPrompt(null);
      setOpenChatId(chat.id);
    } catch (err) {
      setStartError((err as Error).message || "Could not start chat");
    } finally {
      setStarting(false);
    }
  }

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const showChat = aiEnabled && openChatId !== null;

  return (
    <section className="ai-section neon-card">
      <h3 className="ai-section-title">{title}</h3>
      <p className="ai-section-desc">{description}</p>

      {showChat ? (
        <AiChatPanel
          key={openChatId}
          chatId={openChatId}
          introLabel={introLabel}
          onClose={() => setOpenChatId(null)}
        />
      ) : (
        <>
          <div className="form-field">
            <label htmlFor={`${sectionId}-primary`}>{primaryLabel}</label>
            <textarea
              id={`${sectionId}-primary`}
              className="neon-textarea"
              rows={5}
              value={primary}
              placeholder={primaryPlaceholder}
              onChange={(e) => setPrimary(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor={`${sectionId}-secondary`}>{secondaryLabel}</label>
            <textarea
              id={`${sectionId}-secondary`}
              className="neon-textarea"
              rows={4}
              value={secondary}
              placeholder={secondaryPlaceholder}
              onChange={(e) => setSecondary(e.target.value)}
            />
          </div>

          {aiEnabled ? (
            <div className="ai-section-actions">
              <button
                type="button"
                className="neon-btn neon-btn-primary"
                onClick={() => void startChat()}
                disabled={!primary.trim() || starting}
              >
                {starting ? "Starting…" : "Start chat"}
              </button>
              <button type="button" className="neon-btn" onClick={generatePrompt}>
                Copy prompt instead
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="neon-btn neon-btn-primary"
              style={{ width: "100%" }}
              onClick={generatePrompt}
            >
              {generateLabel}
            </button>
          )}

          {startError && <div className="ai-chat-error">{startError}</div>}

          <PromptOutput prompt={prompt} onCopy={copyPrompt} copied={copied} />

          {aiEnabled && <SavedChatList kind={kind} onOpen={setOpenChatId} />}
        </>
      )}
    </section>
  );
}

export function AiPage() {
  const { data: status } = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api<AiStatus>("/ai/status"),
    staleTime: 5 * 60 * 1000,
  });
  const aiEnabled = status?.enabled ?? false;

  return (
    <>
      <PageHeader title="AI" />

      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
        {aiEnabled
          ? "Fill in your answers and start a chat, or copy the prompt into your favorite AI assistant."
          : "Fill in your answers, generate a prompt, and paste it into your favorite AI assistant."}
      </p>

      <div className="ai-sections">
        <BreakdownSection
          sectionId="vision-breakdown"
          kind="vision"
          title="Vision breakdown"
          description="Break a life vision into a backward chain of goals — from the vision down to the first step you can take."
          primaryLabel="Your vision"
          primaryPlaceholder="Describe your vision in as much detail as you have — what life looks like when it is realized…"
          secondaryLabel="What you have done so far"
          secondaryPlaceholder="Everything you have already done toward this vision…"
          generateLabel="Generate vision prompt"
          introLabel="Your vision and progress"
          buildPrompt={buildVisionBreakdownPrompt}
          aiEnabled={aiEnabled}
        />

        <BreakdownSection
          sectionId="goal-breakdown"
          kind="goal"
          title="Goal breakdown"
          description="Break a goal that feels too big into smaller sub-goals through dialogue until they feel actionable."
          primaryLabel="Goal that feels too big"
          primaryPlaceholder="The goal you want to break down…"
          secondaryLabel="What you have done so far"
          secondaryPlaceholder="Everything you have already done toward this goal…"
          generateLabel="Generate goal prompt"
          introLabel="Your goal and progress"
          buildPrompt={buildGoalBreakdownPrompt}
          aiEnabled={aiEnabled}
        />
      </div>
    </>
  );
}
