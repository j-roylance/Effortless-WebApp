import { TaskRecurrence } from "@prisma/client";

export interface RecurrenceConfig {
  time: string;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
}

export function parseRecurrenceConfig(value: unknown): RecurrenceConfig | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.time !== "string" || !/^\d{2}:\d{2}$/.test(raw.time)) return null;

  const config: RecurrenceConfig = { time: raw.time };

  if (Array.isArray(raw.daysOfWeek)) {
    const days = raw.daysOfWeek.filter(
      (d): d is number => typeof d === "number" && d >= 0 && d <= 6
    );
    if (days.length > 0) config.daysOfWeek = [...new Set(days)].sort((a, b) => a - b);
  }

  if (Array.isArray(raw.daysOfMonth)) {
    const days = raw.daysOfMonth.filter(
      (d): d is number => typeof d === "number" && d >= 1 && d <= 31
    );
    if (days.length > 0) config.daysOfMonth = [...new Set(days)].sort((a, b) => a - b);
  }

  return config;
}

function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours, minutes };
}

function atLocalTime(base: Date, time: string): Date {
  const { hours, minutes } = parseTime(time);
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/** Next occurrence strictly after `after` (local time). */
export function nextOccurrenceAfter(
  recurrence: TaskRecurrence,
  config: RecurrenceConfig | null,
  after: Date
): Date | null {
  if (recurrence === TaskRecurrence.None || !config?.time) return null;

  if (recurrence === TaskRecurrence.Daily) {
    let candidate = atLocalTime(new Date(after), config.time);
    if (candidate <= after) {
      candidate = new Date(candidate);
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate;
  }

  if (recurrence === TaskRecurrence.Weekly) {
    const days = config.daysOfWeek?.length ? config.daysOfWeek : [after.getDay()];
    for (let offset = 0; offset < 14; offset++) {
      const day = new Date(after);
      day.setDate(after.getDate() + offset);
      day.setHours(0, 0, 0, 0);
      if (!days.includes(day.getDay())) continue;
      const candidate = atLocalTime(day, config.time);
      if (candidate > after) return candidate;
    }
    return null;
  }

  if (recurrence === TaskRecurrence.Monthly) {
    const days = config.daysOfMonth?.length ? config.daysOfMonth : [after.getDate()];
    for (let monthOffset = 0; monthOffset < 14; monthOffset++) {
      const monthStart = new Date(after.getFullYear(), after.getMonth() + monthOffset, 1);
      for (const dom of days) {
        const day = new Date(monthStart.getFullYear(), monthStart.getMonth(), dom);
        if (day.getMonth() !== monthStart.getMonth()) continue;
        const candidate = atLocalTime(day, config.time);
        if (candidate > after) return candidate;
      }
    }
    return null;
  }

  return null;
}

export function advanceSchedule(
  recurrence: TaskRecurrence,
  config: RecurrenceConfig | null,
  scheduledAt: Date | null,
  dueAt: Date | null,
  now: Date
): { scheduledAt: Date | null; dueAt: Date | null } {
  if (recurrence === TaskRecurrence.None) {
    return { scheduledAt, dueAt };
  }

  const dueOffsetMs =
    scheduledAt && dueAt ? dueAt.getTime() - scheduledAt.getTime() : null;

  const nextScheduled = nextOccurrenceAfter(recurrence, config, now);
  if (!nextScheduled) {
    return { scheduledAt, dueAt };
  }

  const nextDue =
    dueOffsetMs !== null
      ? new Date(nextScheduled.getTime() + dueOffsetMs)
      : dueAt;

  return { scheduledAt: nextScheduled, dueAt: nextDue };
}
