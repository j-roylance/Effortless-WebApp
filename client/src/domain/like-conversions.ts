/**
 * Like credit split/combine ratios per tier.
 * Must match server/src/domain/like-conversions.ts.
 */
import { TIERS, type RewardTier } from "./tiers";

/** Credits yielded when splitting 1 like at this tier (also combine cost into this tier). */
const CONVERSION_COUNT: Partial<Record<RewardTier, number>> = {
  Silver: 2,
  Gold: 2,
  Diamond: 2,
  Platinum: 2,
  Royal: 3,
  King: 2,
  Emperor: 2,
  Planetary: 2,
  Stellar: 6,
  Galactic: 2,
};

export function canSplitFromTier(tier: RewardTier): boolean {
  return tier !== "Bronze" && CONVERSION_COUNT[tier] !== undefined;
}

export function canCombineToTier(tier: RewardTier): boolean {
  return tier !== "Bronze" && CONVERSION_COUNT[tier] !== undefined;
}

export function lowerTierFor(tier: RewardTier): RewardTier {
  const idx = TIERS.indexOf(tier);
  return TIERS[Math.max(idx - 1, 0)]!;
}

export function conversionCount(tier: RewardTier): number {
  const count = CONVERSION_COUNT[tier];
  if (count === undefined) {
    throw new Error(`No conversion defined for tier ${tier}`);
  }
  return count;
}
