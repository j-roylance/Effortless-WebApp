import { RewardTier } from "@prisma/client";

export type DailyBonusType = "planning" | "all_musts" | "all_do_dates";

export const DAILY_BONUS_TYPES: DailyBonusType[] = [
  "planning",
  "all_musts",
  "all_do_dates",
];

export type OptionalRewardTier = RewardTier | "None";

/** Fall back to UTC when the client sends an invalid IANA zone. */
export function safeTimeZone(timeZone: string | undefined): string {
  const tz = timeZone?.trim() || "UTC";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export function dayKeyForTimezone(timeZone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

type LocalParts = { y: number; m: number; d: number; h: number; min: number; s: number };

function getLocalParts(utc: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utc);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    h: get("hour"),
    min: get("minute"),
    s: get("second"),
  };
}

function localPartsSortable(p: LocalParts): number {
  return p.y * 1e10 + p.m * 1e8 + p.d * 1e6 + p.h * 1e4 + p.min * 100 + p.s;
}

/** UTC instant when the local wall clock reads the given date/time in `timeZone`. */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const tz = safeTimeZone(timeZone);
  const target = localPartsSortable({ y: year, m: month, d: day, h: hour, min: minute, s: second });

  let lo = Date.UTC(year, month - 1, day - 2);
  let hi = Date.UTC(year, month - 1, day + 2);

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const parts = getLocalParts(new Date(mid), tz);
    if (localPartsSortable(parts) < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return new Date(lo);
}

export function startOfLocalDayUtc(timeZone: string, date = new Date()): Date {
  const dayKey = dayKeyForTimezone(timeZone, date);
  const [y, m, d] = dayKey.split("-").map(Number);
  return zonedWallTimeToUtc(y, m, d, 0, 0, 0, timeZone);
}

function localDayOfWeek(date: Date, timeZone: string): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 0;
}

function addCalendarDays(y: number, m: number, d: number, delta: number): LocalParts {
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: 0, min: 0, s: 0 };
}

export function startOfLocalWeekUtc(timeZone: string, date = new Date()): Date {
  const tz = safeTimeZone(timeZone);
  const parts = getLocalParts(date, tz);
  const mondayOffset = (localDayOfWeek(date, tz) + 6) % 7;
  const monday = addCalendarDays(parts.y, parts.m, parts.d, -mondayOffset);
  return zonedWallTimeToUtc(monday.y, monday.m, monday.d, 0, 0, 0, tz);
}

export function startOfLocalMonthUtc(timeZone: string, date = new Date()): Date {
  const parts = getLocalParts(date, safeTimeZone(timeZone));
  return zonedWallTimeToUtc(parts.y, parts.m, 1, 0, 0, 0, timeZone);
}

export function startOfLocalYearUtc(timeZone: string, date = new Date()): Date {
  const parts = getLocalParts(date, safeTimeZone(timeZone));
  return zonedWallTimeToUtc(parts.y, 1, 1, 0, 0, 0, timeZone);
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
