import type { AchieveResult, BonusReward, BonusToken } from "../api/types";
import type { RewardQueueItem } from "../domain/rewards";
import type { RewardTier } from "../domain/tiers";

export function rewardsFromAchieve(data: AchieveResult): RewardQueueItem[] {
  const items: RewardQueueItem[] = [];
  if (data.token) items.push({ type: "token", tier: data.token.tier });
  if (data.definiteReward) {
    items.push({ type: "definite", label: data.definiteReward.label });
  }
  for (const bonus of data.bonusTokens ?? []) {
    items.push({ type: "token", tier: bonus.tier });
  }
  for (const bonus of data.bonusRewards ?? []) {
    items.push({ type: "definite", label: bonus.label });
  }
  return items;
}

export function rewardsFromPlanningClaim(data: {
  token: BonusToken | null;
  definiteReward: { label: string } | null;
}): RewardQueueItem[] {
  const items: RewardQueueItem[] = [];
  if (data.token) items.push({ type: "token", tier: data.token.tier });
  if (data.definiteReward) {
    items.push({ type: "definite", label: data.definiteReward.label });
  }
  return items;
}

export function tokenTiersFromRewards(items: RewardQueueItem[]): RewardTier[] {
  return items
    .filter((item): item is { type: "token"; tier: RewardTier } => item.type === "token")
    .map((item) => item.tier);
}
