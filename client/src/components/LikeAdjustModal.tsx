import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { UserLike } from "../api/types";
import { TIER_COLORS } from "../domain/tiers";
import type { RewardTier } from "../domain/tiers";

type LikeCounts = { usedCount: number; availableCount: number };

function parseNonNegativeInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

export function LikeAdjustModal({
  tier,
  tierLikes,
  onClose,
}: {
  tier: RewardTier;
  tierLikes: UserLike[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const originalById = useMemo(
    () =>
      Object.fromEntries(
        tierLikes.map((like) => [
          like.id,
          { usedCount: like.usedCount, availableCount: like.availableCount },
        ])
      ) as Record<string, LikeCounts>,
    [tierLikes]
  );

  const [draftById, setDraftById] = useState<Record<string, LikeCounts>>(() => ({
    ...originalById,
  }));

  const changedLikes = useMemo(
    () =>
      tierLikes.filter((like) => {
        const original = originalById[like.id];
        const draft = draftById[like.id];
        if (!original || !draft) return false;
        return (
          draft.usedCount !== original.usedCount ||
          draft.availableCount !== original.availableCount
        );
      }),
    [tierLikes, originalById, draftById]
  );

  const hasChanges = changedLikes.length > 0;

  function setCount(likeId: string, field: keyof LikeCounts, raw: string) {
    const next = parseNonNegativeInt(raw);
    setDraftById((prev) => ({
      ...prev,
      [likeId]: { ...prev[likeId]!, [field]: next },
    }));
  }

  const applyMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        changedLikes.map((like) => {
          const draft = draftById[like.id]!;
          return api<{ usedCount: number; availableCount: number }>(
            `/likes/${like.id}/credits`,
            {
              method: "PATCH",
              body: JSON.stringify({
                usedCount: draft.usedCount,
                availableCount: draft.availableCount,
              }),
            }
          );
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["likes"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      api("/likes/reset-tier", {
        method: "POST",
        body: JSON.stringify({ tier }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["likes"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleResetAll() {
    if (
      confirm(
        `Reset all active ${tier} like credits? This voids every earned credit in this tier.`
      )
    ) {
      setError("");
      resetMutation.mutate();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal neon-card like-convert-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="like-adjust-title"
      >
        <h2
          id="like-adjust-title"
          style={{ marginTop: 0, color: TIER_COLORS[tier] }}
        >
          Adjust {tier} credits
        </h2>

        <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
          Set used (U) and available (A) per like. Earned (E) is U + A.
        </p>

        {tierLikes.length === 0 ? (
          <p className="form-error">No {tier} likes to adjust.</p>
        ) : (
          <ul className="like-convert-list">
            {tierLikes.map((like) => {
              const draft = draftById[like.id] ?? {
                usedCount: like.usedCount,
                availableCount: like.availableCount,
              };
              const earned = draft.usedCount + draft.availableCount;

              return (
                <li key={like.id} className="like-convert-item like-adjust-item">
                  <span className="like-convert-label">{like.label}</span>
                  <div className="like-adjust-fields">
                    <label className="like-adjust-field">
                      <span className="like-adjust-field-label">U</span>
                      <input
                        type="number"
                        min={0}
                        className="neon-input like-adjust-input"
                        value={draft.usedCount}
                        onChange={(e) => setCount(like.id, "usedCount", e.target.value)}
                      />
                    </label>
                    <label className="like-adjust-field">
                      <span className="like-adjust-field-label">A</span>
                      <input
                        type="number"
                        min={0}
                        className="neon-input like-adjust-input"
                        value={draft.availableCount}
                        onChange={(e) =>
                          setCount(like.id, "availableCount", e.target.value)
                        }
                      />
                    </label>
                    <span className="like-adjust-earned" title="Earned (U + A)">
                      E {earned}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="like-convert-actions">
          <button
            type="button"
            className="neon-btn neon-btn-primary"
            disabled={!hasChanges || applyMutation.isPending || resetMutation.isPending}
            onClick={() => {
              setError("");
              applyMutation.mutate();
            }}
          >
            {applyMutation.isPending ? "Applying…" : "Apply changes"}
          </button>
          <button
            type="button"
            className="neon-btn"
            disabled={applyMutation.isPending || resetMutation.isPending}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>

        <div className="like-adjust-footer">
          <button
            type="button"
            className="neon-btn neon-btn-sm like-adjust-reset-btn"
            disabled={applyMutation.isPending || resetMutation.isPending}
            onClick={handleResetAll}
          >
            {resetMutation.isPending ? "Resetting…" : `Reset all ${tier} credits`}
          </button>
        </div>
      </div>
    </div>
  );
}
