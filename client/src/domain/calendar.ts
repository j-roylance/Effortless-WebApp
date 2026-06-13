import type { Task } from "../api/types";
import { toLocalDateInput } from "./recurrence";
import { resolveOccurrenceForDay, taskOccursOnDay } from "./schedule-overrides";

export const CALENDAR_HOUR_HEIGHT = 48;
export const CALENDAR_DAY_MINUTES = 24 * 60;
export const CALENDAR_SNAP_MINUTES = 15;
export const CALENDAR_DEFAULT_DUE_MINUTES = 30;
export const CALENDAR_MIN_DO_MINUTES = 30;

export type CalendarEntryType = "do" | "due";

export interface CalendarEntry {
  key: string;
  taskId: string;
  task: Task;
  type: CalendarEntryType;
  startMinutes: number;
  durationMinutes: number;
  occurrenceDayKey?: string;
  isRecurringInstance: boolean;
}

export function todayDateInput(): string {
  return toLocalDateInput(new Date().toISOString());
}

export function isSameLocalDay(iso: string | null | undefined, dateInput: string): boolean {
  if (!iso) return false;
  return toLocalDateInput(iso) === dateInput;
}

export function minutesFromDate(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export function dateTimeFromMinutes(dateInput: string, minutes: number): string {
  const clamped = Math.max(0, Math.min(CALENDAR_DAY_MINUTES - 1, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const parsed = new Date(`${dateInput}T${time}`);
  return parsed.toISOString();
}

export function snapMinutes(minutes: number): number {
  return Math.round(minutes / CALENDAR_SNAP_MINUTES) * CALENDAR_SNAP_MINUTES;
}

export function minutesFromPointerY(
  clientY: number,
  gridTop: number,
  scrollTop: number
): number {
  const y = clientY - gridTop + scrollTop;
  const ratio = y / (24 * CALENDAR_HOUR_HEIGHT);
  return snapMinutes(ratio * CALENDAR_DAY_MINUTES);
}

export function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function pushEntry(
  entries: CalendarEntry[],
  task: Task,
  dateInput: string,
  type: CalendarEntryType,
  iso: string,
  durationMinutes: number,
  isRecurringInstance: boolean
) {
  entries.push({
    key: isRecurringInstance ? `${task.id}-${dateInput}-${type}` : `${task.id}-${type}`,
    taskId: task.id,
    task,
    type,
    startMinutes: minutesFromDate(iso),
    durationMinutes,
    occurrenceDayKey: isRecurringInstance ? dateInput : undefined,
    isRecurringInstance,
  });
}

export function entriesForDay(tasks: Task[], dateInput: string): CalendarEntry[] {
  const entries: CalendarEntry[] = [];

  for (const task of tasks) {
    if (task.recurrence !== "None" && taskOccursOnDay(task, dateInput)) {
      const occurrence = resolveOccurrenceForDay(task, dateInput);
      if (!occurrence) continue;

      if (isSameLocalDay(occurrence.scheduledAt, dateInput)) {
        pushEntry(
          entries,
          task,
          dateInput,
          "do",
          occurrence.scheduledAt,
          Math.max(CALENDAR_MIN_DO_MINUTES, task.durationMinutes ?? CALENDAR_MIN_DO_MINUTES),
          true
        );
      }

      if (occurrence.dueAt && isSameLocalDay(occurrence.dueAt, dateInput)) {
        pushEntry(
          entries,
          task,
          dateInput,
          "due",
          occurrence.dueAt,
          CALENDAR_DEFAULT_DUE_MINUTES,
          true
        );
      }
      continue;
    }

    if (isSameLocalDay(task.scheduledAt, dateInput)) {
      pushEntry(
        entries,
        task,
        dateInput,
        "do",
        task.scheduledAt!,
        Math.max(CALENDAR_MIN_DO_MINUTES, task.durationMinutes ?? CALENDAR_MIN_DO_MINUTES),
        false
      );
    }

    if (isSameLocalDay(task.dueAt, dateInput)) {
      pushEntry(
        entries,
        task,
        dateInput,
        "due",
        task.dueAt!,
        CALENDAR_DEFAULT_DUE_MINUTES,
        false
      );
    }
  }

  return entries.sort((a, b) => a.startMinutes - b.startMinutes);
}

export function planningDoneStorageKey(userId: string, dateInput: string): string {
  return `effortless:planningDone:${userId}:${dateInput}`;
}

export function isPlanningDone(userId: string, dateInput: string): boolean {
  return localStorage.getItem(planningDoneStorageKey(userId, dateInput)) === "1";
}

export function setPlanningDone(userId: string, dateInput: string): void {
  localStorage.setItem(planningDoneStorageKey(userId, dateInput), "1");
}
