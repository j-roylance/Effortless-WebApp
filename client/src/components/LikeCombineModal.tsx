import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { UserLike } from "../api/types";
import {
  conversionCount,
  lowerTierFor,
} from "../domain/like-conversions";
import { TIER_COLORS, type RewardTier } from "../domain/tiers";

export function LikeCombineModal({
  targetTier,
  targetTierLikes,
  lowerTierLikes,
  onClose,
}: {
  targetTier: RewardTier;
  targetTierLikes: UserLike[];
  lowerTierLikes: UserLike[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const lowerTier = lowerTierFor(targetTier);
  const cost = conversionCount(targetTier);
  const [targetLikeId, setTargetLikeId] = useState(targetTierLikes[0]?.id ?? "");
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  const assignedTotal = useMemo(
    () => lowerTierLikes.reduce((sum, like) => sum + (allocations[like.id] ?? 0), 0),
    [lowerTierLikes, allocations]
  );
  const remaining = cost - assignedTotal;
  const canConfirm =
    targetTierLikes.length > 0 &&
    lowerTierLikes.length > 0 &&
    targetLikeId &&
    assignedTotal === cost;

  function setCount(likeId: string, next: number) {
    const like = lowerTierLikes.find((l) => l.id === likeId);
    const current = allocations[likeId] ?? 0;
    const others = assignedTotal - current;
    const maxFromPool = Math.max(0, cost - others);
    const maxFromAvailable = like?.availableCount ?? 0;
    const maxForLike = Math.min(maxFromPool, maxFromAvailable);
    const clamped = Math.max(0, Math.min(next, maxForLike));
    setAllocations((prev) => ({ ...prev, [likeId]: clamped }));
  }

  const combineMutation = useMutation({
    mutationFn: () => {
      const payload = lowerTierLikes
        .map((like) => ({ likeId: like.id, count: allocations[like.id] ?? 0 }))
        .filter((entry) => entry.count > 0);
      return api("/likes/combine", {
        method: "POST",
        body: JSON.stringify({ targetLikeId, allocations: payload }),
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
        aria-labelledby="like-combine-title"
      >
        <h2
          id="like-combine-title"
          style={{ marginTop: 0, color: TIER_COLORS[targetTier] }}
        >
          Combine {cost} {lowerTier} → 1 {targetTier}
        </h2>

        <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
          Spend {lowerTier} credits to earn 1 {targetTier} credit on a like you choose.
        </p>

        {targetTierLikes.length === 0 ? (
          <p className="form-error">Add at least one {targetTier} like first.</p>
        ) : lowerTierLikes.length === 0 ? (
          <p className="form-error">Add at least one {lowerTier} like first.</p>
        ) : (
          <>
            <div className="like-convert-target">
              <span className="schedule-sub-label">Receive on</span>
              <select
                className="neon-input"
                value={targetLikeId}
                onChange={(e) => setTargetLikeId(e.target.value)}
              >
                {targetTierLikes.map((like) => (
                  <option key={like.id} value={like.id}>
                    {like.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="like-convert-summary">
              <span>{assignedTotal} assigned</span>
              <span>{remaining} remaining</span>
              <span>{cost} total</span>
            </div>

            <ul className="like-convert-list">
              {lowerTierLikes.map((like) => {
                const count = allocations[like.id] ?? 0;
                const atCap = assignedTotal >= cost;
                const maxForLike = Math.min(
                  like.availableCount,
                  cost - (assignedTotal - count)
                );
                return (
                  <li key={like.id} className="like-convert-item">
                    <span className="like-convert-label">
                      {like.label}
                      <span className="like-convert-available">
                        {like.availableCount} avail
                      </span>
                    </span>
                    <div className="like-convert-controls">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Spend fewer from ${like.label}`}
                        disabled={count <= 0}
                        onClick={() => setCount(like.id, count - 1)}
                      >
                        −
                      </button>
                      <span className="like-convert-count">{count}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Spend more from ${like.label}`}
                        disabled={atCap || count >= maxForLike}
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
            disabled={!canConfirm || combineMutation.isPending}
            onClick={() => {
              setError("");
              combineMutation.mutate();
            }}
          >
            {combineMutation.isPending ? "Combining…" : "Combine"}
          </button>
          <button type="button" className="neon-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
