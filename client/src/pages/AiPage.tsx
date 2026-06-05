import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { buildGoalBreakdownPrompt, buildVisionBreakdownPrompt } from "../domain/ai-prompts";

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
  onGenerate,
  prompt,
  copied,
  onCopy,
}: {
  sectionId: string;
  title: string;
  description: string;
  primaryLabel: string;
  primaryPlaceholder: string;
  secondaryLabel: string;
  secondaryPlaceholder: string;
  generateLabel: string;
  onGenerate: (primary: string, secondary: string) => void;
  prompt: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");

  return (
    <section className="ai-section neon-card">
      <h3 className="ai-section-title">{title}</h3>
      <p className="ai-section-desc">{description}</p>

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

      <button
        type="button"
        className="neon-btn neon-btn-primary"
        style={{ width: "100%" }}
        onClick={() => onGenerate(primary, secondary)}
      >
        {generateLabel}
      </button>

      <PromptOutput prompt={prompt} onCopy={onCopy} copied={copied} />
    </section>
  );
}

export function AiPage() {
  const [visionPrompt, setVisionPrompt] = useState<string | null>(null);
  const [goalPrompt, setGoalPrompt] = useState<string | null>(null);
  const [visionCopied, setVisionCopied] = useState(false);
  const [goalCopied, setGoalCopied] = useState(false);

  async function copyText(text: string, setCopied: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <PageHeader title="AI" />

      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
        Fill in your answers, generate a prompt, and paste it into your favorite AI assistant.
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
          onGenerate={(vision, progress) => {
            setVisionPrompt(buildVisionBreakdownPrompt(vision, progress));
            setVisionCopied(false);
          }}
          prompt={visionPrompt}
          copied={visionCopied}
          onCopy={() => visionPrompt && copyText(visionPrompt, setVisionCopied)}
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
          onGenerate={(goal, progress) => {
            setGoalPrompt(buildGoalBreakdownPrompt(goal, progress));
            setGoalCopied(false);
          }}
          prompt={goalPrompt}
          copied={goalCopied}
          onCopy={() => goalPrompt && copyText(goalPrompt, setGoalCopied)}
        />
      </div>
    </>
  );
}
