/**
 * Reward tier ordering and schedule limits.
 * Keep client/src/domain/tiers.ts in sync for labels and colors.
 */
import { RewardTier } from "@prisma/client";

export const TIERS: RewardTier[] = [
  RewardTier.Bronze,
  RewardTier.Silver,
  RewardTier.Gold,
  RewardTier.Diamond,
  RewardTier.Platinum,
  RewardTier.Royal,
  RewardTier.King,
  RewardTier.Emperor,
  RewardTier.Planetary,
  RewardTier.Stellar,
  RewardTier.Galactic,
];

export const TIER_FREQUENCY_LABEL: Record<RewardTier, string> = {
  [RewardTier.Bronze]: "20× per day",
  [RewardTier.Silver]: "10× per day",
  [RewardTier.Gold]: "5× per day",
  [RewardTier.Diamond]: "2× per day",
  [RewardTier.Platinum]: "1× per day",
  [RewardTier.Royal]: "2× per week",
  [RewardTier.King]: "1× per week",
  [RewardTier.Emperor]: "2× per month",
  [RewardTier.Planetary]: "1× per month",
  [RewardTier.Stellar]: "2× per year",
  [RewardTier.Galactic]: "1× per year",
};

type Bucket = "day" | "week" | "month" | "year";

const TIER_LIMITS: Record<RewardTier, { max: number; bucket: Bucket }> = {
  [RewardTier.Bronze]: { max: 20, bucket: "day" },
  [RewardTier.Silver]: { max: 10, bucket: "day" },
  [RewardTier.Gold]: { max: 5, bucket: "day" },
  [RewardTier.Diamond]: { max: 2, bucket: "day" },
  [RewardTier.Platinum]: { max: 1, bucket: "day" },
  [RewardTier.Royal]: { max: 2, bucket: "week" },
  [RewardTier.King]: { max: 1, bucket: "week" },
  [RewardTier.Emperor]: { max: 2, bucket: "month" },
  [RewardTier.Planetary]: { max: 1, bucket: "month" },
  [RewardTier.Stellar]: { max: 2, bucket: "year" },
  [RewardTier.Galactic]: { max: 1, bucket: "year" },
};

export function tierRank(tier: RewardTier): number {
  return TIERS.indexOf(tier);
}

export function tierUp(tier: RewardTier): RewardTier {
  const idx = tierRank(tier);
  return TIERS[Math.min(idx + 1, TIERS.length - 1)]!;
}

export function tierDown(tier: RewardTier): RewardTier {
  const idx = tierRank(tier);
  return TIERS[Math.max(idx - 1, 0)]!;
}

export function isValidTier(value: string): value is RewardTier {
  return (TIERS as string[]).includes(value);
}

function startOfBucket(date: Date, bucket: Bucket, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value) - 1;
  const d = Number(parts.find((p) => p.type === "day")!.value);

  if (bucket === "day") {
    return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  }

  const day = date.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  const weekStart = new Date(Date.UTC(y, m, d - mondayOffset, 0, 0, 0, 0));

  if (bucket === "week") {
    return weekStart;
  }

  if (bucket === "month") {
    return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  }

  return new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
}

export function bucketStartForTier(tier: RewardTier, now: Date, timeZone: string): Date {
  const { bucket } = TIER_LIMITS[tier];
  return startOfBucket(now, bucket, timeZone);
}

export function tierClaimLimit(tier: RewardTier): number {
  return TIER_LIMITS[tier].max;
}

export function canClaimTier(tier: RewardTier, claimCount: number): boolean {
  return claimCount < TIER_LIMITS[tier].max;
}
