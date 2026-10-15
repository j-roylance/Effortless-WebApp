import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AiChat, AiChatSummary, VisionWithGoals } from "../api/types";
import { appendGoals, createVision, visionChainQuery } from "../api/vision-chain";
import { buildGoalBreakdownPrompt, buildVisionBreakdownPrompt } from "../domain/ai-prompts";
import { AiChatPanel, EditableTitle } from "./AiChatPanel";
import { ChainChecklist } from "./AiChainTools";

export interface AiStatus {
  enabled: boolean;
  model: string | null;
}

/** What the panel is about: nothing yet (Visions list), a vision, or a sub-goal level of a vision. */
export interface AiTarget {
  visionId: string | null;
  goalId: string | null;
}

interface AiPanelState {
  open: boolean;
  chatId: string | null;
}

interface AiPanelContextValue extends AiPanelState {
  openPanel: () => void;
  closePanel: () => void;
  setChatId: (id: string | null) => void;
}

const STORAGE_KEY = "effortless:aiPanel";
const AiPanelContext = createContext<AiPanelContextValue | null>(null);

function readStoredState(): AiPanelState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiPanelState>;
      return { open: parsed.open === true, chatId: parsed.chatId ?? null };
    }
  } catch {
    // Storage unavailable or corrupt; start closed.
  }
  return { open: false, chatId: null };
}

export function AiPanelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AiPanelState>(readStoredState);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage unavailable (private mode); the panel just won't survive a refresh.
    }
  }, [state]);

  const value: AiPanelContextValue = {
    ...state,
    openPanel: () => setState((s) => ({ ...s, open: true })),
    closePanel: () => setState((s) => ({ ...s, open: false })),
    setChatId: (chatId) => setState((s) => ({ ...s, chatId })),
  };

  return <AiPanelContext.Provider value={value}>{children}</AiPanelContext.Provider>;
}

export function useAiPanel(): AiPanelContextValue {
  const ctx = useContext(AiPanelContext);
  if (!ctx) throw new Error("useAiPanel must be used inside AiPanelProvider");
  return ctx;
}

export function targetFromPath(pathname: string): AiTarget | null {
  if (pathname === "/visions") return { visionId: null, goalId: null };
  const nested = matchPath("/visions/:id/chain/:goalId", pathname);
  if (nested?.params.id && nested.params.goalId) {
    return { visionId: nested.params.id, goalId: nested.params.goalId };
  }
  const top = matchPath("/visions/:id/chain", pathname);
  if (top?.params.id && top.params.id !== "new") return { visionId: top.params.id, goalId: null };
  return null;
}

export function useAiStatus() {
  return useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api<AiStatus>("/ai/status"),
    staleTime: 5 * 60 * 1000,
  });
}

/** Vision chain data for a target (shared cache with VisionChainPage). */
export function useTargetChain(target: AiTarget) {
  return useQuery({
    ...visionChainQuery(target.visionId ?? "", target.goalId),
    enabled: !!target.visionId,
  });
}

function chainHeading(target: AiTarget, data: VisionWithGoals | undefined): string {
  if (!target.visionId) return "Plan a vision";
  if (target.goalId) return data?.focusGoal?.name ?? "Goal";
  return data?.vision.name ?? "Vision";
}

/** Bottom sheet chat for the Visions list and chain pages; follows the current route. */
export function AiPanel() {
  const { open, chatId, closePanel, setChatId } = useAiPanel();
  const location = useLocation();
  const queryClient = useQueryClient();
  const target = targetFromPath(location.pathname);
  const targetKey = target ? `${target.visionId}:${target.goalId}` : null;
  const prevTargetKey = useRef(targetKey);

  useEffect(() => {
    if (prevTargetKey.current === targetKey) return;
    prevTargetKey.current = targetKey;
    if (!target) {
      closePanel();
      return;
    }
    if (chatId) {
      const cached = queryClient.getQueryData<{ chat: AiChat }>(["ai-chat", chatId]);
      const followsChat =
        cached?.chat.visionId === target.visionId && cached?.chat.goalId === target.goalId;
      if (!followsChat) setChatId(null);
    }
    // Only react to route changes; the chat stays open when it moved with the user (Add Vision).
  }, [targetKey]);

  if (!open || !target) return null;
  return <AiPanelSheet target={target} />;
}

function AiPanelSheet({ target }: { target: AiTarget }) {
  const { chatId, closePanel, setChatId } = useAiPanel();
  const { data: status } = useAiStatus();
  const { data: chain } = useTargetChain(target);
  const aiEnabled = status?.enabled ?? false;
  const kind = target.goalId ? "goal" : "vision";

  return (
    <section className="ai-sheet" role="dialog" aria-label="AI chat">
      <header className="ai-sheet-header">
        <span className="ai-sheet-title">AI · {chainHeading(target, chain)}</span>
        <button type="button" className="neon-btn neon-btn-sm" onClick={closePanel}>
          Close
        </button>
      </header>

      <div className="ai-sheet-body">
        {chatId && aiEnabled ? (
          <AiChatPanel
            key={chatId}
            chatId={chatId}
            introLabel={kind === "vision" ? "Your vision and progress" : "Your goal and progress"}
            onClose={() => setChatId(null)}
          />
        ) : (
          <>
            <NewChatForm
              key={`${target.visionId}:${target.goalId}`}
              target={target}
              chain={chain}
              aiEnabled={aiEnabled}
            />
            {aiEnabled && <SavedChatList target={target} onOpen={setChatId} />}
          </>
        )}
      </div>
    </section>
  );
}

