import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { UserLike } from "../api/types";
import type { TierWheelConfig } from "../domain/wheel";
import { totalWheelSlices } from "../domain/wheel";
import { TIER_COLORS, type RewardTier } from "../domain/tiers";

export function WheelConfigModal({
  tier,
  likes,
  onClose,
}: {
  tier: RewardTier;
  likes: UserLike[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [multiplier, setMultiplier] = useState(1);
  const [sliceCounts, setSliceCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["wheel-config", tier],
    queryFn: () => api<TierWheelConfig>(`/wheel-config/${tier}`),
  });

  useEffect(() => {
    if (data) {
      setMultiplier(data.multiplier);
      setSliceCounts(data.sliceCounts);
    }
  }, [data]);

  const totalSlices = useMemo(
    () => totalWheelSlices(likes.length, multiplier),
    [likes.length, multiplier]
  );

  const assignedSlices = useMemo(
    () => likes.reduce((sum, like) => sum + (sliceCounts[like.id] ?? 0), 0),
    [likes, sliceCounts]
  );

  const emptySlices = totalSlices - assignedSlices;
  const atCap = assignedSlices >= totalSlices;

  useEffect(() => {
    if (assignedSlices <= totalSlices) return;
    setSliceCounts((prev) => {
      const next = { ...prev };
      let over = assignedSlices - totalSlices;
      for (let i = likes.length - 1; i >= 0 && over > 0; i--) {
        const like = likes[i]!;
        const current = next[like.id] ?? 0;
        const reduce = Math.min(current, over);
        next[like.id] = current - reduce;
        over -= reduce;
      }
      return next;
    });
  }, [assignedSlices, totalSlices, likes]);

  function setSliceCount(likeId: string, next: number) {
    const current = sliceCounts[likeId] ?? 0;
    const others = assignedSlices - current;
    const maxForLike = Math.max(0, totalSlices - others);
    const clamped = Math.max(0, Math.min(next, maxForLike));
    setSliceCounts((prev) => ({ ...prev, [likeId]: clamped }));
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api<TierWheelConfig>(`/wheel-config/${tier}`, {
        method: "PUT",
        body: JSON.stringify({ multiplier, sliceCounts }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wheel-config", tier] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal neon-card wheel-config-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="wheel-config-title"
      >
        <h2 id="wheel-config-title" style={{ marginTop: 0, color: TIER_COLORS[tier] }}>
          {tier} wheel odds
        </h2>

        <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
          Divide the wheel into slices and assign how many go to each like. Unassigned slices
          land empty (no reward).
        </p>

        {likes.length === 0 ? (
          <p className="form-error">Add at least one like in this tier first.</p>
        ) : (
          <>
            {isLoading && (
              <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</p>
            )}

            <div className="wheel-config-row">
              <span className="schedule-sub-label">Wheel size</span>
              <div className="wheel-multiplier-controls">
                <button
                  type="button"
                  className="neon-btn neon-btn-sm"
                  disabled={multiplier <= 1}
                  onClick={() => setMultiplier((m) => Math.max(1, m - 1))}
                >
                  −
                </button>
                <span className="wheel-multiplier-value">
                  {likes.length} × {multiplier} = {totalSlices} slices
                </span>
                <button
                  type="button"
                  className="neon-btn neon-btn-sm"
                  disabled={multiplier >= 12}
                  onClick={() => setMultiplier((m) => m + 1)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="wheel-slice-summary">
              <span>{assignedSlices} assigned</span>
              <span>{emptySlices} empty</span>
              <span>{totalSlices} total</span>
            </div>

            <ul className="wheel-assign-list">
              {likes.map((like) => {
                const count = sliceCounts[like.id] ?? 0;
                return (
                  <li key={like.id} className="wheel-assign-item">
                    <span className="wheel-assign-label">{like.label}</span>
                    <div className="wheel-assign-controls">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Fewer slices for ${like.label}`}
                        disabled={count <= 0}
                        onClick={() => setSliceCount(like.id, count - 1)}
                      >
                        −
                      </button>
                      <span className="wheel-assign-count">{count}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`More slices for ${like.label}`}
                        disabled={atCap}
                        onClick={() => setSliceCount(like.id, count + 1)}
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {atCap && (
              <p className="schedule-hint">Slice cap reached. Lower a count to add elsewhere.</p>
            )}
          </>
        )}

        {error && <p className="form-error">{error}</p>}

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button
            type="button"
            className="neon-btn neon-btn-primary"
            disabled={likes.length === 0 || saveMutation.isPending}
            onClick={() => {
              setError("");
              saveMutation.mutate();
            }}
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
          <button type="button" className="neon-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
