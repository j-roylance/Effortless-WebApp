/**
 * Reward tier ordering and schedule limits.
 * Keep client/src/domain/tiers.ts in sync for labels and colors.
 */
import { RewardTier } from "@prisma/client";
import {
  dayKeyForTimezone,
  safeTimeZone,
  startOfLocalDayUtc,
  startOfLocalMonthUtc,
  startOfLocalWeekUtc,
  startOfLocalYearUtc,
} from "./daily.js";

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
  const tz = safeTimeZone(timeZone);
  if (bucket === "day") return startOfLocalDayUtc(tz, date);
  if (bucket === "week") return startOfLocalWeekUtc(tz, date);
  if (bucket === "month") return startOfLocalMonthUtc(tz, date);
  return startOfLocalYearUtc(tz, date);
}

export function bucketStartForTier(tier: RewardTier, now: Date, timeZone: string): Date {
  const { bucket } = TIER_LIMITS[tier];
  return startOfBucket(now, bucket, timeZone);
}

function isoWeekKeyFromYmd(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Stable bucket id for like usage tracking (matches bucketStartForTier periods). */
export function bucketKeyForTier(tier: RewardTier, timeZone: string, now = new Date()): string {
  const tz = safeTimeZone(timeZone);
  const { bucket } = TIER_LIMITS[tier];
  const dayKey = dayKeyForTimezone(tz, now);
  const [y, m, d] = dayKey.split("-").map(Number);

  if (bucket === "day") {
    return `day:${dayKey}`;
  }
  if (bucket === "week") {
    return `week:${isoWeekKeyFromYmd(y, m, d)}`;
  }
  if (bucket === "month") {
    return `month:${y}-${String(m).padStart(2, "0")}`;
  }
  return `year:${y}`;
}

export function tierClaimLimit(tier: RewardTier): number {
  return TIER_LIMITS[tier].max;
}

export function canClaimTier(tier: RewardTier, claimCount: number): boolean {
  return claimCount < TIER_LIMITS[tier].max;
}
