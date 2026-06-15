/**
 * Like credit split/combine ratios per tier.
 * Keep client/src/domain/like-conversions.ts in sync.
 */
import { RewardTier } from "@prisma/client";
import { tierDown } from "./tiers.js";

/** Credits yielded when splitting 1 like at this tier (also combine cost into this tier). */
const CONVERSION_COUNT: Partial<Record<RewardTier, number>> = {
  [RewardTier.Silver]: 2,
  [RewardTier.Gold]: 2,
  [RewardTier.Diamond]: 2,
  [RewardTier.Platinum]: 2,
  [RewardTier.Royal]: 3,
  [RewardTier.King]: 2,
  [RewardTier.Emperor]: 2,
  [RewardTier.Planetary]: 2,
  [RewardTier.Stellar]: 6,
  [RewardTier.Galactic]: 2,
};

export function canSplitFromTier(tier: RewardTier): boolean {
  return tier !== RewardTier.Bronze && CONVERSION_COUNT[tier] !== undefined;
}

export function canCombineToTier(tier: RewardTier): boolean {
  return tier !== RewardTier.Bronze && CONVERSION_COUNT[tier] !== undefined;
}

export function lowerTierFor(tier: RewardTier): RewardTier {
  return tierDown(tier);
}

export function conversionCount(tier: RewardTier): number {
  const count = CONVERSION_COUNT[tier];
  if (count === undefined) {
    throw new Error(`No conversion defined for tier ${tier}`);
  }
  return count;
}
