import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { LikesResponse, UserLike } from "../api/types";
import {
  TIERS,
  TIER_COLORS,
  TIER_FREQUENCY_LABEL,
  type RewardTier,
} from "../domain/tiers";
import { LikeUsageStepper } from "../components/LikeUsageStepper";
import { PageHeader } from "../components/PageHeader";
import { QueryErrorBanner } from "../components/QueryErrorBanner";
import { Toast } from "../components/Toast";
import { RandomizerModal } from "../components/RandomizerModal";
import { WheelConfigModal } from "../components/WheelConfigModal";

export function LikesPage() {
  const queryClient = useQueryClient();
  const [spinTier, setSpinTier] = useState<RewardTier | null>(null);
  const [wheelEditTier, setWheelEditTier] = useState<RewardTier | null>(null);
  const [newLabels, setNewLabels] = useState<Record<RewardTier, string>>(
    () => Object.fromEntries(TIERS.map((t) => [t, ""])) as Record<RewardTier, string>
  );
  const [toast, setToast] = useState<string | null>(null);
  const [pendingUsedLikeId, setPendingUsedLikeId] = useState<string | null>(null);

  const {
    data: likesData,
    isError: likesError,
    refetch: refetchLikes,
  } = useQuery({
    queryKey: ["likes"],
    queryFn: () => api<LikesResponse>("/likes"),
  });

  const {
    data: tokenData,
    isError: tokensError,
    refetch: refetchTokens,
  } = useQuery({
    queryKey: ["tokens"],
    queryFn: () => api<import("../api/types").TokenBalances>("/tokens"),
  });

  const addMutation = useMutation({
    mutationFn: ({ tier, label }: { tier: RewardTier; label: string }) =>
      api("/likes", {
        method: "POST",
        body: JSON.stringify({ tier, label }),
      }),
    onSuccess: (_, { tier }) => {
      queryClient.invalidateQueries({ queryKey: ["likes"] });
      setNewLabels((prev) => ({ ...prev, [tier]: "" }));
    },
    onError: (err: Error) => setToast(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/likes/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["likes"] }),
    onError: (err: Error) => setToast(err.message),
  });

  const usedMutation = useMutation({
    mutationFn: ({ likeId, delta }: { likeId: string; delta: 1 | -1 }) =>
      api<{ usedCount: number }>(`/likes/${likeId}/used`, {
        method: "PATCH",
        body: JSON.stringify({ delta }),
      }),
    onMutate: ({ likeId }) => setPendingUsedLikeId(likeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["likes"] }),
    onError: (err: Error) => setToast(err.message),
    onSettled: () => setPendingUsedLikeId(null),
  });

  const resetTierMutation = useMutation({
    mutationFn: (tier: RewardTier) =>
      api("/likes/reset-tier", {
        method: "POST",
        body: JSON.stringify({ tier }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["likes"] }),
    onError: (err: Error) => setToast(err.message),
  });

  const likes = likesData?.likes ?? [];
  const likesByTier = TIERS.reduce(
    (acc, tier) => {
      acc[tier] = likes.filter((r) => r.tier === tier);
      return acc;
    },
    {} as Record<RewardTier, UserLike[]>
  );

  const balances = tokenData?.balances;
  const schedule = tokenData?.schedule;

  function handleResetTier(tier: RewardTier) {
    if (confirm(`Reset rewarded and used counts for all ${tier} likes this period?`)) {
      resetTierMutation.mutate(tier);
    }
  }

  return (
    <>
      <PageHeader title="Likes" />
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
        Things you enjoy at each tier. Spend tokens to spin and maybe win one.
      </p>
      <p className="like-tracking-legend">
        Per like: <strong>rewarded</strong> (earned) · <strong>used</strong> (− / +)
      </p>

      {(likesError || tokensError) && (
        <QueryErrorBanner
          onRetry={() => {
            if (likesError) void refetchLikes();
            if (tokensError) void refetchTokens();
          }}
        />
      )}

      {TIERS.map((tier) => {
        const tierLikes = likesByTier[tier];
        const tokenCount = balances?.[tier] ?? 0;
        const canClaim = schedule?.[tier]?.canClaim ?? true;
        const canSpin = tokenCount > 0;

        return (
          <section key={tier} className="like-section neon-card">
            <div className="like-section-header">
              <div className="like-tier-title-row">
                <h3
                  style={{
                    margin: 0,
                    fontSize: "0.8rem",
                    color: TIER_COLORS[tier],
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {tier}
                </h3>
                <button
                  type="button"
                  className="icon-btn wheel-edit-btn"
                  aria-label={`Edit ${tier} wheel odds`}
                  title="Edit wheel odds"
                  onClick={() => setWheelEditTier(tier)}
                >
                  ✎
                </button>
              </div>
              <div className="like-section-actions">
                <button
                  type="button"
                  className="neon-btn neon-btn-sm"
                  disabled={resetTierMutation.isPending}
                  onClick={() => handleResetTier(tier)}
                  title="Reset rewarded and used counts for this tier"
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="neon-btn neon-btn-sm"
                  disabled={!canSpin}
                  onClick={() => setSpinTier(tier)}
                  title={
                    tokenCount === 0
                      ? "No tokens"
                      : !canClaim
                        ? `Over cap (${schedule?.[tier]?.claimCount ?? 0}/${schedule?.[tier]?.limit ?? ""}) — spin anyway`
                        : `Spend ${tier} token`
                  }
                >
                  Spin ({tokenCount})
                </button>
              </div>
            </div>
            <p className="like-freq">{TIER_FREQUENCY_LABEL[tier]}</p>
            {schedule && (
              <p className="like-freq" style={{ marginTop: "-0.25rem" }}>
                Claims: {schedule[tier].claimCount} / {schedule[tier].limit}
              </p>
            )}

            <ul className="like-list">
              {tierLikes.map((item) => (
                <li key={item.id} className="like-item">
                  <span className="like-item-label">{item.label}</span>
                  <LikeUsageStepper
                    rewardedCount={item.rewardedCount}
                    usedCount={item.usedCount}
                    disabled={pendingUsedLikeId === item.id}
                    onDelta={(delta) => usedMutation.mutate({ likeId: item.id, delta })}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Remove like"
                    onClick={() => {
                      if (confirm("Remove this like?")) deleteMutation.mutate(item.id);
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
              {tierLikes.length === 0 && (
                <li style={{ color: "var(--text-dim)", fontSize: "0.85rem", listStyle: "none" }}>
                  No likes yet
                </li>
              )}
            </ul>

            <div className="add-like-row">
              <input
                className="neon-input"
                placeholder="Add something you like…"
                value={newLabels[tier]}
                onChange={(e) =>
                  setNewLabels((prev) => ({ ...prev, [tier]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const label = newLabels[tier].trim();
                    if (label) addMutation.mutate({ tier, label });
                  }
                }}
              />
              <button
                type="button"
                className="neon-btn neon-btn-sm"
                disabled={!newLabels[tier].trim() || addMutation.isPending}
                onClick={() => {
                  const label = newLabels[tier].trim();
                  if (label) addMutation.mutate({ tier, label });
                }}
              >
                +
              </button>
            </div>
          </section>
        );
      })}

      {spinTier && (
        <RandomizerModal tokenTier={spinTier} onClose={() => setSpinTier(null)} />
      )}

      {wheelEditTier && (
        <WheelConfigModal
          tier={wheelEditTier}
          likes={likesByTier[wheelEditTier]}
          onClose={() => setWheelEditTier(null)}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
