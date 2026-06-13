import { TaskRecurrence } from "@prisma/client";
import { dayKeyForTimezone } from "./daily.js";
import {
  parseRecurrenceConfig,
  type RecurrenceConfig,
} from "./recurrence.js";

export interface ScheduleOverride {
  scheduledAt?: string;
  dueAt?: string | null;
}

export type ScheduleOverrides = Record<string, ScheduleOverride>;

export interface OccurrenceTaskFields {
  recurrence: TaskRecurrence;
  recurrenceConfig: unknown;
  durationMinutes: number | null;
  scheduledAt: Date | null;
  dueAt: Date | null;
  createdAt: Date;
  scheduleOverrides: unknown;
}

export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseScheduleOverrides(value: unknown): ScheduleOverrides | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const result: ScheduleOverrides = {};

  for (const [dayKey, entry] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) continue;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const override: ScheduleOverride = {};

    if (typeof row.scheduledAt === "string") {
      const d = new Date(row.scheduledAt);
      if (!Number.isNaN(d.getTime())) override.scheduledAt = d.toISOString();
    }
    if (row.dueAt === null) {
      override.dueAt = null;
    } else if (typeof row.dueAt === "string") {
      const d = new Date(row.dueAt);
      if (!Number.isNaN(d.getTime())) override.dueAt = d.toISOString();
    }

    if (override.scheduledAt !== undefined || override.dueAt !== undefined) {
      result[dayKey] = override;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours, minutes };
}

function atLocalTimeOnDay(dayKey: string, time: string): Date {
  const { hours, minutes } = parseTime(time);
  const d = new Date(`${dayKey}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
  return d;
}

export function occursOnDay(
  recurrence: TaskRecurrence,
  config: RecurrenceConfig | null,
  dayKey: string
): boolean {
  if (recurrence === TaskRecurrence.None || !config?.time) return false;

  const day = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(day.getTime())) return false;

  if (recurrence === TaskRecurrence.Daily) return true;
  if (recurrence === TaskRecurrence.Weekly) {
    const days = config.daysOfWeek?.length ? config.daysOfWeek : [day.getDay()];
    return days.includes(day.getDay());
  }
  if (recurrence === TaskRecurrence.Monthly) {
    const days = config.daysOfMonth?.length ? config.daysOfMonth : [day.getDate()];
    return days.includes(day.getDate());
  }
  return false;
}

function dueOffsetMs(task: OccurrenceTaskFields): number | null {
  if (task.scheduledAt && task.dueAt) {
    return task.dueAt.getTime() - task.scheduledAt.getTime();
  }
  if (task.durationMinutes) {
    return task.durationMinutes * 60_000;
  }
  return null;
}

export function defaultOccurrenceForDay(
  task: OccurrenceTaskFields,
  dayKey: string
): { scheduledAt: Date; dueAt: Date | null } | null {
  const config = parseRecurrenceConfig(task.recurrenceConfig);
  if (!occursOnDay(task.recurrence, config, dayKey) || !config?.time) return null;

  const anchorKey = toLocalDateKey(task.createdAt);
  if (dayKey < anchorKey) return null;

  const scheduledAt = atLocalTimeOnDay(dayKey, config.time);
  const offset = dueOffsetMs(task);
  const dueAt = offset !== null ? new Date(scheduledAt.getTime() + offset) : null;

  return { scheduledAt, dueAt };
}

export function resolveOccurrenceForDay(
  task: OccurrenceTaskFields,
  dayKey: string
): { scheduledAt: Date; dueAt: Date | null } | null {
  const defaults = defaultOccurrenceForDay(task, dayKey);
  if (!defaults) return null;

  const overrides = parseScheduleOverrides(task.scheduleOverrides);
  const override = overrides?.[dayKey];
  if (!override) return defaults;

  const scheduledAt = override.scheduledAt
    ? new Date(override.scheduledAt)
    : defaults.scheduledAt;

  let dueAt: Date | null;
  if (override.dueAt === null) {
    dueAt = null;
  } else if (override.dueAt) {
    dueAt = new Date(override.dueAt);
  } else if (override.scheduledAt && defaults.dueAt) {
    const offset = defaults.dueAt.getTime() - defaults.scheduledAt.getTime();
    dueAt = new Date(scheduledAt.getTime() + offset);
  } else {
    dueAt = defaults.dueAt;
  }

  return { scheduledAt, dueAt };
}

export function overrideMatchesDefault(
  task: OccurrenceTaskFields,
  dayKey: string,
  override: ScheduleOverride
): boolean {
  const defaults = defaultOccurrenceForDay(task, dayKey);
  if (!defaults) return false;

  const scheduledAt = override.scheduledAt
    ? new Date(override.scheduledAt)
    : defaults.scheduledAt;
  const dueAt =
    override.dueAt === null
      ? null
      : override.dueAt
        ? new Date(override.dueAt)
        : defaults.dueAt;

  if (scheduledAt.getTime() !== defaults.scheduledAt.getTime()) return false;
  if (dueAt === null && defaults.dueAt === null) return true;
  if (dueAt && defaults.dueAt) return dueAt.getTime() === defaults.dueAt.getTime();
  return false;
}

export function taskOccursOnDay(
  task: OccurrenceTaskFields,
  dayKey: string,
  timeZone?: string
): boolean {
  if (task.recurrence === TaskRecurrence.None) return false;
  const config = parseRecurrenceConfig(task.recurrenceConfig);
  if (!occursOnDay(task.recurrence, config, dayKey)) return false;
  const anchorKey = timeZone
    ? dayKeyForTimezone(timeZone, task.createdAt)
    : toLocalDateKey(task.createdAt);
  return dayKey >= anchorKey;
}

export function mergeOccurrenceOverride(
  task: OccurrenceTaskFields,
  dayKey: string,
  patch: ScheduleOverride
): ScheduleOverrides | null {
  const current = { ...(parseScheduleOverrides(task.scheduleOverrides) ?? {}) };
  const existing = current[dayKey] ?? {};
  const merged: ScheduleOverride = { ...existing, ...patch };

  if (overrideMatchesDefault(task, dayKey, merged)) {
    delete current[dayKey];
  } else {
    current[dayKey] = merged;
  }

  return Object.keys(current).length > 0 ? current : null;
}
