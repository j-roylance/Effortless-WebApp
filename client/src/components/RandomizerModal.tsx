import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { SpinResult } from "../api/types";
import { DEFAULT_DAILY_SETTINGS, type DailySettings } from "../domain/daily";
import { formatSpinOddsSummary } from "../domain/spin-odds";
import { OUTCOME_REVEAL_MS, spinNeedsLikeWheel } from "../domain/spin";
import {
  OUTCOME_LABELS,
  TIER_COLORS,
  type RewardTier,
  type SpinOutcome,
} from "../domain/tiers";
import { OutcomeRoll } from "./OutcomeRoll";
import { SpinnerWheel } from "./SpinnerWheel";

/**
 * Spin flow (client animation only; outcome is decided on the server):
 * idle → outcomeRoll → outcomeReveal → [spinning] → done
 */
type Phase = "idle" | "outcomeRoll" | "outcomeReveal" | "spinning" | "done";

function SkipAnimationButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="skip-animation-btn" onClick={onClick}>
      Skip
    </button>
  );
}

export function RandomizerModal({
  tokenTier,
  onClose,
}: {
  tokenTier: RewardTier;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<SpinResult | null>(null);
  const [skipOutcomeRoll, setSkipOutcomeRoll] = useState(false);
  const [skipWheel, setSkipWheel] = useState(false);

  const revealTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  const { data: settings } = useQuery({
    queryKey: ["daily-settings"],
    queryFn: () => api<DailySettings>("/daily-settings"),
  });
  const oddsSummary = formatSpinOddsSummary(
    settings?.spinOutcomeWeights ?? DEFAULT_DAILY_SETTINGS.spinOutcomeWeights
  );

  const advanceFromReveal = useCallback((data: SpinResult, skipped: boolean) => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    const delay = skipped ? 0 : OUTCOME_REVEAL_MS;

    revealTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      if (spinNeedsLikeWheel(data)) {
        setSkipWheel(false);
        setPhase("spinning");
      } else {
        setPhase("done");
      }
    }, delay);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  const spinMutation = useMutation({
    mutationFn: () =>
      api<SpinResult>("/spin", {
        method: "POST",
        body: JSON.stringify({ tokenTier }),
      }),
    onSuccess: (data) => {
      setResult(data);
      setSkipOutcomeRoll(false);
      setSkipWheel(false);
      setPhase("outcomeRoll");
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      queryClient.invalidateQueries({ queryKey: ["likes"] });
    },
  });

  function handleOutcomeRollComplete(skipped = false) {
    if (!result) return;
    setPhase("outcomeReveal");
    advanceFromReveal(result, skipped);
  }

  const outcome = result?.outcome;
  const showWheel = phase === "spinning" && result && result.spinnerLikes.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal neon-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="randomizer-title"
      >
        <h2 id="randomizer-title" style={{ marginTop: 0, color: TIER_COLORS[tokenTier] }}>
          {tokenTier} Token
        </h2>

        {phase === "idle" && (
          <>
            <p style={{ color: "var(--text-dim)" }}>
              Spend 1 {tokenTier} token to spin for a like at this tier.
            </p>
            <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>{oddsSummary}</p>
            {spinMutation.isError && (
              <p className="form-error">{(spinMutation.error as Error).message}</p>
            )}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
              <button
                type="button"
                className="neon-btn neon-btn-primary"
                onClick={() => spinMutation.mutate()}
                disabled={spinMutation.isPending}
              >
                {spinMutation.isPending ? "Rolling…" : "Spin"}
              </button>
              <button type="button" className="neon-btn" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {phase === "outcomeRoll" && result && (
          <>
            <OutcomeRoll
              finalOutcome={result.outcome as SpinOutcome}
              tierColor={TIER_COLORS[result.effectiveTier]}
              skip={skipOutcomeRoll}
              onComplete={handleOutcomeRollComplete}
            />
            <SkipAnimationButton onClick={() => setSkipOutcomeRoll(true)} />
          </>
        )}

        {phase === "outcomeReveal" && outcome && result && (
          <div
            className="outcome-flash outcome-flash--reveal"
            style={{ borderColor: TIER_COLORS[result.effectiveTier] }}
          >
            {OUTCOME_LABELS[outcome as SpinOutcome]}
          </div>
        )}

        {showWheel && result && (
          <>
            <SpinnerWheel
              slices={result.spinnerLikes}
              winningIndex={result.winningIndex}
              tier={result.effectiveTier}
              spinning
              skip={skipWheel}
              onSpinEnd={() => setPhase("done")}
            />
            <SkipAnimationButton onClick={() => setSkipWheel(true)} />
          </>
        )}

        {phase === "done" && result && (
          <div style={{ textAlign: "center" }}>
            {result.like ? (
              <>
                <p style={{ color: "var(--success)", fontFamily: "var(--font-display)" }}>
                  You get:
                </p>
                <p style={{ fontSize: "1.25rem" }}>{result.like.label}</p>
              </>
            ) : (
              <p style={{ color: "var(--text-dim)" }}>No like this time.</p>
            )}
            <button
              type="button"
              className="neon-btn neon-btn-primary"
              style={{ marginTop: "1rem" }}
              onClick={onClose}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
