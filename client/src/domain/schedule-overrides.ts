import type { Task } from "../api/types";
import { parseRecurrenceConfig, toLocalDateInput, type RecurrenceConfig, type TaskRecurrence } from "./recurrence";

export interface ScheduleOverride {
  scheduledAt?: string;
  dueAt?: string | null;
}

export type ScheduleOverrides = Record<string, ScheduleOverride>;

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

function atLocalTimeOnDay(dayKey: string, time: string): Date {
  const parsed = new Date(`${dayKey}T${time}`);
  return parsed;
}

export function occursOnDay(
  recurrence: TaskRecurrence,
  config: RecurrenceConfig | null,
  dayKey: string
): boolean {
  if (recurrence === "None" || !config?.time) return false;

  const day = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(day.getTime())) return false;

  if (recurrence === "Daily") return true;
  if (recurrence === "Weekly") {
    const days = config.daysOfWeek?.length ? config.daysOfWeek : [day.getDay()];
    return days.includes(day.getDay());
  }
  if (recurrence === "Monthly") {
    const days = config.daysOfMonth?.length ? config.daysOfMonth : [day.getDate()];
    return days.includes(day.getDate());
  }
  return false;
}

function dueOffsetMs(task: Task): number | null {
  if (task.scheduledAt && task.dueAt) {
    return new Date(task.dueAt).getTime() - new Date(task.scheduledAt).getTime();
  }
  if (task.durationMinutes) {
    return task.durationMinutes * 60_000;
  }
  return null;
}

export function defaultOccurrenceForDay(
  task: Task,
  dayKey: string
): { scheduledAt: string; dueAt: string | null } | null {
  const config = task.recurrenceConfig;
  if (!occursOnDay(task.recurrence, config, dayKey) || !config?.time) return null;

  const anchorKey = toLocalDateInput(task.createdAt);
  if (!anchorKey || dayKey < anchorKey) return null;

  const scheduledAt = atLocalTimeOnDay(dayKey, config.time).toISOString();
  const offset = dueOffsetMs(task);
  const dueAt = offset !== null ? new Date(new Date(scheduledAt).getTime() + offset).toISOString() : null;

  return { scheduledAt, dueAt };
}

export function resolveOccurrenceForDay(
  task: Task,
  dayKey: string
): { scheduledAt: string; dueAt: string | null } | null {
  const defaults = defaultOccurrenceForDay(task, dayKey);
  if (!defaults) return null;

  const overrides = task.scheduleOverrides;
  const override = overrides?.[dayKey];
  if (!override) return defaults;

  const scheduledAt = override.scheduledAt ?? defaults.scheduledAt;

  let dueAt: string | null;
  if (override.dueAt === null) {
    dueAt = null;
  } else if (override.dueAt) {
    dueAt = override.dueAt;
  } else if (override.scheduledAt && defaults.dueAt) {
    const offset =
      new Date(defaults.dueAt).getTime() - new Date(defaults.scheduledAt).getTime();
    dueAt = new Date(new Date(scheduledAt).getTime() + offset).toISOString();
  } else {
    dueAt = defaults.dueAt;
  }

  return { scheduledAt, dueAt };
}

export function taskOccursOnDay(task: Task, dayKey: string): boolean {
  if (task.recurrence === "None") return false;
  if (!occursOnDay(task.recurrence, task.recurrenceConfig, dayKey)) return false;
  const anchorKey = toLocalDateInput(task.createdAt);
  return !!anchorKey && dayKey >= anchorKey;
}
