import type { Task } from "../api/types";
import { toLocalDateInput, type RecurrenceConfig, type TaskRecurrence } from "./recurrence";

export interface ScheduleOverride {
  scheduledAt?: string;
  dueAt?: string | null;
  achieved?: boolean;
  skipped?: boolean;
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

    if (row.achieved === true) {
      override.achieved = true;
    }
    if (row.skipped === true) {
      override.skipped = true;
    }

    if (
      override.scheduledAt !== undefined ||
      override.dueAt !== undefined ||
      override.achieved ||
      override.skipped
    ) {
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

export function defaultOccurrenceForDay(
  task: Task,
  dayKey: string
): { scheduledAt: string; dueAt: null } | null {
  const config = task.recurrenceConfig;
  if (!occursOnDay(task.recurrence, config, dayKey) || !config?.time) return null;

  const anchorKey = toLocalDateInput(task.createdAt);
  if (!anchorKey || dayKey < anchorKey) return null;

  const scheduledAt = atLocalTimeOnDay(dayKey, config.time).toISOString();
  return { scheduledAt, dueAt: null };
}

export function resolveOccurrenceForDay(
  task: Task,
  dayKey: string
): { scheduledAt: string; dueAt: null } | null {
  const defaults = defaultOccurrenceForDay(task, dayKey);
  if (!defaults) return null;

  const override = task.scheduleOverrides?.[dayKey];
  if (!override?.scheduledAt) return defaults;

  return { scheduledAt: override.scheduledAt, dueAt: null };
}

export function taskOccursOnDay(task: Task, dayKey: string): boolean {
  if (task.recurrence === "None") return false;
  if (!occursOnDay(task.recurrence, task.recurrenceConfig, dayKey)) return false;
  const anchorKey = toLocalDateInput(task.createdAt);
  return !!anchorKey && dayKey >= anchorKey;
}

/** True when a recurring occurrence was achieved on the given calendar day. */
export function isOccurrenceAchieved(task: Task, dayKey: string): boolean {
  if (task.scheduleOverrides?.[dayKey]?.achieved) return true;
  return task.achievedAt != null && toLocalDateInput(task.achievedAt) === dayKey;
}

/** True when a recurring occurrence was skipped (removed) on the given calendar day. */
export function isOccurrenceSkipped(task: Task, dayKey: string): boolean {
  return task.scheduleOverrides?.[dayKey]?.skipped === true;
}
