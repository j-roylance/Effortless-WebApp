import { TIER_COLORS, type RewardTier } from "../domain/tiers";

export function TierBadge({ tier }: { tier: RewardTier }) {
  const color = TIER_COLORS[tier];
  return (
    <span className="tier-badge" style={{ color, borderColor: color }}>
      {tier}
    </span>
  );
}