function defaultChatTitle(text: string): string {
  const firstLine = text.trim().split("\n")[0]!.trim();
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
}

function PromptOutput({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="ai-prompt-output neon-card">
      <div className="ai-prompt-output-header">
        <h4 className="ai-prompt-output-title">Generated prompt</h4>
        <button type="button" className="neon-btn neon-btn-sm" onClick={() => void copy()}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="ai-prompt-text">{prompt}</pre>
    </div>
  );
}

function NewChatForm({
  target,
  chain,
  aiEnabled,
}: {
  target: AiTarget;
  chain: VisionWithGoals | undefined;
  aiEnabled: boolean;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { closePanel, setChatId } = useAiPanel();
  const kind = target.goalId ? "goal" : "vision";
  const topName = target.goalId ? chain?.focusGoal?.name : chain?.vision.name;
  const existingGoals = (chain?.goals ?? []).map((g) => g.name);

  const [primary, setPrimary] = useState(topName ?? "");
  const [secondary, setSecondary] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    if (topName) setPrimary((current) => current || topName);
  }, [topName]);

  function buildPrompt(): string {
    return kind === "vision"
      ? buildVisionBreakdownPrompt(primary, secondary, existingGoals)
      : buildGoalBreakdownPrompt(primary, secondary, existingGoals);
  }

  async function startChat() {
    setStarting(true);
    setError(null);
    try {
      const { chat } = await api<{ chat: AiChat }>("/ai/chats", {
        method: "POST",
        body: JSON.stringify({
          kind,
          title: defaultChatTitle(primary),
          messages: [{ role: "user", content: buildPrompt() }],
          visionId: target.visionId,
          goalId: target.goalId,
        }),
      });
      queryClient.setQueryData(["ai-chat", chat.id], { chat });
      void queryClient.invalidateQueries({ queryKey: ["ai-chats"] });
      setChatId(chat.id);
    } catch (err) {
      setError((err as Error).message || "Could not start chat");
    } finally {
      setStarting(false);
    }
  }

  async function saveDraft(name: string | null, goals: string[]) {
    if (!target.visionId) {
      const vision = await createVision(name!);
      await appendGoals(vision.id, null, goals);
      void queryClient.invalidateQueries({ queryKey: ["visions"] });
      closePanel();
      navigate(`/visions/${vision.id}/chain`);
      return;
    }
    await appendGoals(target.visionId, target.goalId, goals);
    void queryClient.invalidateQueries({ queryKey: ["vision-goals", target.visionId] });
    closePanel();
  }

  if (drafting) {
    return (
      <ChainChecklist
        title="Quick draft"
        existingNames={existingGoals}
        nameLabel={target.visionId ? undefined : "Vision name"}
        load={() =>
          api<{ name: string | null; goals: string[] }>("/ai/draft-chain", {
            method: "POST",
            body: JSON.stringify({
              target: kind,
              text: primary,
              progress: secondary,
              existingGoals,
            }),
          })
        }
        onSave={saveDraft}
        onCancel={() => setDrafting(false)}
      />
    );
  }

  const primaryLabel = kind === "vision" ? "Your vision" : "Goal that feels too big";

  return (
    <div className="ai-new-chat">
      <div className="form-field">
        <label htmlFor="ai-primary">{primaryLabel}</label>
        <textarea
          id="ai-primary"
          className="neon-textarea"
          rows={4}
          value={primary}
          placeholder={
            kind === "vision"
              ? "Describe your vision in as much detail as you have — what life looks like when it is realized…"
              : "The goal you want to break down…"
          }
          onChange={(e) => setPrimary(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="ai-secondary">What you have done so far</label>
        <textarea
          id="ai-secondary"
          className="neon-textarea"
          rows={3}
          value={secondary}
          placeholder="Everything you have already done toward this…"
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
          <button
            type="button"
            className="neon-btn"
            onClick={() => setDrafting(true)}
            disabled={!primary.trim()}
          >
            Quick draft
          </button>
          <button type="button" className="ai-chat-link-btn" onClick={() => setPrompt(buildPrompt())}>
            Copy prompt instead
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="neon-btn neon-btn-primary"
          style={{ width: "100%" }}
          onClick={() => setPrompt(buildPrompt())}
        >
          Generate prompt
        </button>
      )}

      {error && <div className="ai-chat-error">{error}</div>}
      {prompt && <PromptOutput prompt={prompt} />}
    </div>
  );
}

function chatListQuery(target: AiTarget): { key: string; path: string } {
  if (target.goalId) return { key: `goal:${target.goalId}`, path: `goalId=${target.goalId}` };
  if (target.visionId) {
    return { key: `vision:${target.visionId}`, path: `visionId=${target.visionId}` };
  }
  return { key: "unlinked", path: "unlinked=1" };
}

function SavedChatList({ target, onOpen }: { target: AiTarget; onOpen: (id: string) => void }) {
  const queryClient = useQueryClient();
  const { key, path } = chatListQuery(target);
  const { data } = useQuery({
    queryKey: ["ai-chats", key],
    queryFn: () => api<{ chats: AiChatSummary[] }>(`/ai/chats?${path}`),
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
      <h4 className="ai-saved-chats-title">
        {target.visionId ? "Saved chats" : "Chats not yet attached to a vision"}
      </h4>
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
