import type { AchieveResult, BonusReward, BonusToken } from "../api/types";
import { headlineForRewardSource, type RewardQueueItem } from "../domain/rewards";
import type { RewardTier } from "../domain/tiers";

export function rewardsFromAchieve(data: AchieveResult): RewardQueueItem[] {
  const items: RewardQueueItem[] = [];
  for (const token of data.tokens ?? (data.token ? [data.token] : [])) {
    items.push({ type: "token", tier: token.tier });
  }
  for (const reward of data.definiteRewards ?? (data.definiteReward ? [data.definiteReward] : [])) {
    items.push({ type: "definite", label: reward.label });
  }
  for (const bonus of data.bonusTokens ?? []) {
    items.push({
      type: "token",
      tier: bonus.tier,
      headline: headlineForRewardSource(bonus.source),
    });
  }
  for (const bonus of data.bonusRewards ?? []) {
    items.push({
      type: "definite",
      label: bonus.label,
      headline: headlineForRewardSource(bonus.source),
    });
  }
  return items;
}

export function rewardsFromPlanningClaim(data: {
  token: BonusToken | null;
  definiteReward: { label: string } | null;
}): RewardQueueItem[] {
  const headline = headlineForRewardSource(data.token?.source ?? "daily_planning");
  const items: RewardQueueItem[] = [];
  if (data.token) items.push({ type: "token", tier: data.token.tier, headline });
  if (data.definiteReward) {
    items.push({ type: "definite", label: data.definiteReward.label, headline });
  }
  return items;
}

export function tokenTiersFromRewards(items: RewardQueueItem[]): RewardTier[] {
  return items
    .filter((item): item is { type: "token"; tier: RewardTier } => item.type === "token")
    .map((item) => item.tier);
}
