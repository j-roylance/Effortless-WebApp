import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { TokenBalances, UserReward } from "../api/types";
import {
  TIERS,
  TIER_COLORS,
  TIER_FREQUENCY_LABEL,
  type RewardTier,
} from "../domain/tiers";
import { RandomizerModal } from "../components/RandomizerModal";

export function RewardsPage() {
  const queryClient = useQueryClient();
  const [spinTier, setSpinTier] = useState<RewardTier | null>(null);
  const [newLabels, setNewLabels] = useState<Record<RewardTier, string>>(
    () => Object.fromEntries(TIERS.map((t) => [t, ""])) as Record<RewardTier, string>
  );

  const { data: rewardsData } = useQuery({
    queryKey: ["rewards"],
    queryFn: () => api<{ rewards: UserReward[] }>("/rewards"),
  });

  const { data: tokenData } = useQuery({
    queryKey: ["tokens"],
    queryFn: () => api<TokenBalances>("/tokens"),
  });

  const addMutation = useMutation({
    mutationFn: ({ tier, label }: { tier: RewardTier; label: string }) =>
      api("/rewards", {
        method: "POST",
        body: JSON.stringify({ tier, label }),
      }),
    onSuccess: (_, { tier }) => {
      queryClient.invalidateQueries({ queryKey: ["rewards"] });
      setNewLabels((prev) => ({ ...prev, [tier]: "" }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/rewards/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rewards"] }),
  });

  const rewardsByTier = TIERS.reduce(
    (acc, tier) => {
      acc[tier] = (rewardsData?.rewards ?? []).filter((r) => r.tier === tier);
      return acc;
    },
    {} as Record<RewardTier, UserReward[]>
  );

  const balances = tokenData?.balances;
  const schedule = tokenData?.schedule;

  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: "0.85rem" }}>Rewards</h2>
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
        Add personal rewards per tier. Spend tokens to spin the randomizer.
      </p>

      {TIERS.map((tier) => {
        const rewards = rewardsByTier[tier];
        const tokenCount = balances?.[tier] ?? 0;
        const canClaim = schedule?.[tier]?.canClaim ?? true;
        const canSpin = tokenCount > 0 && canClaim;

        return (
          <section key={tier} className="reward-section neon-card">
            <div className="reward-section-header">
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
            <p className="reward-freq">{TIER_FREQUENCY_LABEL[tier]}</p>
            {schedule && (
              <p className="reward-freq" style={{ marginTop: "-0.25rem" }}>
                Claims: {schedule[tier].claimCount} / {schedule[tier].limit}
              </p>
            )}

            <ul className="reward-list">
              {rewards.map((r) => (
                <li key={r.id} className="reward-item">
                  <span>{r.label}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Delete reward"
                    onClick={() => {
                      if (confirm("Remove this reward?")) deleteMutation.mutate(r.id);
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
              {rewards.length === 0 && (
                <li style={{ color: "var(--text-dim)", fontSize: "0.85rem", listStyle: "none" }}>
                  No rewards yet
                </li>
              )}
            </ul>

            <div className="add-reward-row">
              <input
                className="neon-input"
                placeholder="Add a reward…"
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
    </>
  );
}
