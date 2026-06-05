import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { TokenBalances, UserLike } from "../api/types";
import {
  TIERS,
  TIER_COLORS,
  TIER_FREQUENCY_LABEL,
  type RewardTier,
} from "../domain/tiers";
import { RandomizerModal } from "../components/RandomizerModal";
import { WheelConfigModal } from "../components/WheelConfigModal";

export function LikesPage() {
  const queryClient = useQueryClient();
  const [spinTier, setSpinTier] = useState<RewardTier | null>(null);
  const [wheelEditTier, setWheelEditTier] = useState<RewardTier | null>(null);
  const [newLabels, setNewLabels] = useState<Record<RewardTier, string>>(
    () => Object.fromEntries(TIERS.map((t) => [t, ""])) as Record<RewardTier, string>
  );

  const { data: likesData } = useQuery({
    queryKey: ["likes"],
    queryFn: () => api<{ likes: UserLike[] }>("/likes"),
  });

  const { data: tokenData } = useQuery({
    queryKey: ["tokens"],
    queryFn: () => api<TokenBalances>("/tokens"),
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
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/likes/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["likes"] }),
  });

  const likesByTier = TIERS.reduce(
    (acc, tier) => {
      acc[tier] = (likesData?.likes ?? []).filter((r) => r.tier === tier);
      return acc;
    },
    {} as Record<RewardTier, UserLike[]>
  );

  const balances = tokenData?.balances;
  const schedule = tokenData?.schedule;

  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: "0.85rem" }}>Likes</h2>
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
        Things you enjoy at each tier. Spend tokens to spin and maybe win one.
      </p>

      {TIERS.map((tier) => {
        const likes = likesByTier[tier];
        const tokenCount = balances?.[tier] ?? 0;
        const canClaim = schedule?.[tier]?.canClaim ?? true;
        const canSpin = tokenCount > 0 && canClaim;

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
              <button
                type="button"
                className="neon-btn neon-btn-sm"
                disabled={!canSpin}
                onClick={() => setSpinTier(tier)}
                title={
                  !canClaim
                    ? "Schedule cap reached for this tier"
                    : tokenCount === 0
                      ? "No tokens"
                      : `Spend ${tier} token`
                }
              >
                Spin ({tokenCount})
              </button>
            </div>
            <p className="like-freq">{TIER_FREQUENCY_LABEL[tier]}</p>
            {schedule && (
              <p className="like-freq" style={{ marginTop: "-0.25rem" }}>
                Claims: {schedule[tier].claimCount} / {schedule[tier].limit}
              </p>
            )}

            <ul className="like-list">
              {likes.map((item) => (
                <li key={item.id} className="like-item">
                  <span>{item.label}</span>
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
              {likes.length === 0 && (
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
    </>
  );
}
