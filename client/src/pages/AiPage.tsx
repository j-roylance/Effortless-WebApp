import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { AiChatPanel, loadAiChat, startAiChat } from "../components/AiChatPanel";
import { buildGoalBreakdownPrompt, buildVisionBreakdownPrompt } from "../domain/ai-prompts";

interface AiStatus {
  enabled: boolean;
  model: string | null;
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
  const [chatOpen, setChatOpen] = useState(() => loadAiChat(sectionId).length > 0);
  const [chatSession, setChatSession] = useState(0);

  function generatePrompt() {
    setPrompt(buildPrompt(primary, secondary));
    setCopied(false);
  }

  function startChat() {
    startAiChat(sectionId, buildPrompt(primary, secondary));
    setPrompt(null);
    setChatSession((n) => n + 1);
    setChatOpen(true);
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

  const showChat = aiEnabled && chatOpen;

  return (
    <section className="ai-section neon-card">
      <h3 className="ai-section-title">{title}</h3>
      <p className="ai-section-desc">{description}</p>

      {showChat ? (
        <AiChatPanel
          key={chatSession}
          storageKey={sectionId}
          introLabel={introLabel}
          onClose={() => setChatOpen(false)}
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
                onClick={startChat}
                disabled={!primary.trim()}
              >
                Start chat
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

          <PromptOutput prompt={prompt} onCopy={copyPrompt} copied={copied} />
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
