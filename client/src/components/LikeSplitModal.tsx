import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { UserLike } from "../api/types";
import {
  conversionCount,
  lowerTierFor,
} from "../domain/like-conversions";
import { TIER_COLORS } from "../domain/tiers";

export function LikeSplitModal({
  sourceLike,
  lowerTierLikes,
  onClose,
}: {
  sourceLike: UserLike;
  lowerTierLikes: UserLike[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const lowerTier = lowerTierFor(sourceLike.tier);
  const yieldCount = conversionCount(sourceLike.tier);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  const assignedTotal = useMemo(
    () => lowerTierLikes.reduce((sum, like) => sum + (allocations[like.id] ?? 0), 0),
    [lowerTierLikes, allocations]
  );
  const remaining = yieldCount - assignedTotal;
  const canConfirm = lowerTierLikes.length > 0 && assignedTotal === yieldCount;

  function setCount(likeId: string, next: number) {
    const current = allocations[likeId] ?? 0;
    const others = assignedTotal - current;
    const maxForLike = Math.max(0, yieldCount - others);
    const clamped = Math.max(0, Math.min(next, maxForLike));
    setAllocations((prev) => ({ ...prev, [likeId]: clamped }));
  }

  const splitMutation = useMutation({
    mutationFn: () => {
      const payload = lowerTierLikes
        .map((like) => ({ likeId: like.id, count: allocations[like.id] ?? 0 }))
        .filter((entry) => entry.count > 0);
      return api(`/likes/${sourceLike.id}/split`, {
        method: "POST",
        body: JSON.stringify({ allocations: payload }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["likes"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal neon-card like-convert-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="like-split-title"
      >
        <h2
          id="like-split-title"
          style={{ marginTop: 0, color: TIER_COLORS[sourceLike.tier] }}
        >
          Split 1 {sourceLike.tier} → {yieldCount} {lowerTier}
        </h2>

        <p className="like-convert-source">
          From: <strong>{sourceLike.label}</strong> ({sourceLike.availableCount} available)
        </p>

        <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
          Distribute {yieldCount} {lowerTier} credits across your lower-tier likes.
        </p>

        {lowerTierLikes.length === 0 ? (
          <p className="form-error">Add at least one {lowerTier} like first.</p>
        ) : (
          <>
            <div className="like-convert-summary">
              <span>{assignedTotal} assigned</span>
              <span>{remaining} remaining</span>
              <span>{yieldCount} total</span>
            </div>

            <ul className="like-convert-list">
              {lowerTierLikes.map((like) => {
                const count = allocations[like.id] ?? 0;
                const atCap = assignedTotal >= yieldCount;
                return (
                  <li key={like.id} className="like-convert-item">
                    <span className="like-convert-label">{like.label}</span>
                    <div className="like-convert-controls">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Fewer for ${like.label}`}
                        disabled={count <= 0}
                        onClick={() => setCount(like.id, count - 1)}
                      >
                        −
                      </button>
                      <span className="like-convert-count">{count}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`More for ${like.label}`}
                        disabled={atCap}
                        onClick={() => setCount(like.id, count + 1)}
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="like-convert-actions">
          <button
            type="button"
            className="neon-btn neon-btn-primary"
            disabled={!canConfirm || splitMutation.isPending}
            onClick={() => {
              setError("");
              splitMutation.mutate();
            }}
          >
            {splitMutation.isPending ? "Splitting…" : "Split"}
          </button>
          <button type="button" className="neon-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
