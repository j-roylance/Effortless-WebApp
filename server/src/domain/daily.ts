import { RewardTier } from "@prisma/client";

export type DailyBonusType = "planning" | "all_musts" | "all_do_dates";

export const DAILY_BONUS_TYPES: DailyBonusType[] = [
  "planning",
  "all_musts",
  "all_do_dates",
];

export type OptionalRewardTier = RewardTier | "None";

export function dayKeyForTimezone(timeZone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isSameDayInTimezone(
  iso: Date | string | null | undefined,
  dayKey: string,
  timeZone: string
): boolean {
  if (!iso) return false;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return dayKeyForTimezone(timeZone, d) === dayKey;
}

export function parseOptionalTier(value: unknown): RewardTier | null {
  if (value === null || value === "None" || value === undefined) return null;
  if (typeof value === "string" && Object.values(RewardTier).includes(value as RewardTier)) {
    return value as RewardTier;
  }
  return null;
}

export function tierToOptional(value: RewardTier | null | undefined): OptionalRewardTier {
  return value ?? "None";
}
