import type { Task } from "../api/types";
import { toLocalDateInput } from "./recurrence";

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

export function entriesForDay(tasks: Task[], dateInput: string): CalendarEntry[] {
  const entries: CalendarEntry[] = [];

  for (const task of tasks) {
    if (isSameLocalDay(task.scheduledAt, dateInput)) {
      entries.push({
        key: `${task.id}-do`,
        taskId: task.id,
        task,
        type: "do",
        startMinutes: minutesFromDate(task.scheduledAt!),
        durationMinutes: Math.max(
          CALENDAR_MIN_DO_MINUTES,
          task.durationMinutes ?? CALENDAR_MIN_DO_MINUTES
        ),
      });
    }

    if (isSameLocalDay(task.dueAt, dateInput)) {
      entries.push({
        key: `${task.id}-due`,
        taskId: task.id,
        task,
        type: "due",
        startMinutes: minutesFromDate(task.dueAt!),
        durationMinutes: CALENDAR_DEFAULT_DUE_MINUTES,
      });
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
