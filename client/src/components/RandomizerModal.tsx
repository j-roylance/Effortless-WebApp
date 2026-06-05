import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { SpinResult } from "../api/types";
import {
  OUTCOME_LABELS,
  TIER_COLORS,
  type RewardTier,
  type SpinOutcome,
} from "../domain/tiers";
import { SpinnerWheel } from "./SpinnerWheel";

type Phase = "idle" | "outcome" | "spinning" | "done";

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

  const spinMutation = useMutation({
    mutationFn: () =>
      api<SpinResult>("/spin", {
        method: "POST",
        body: JSON.stringify({ tokenTier }),
      }),
    onSuccess: (data) => {
      setResult(data);
      setPhase("outcome");
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      setTimeout(() => {
        const needsSpinner =
          (data.outcome === "Win" || data.outcome === "LevelUp") &&
          data.spinnerLikes.length > 0;
        if (needsSpinner) {
          setPhase("spinning");
        } else {
          setPhase("done");
        }
      }, 1500);
    },
  });

  const outcome = result?.outcome;
  const showSpinner =
    phase === "spinning" && result && result.spinnerLikes.length > 0;

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
            <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
              25% win · 25% level up · 25% nothing · 25% step down
            </p>
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

        {outcome && phase !== "idle" && (
          <div className="outcome-flash" style={{ borderColor: TIER_COLORS[result!.effectiveTier] }}>
            {OUTCOME_LABELS[outcome as SpinOutcome]}
            {result!.newTokenFromLevelUp && (
              <p style={{ fontSize: "0.85rem", margin: "0.5rem 0 0" }}>
                +1 {result!.effectiveTier} token earned!
              </p>
            )}
          </div>
        )}

        {showSpinner && result && (
          <SpinnerWheel
            slices={result.spinnerLikes}
            winningIndex={result.winningIndex}
            tier={result.effectiveTier}
            spinning={phase === "spinning"}
            onSpinEnd={() => setPhase("done")}
          />
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

        {(phase === "outcome" || phase === "spinning") && !showSpinner && (
          <p style={{ textAlign: "center", color: "var(--text-dim)" }}>Processing…</p>
        )}
      </div>
    </div>
  );
}
