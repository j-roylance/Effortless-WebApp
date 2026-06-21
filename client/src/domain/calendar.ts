import type { Task } from "../api/types";
import { toLocalDateInput } from "./recurrence";
import { resolveOccurrenceForDay, taskOccursOnDay, isOccurrenceAchieved, isOccurrenceSkipped } from "./schedule-overrides";

export const CALENDAR_HOUR_HEIGHT = 48;
export const CALENDAR_DAY_MINUTES = 24 * 60;
export const CALENDAR_SNAP_MINUTES = 15;
export const CALENDAR_DEFAULT_DUE_MINUTES = 30;
export const CALENDAR_MIN_DO_MINUTES = 30;

export type CalendarEntryType = "do" | "due";

export type CalendarEntryVisibility = "normal" | "skipped" | "achieved" | "archived";

export interface CalendarEntry {
  key: string;
  taskId: string;
  task: Task;
  type: CalendarEntryType;
  startMinutes: number;
  durationMinutes: number;
  occurrenceDayKey?: string;
  isRecurringInstance: boolean;
  visibility: CalendarEntryVisibility;
}

export interface EntriesForDayOptions {
  includeHidden?: boolean;
  treatAsArchived?: boolean;
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
  isRecurringInstance: boolean,
  visibility: CalendarEntryVisibility = "normal"
) {
  const visibilitySuffix = visibility === "normal" ? "" : `-${visibility}`;
  entries.push({
    key: isRecurringInstance
      ? `${task.id}-${dateInput}-${type}${visibilitySuffix}`
      : `${task.id}-${type}${visibilitySuffix}`,
    taskId: task.id,
    task,
    type,
    startMinutes: minutesFromDate(iso),
    durationMinutes,
    occurrenceDayKey: isRecurringInstance ? dateInput : undefined,
    isRecurringInstance,
    visibility,
  });
}

function recurringVisibility(
  task: Task,
  dateInput: string,
  treatAsArchived: boolean
): CalendarEntryVisibility | null {
  if (treatAsArchived) return "archived";
  if (isOccurrenceSkipped(task, dateInput)) return "skipped";
  if (isOccurrenceAchieved(task, dateInput)) return "achieved";
  return "normal";
}

export function entriesForDay(
  tasks: Task[],
  dateInput: string,
  options: EntriesForDayOptions = {}
): CalendarEntry[] {
  const includeHidden = options.includeHidden ?? false;
  const treatAsArchived = options.treatAsArchived ?? false;
  const entries: CalendarEntry[] = [];

  for (const task of tasks) {
    if (task.recurrence !== "None" && taskOccursOnDay(task, dateInput)) {
      const visibility = recurringVisibility(task, dateInput, treatAsArchived);
      if (!includeHidden && visibility !== "normal") continue;

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
          true,
          visibility ?? "normal"
        );
      }
      continue;
    }

    const oneTimeVisibility: CalendarEntryVisibility = treatAsArchived ? "archived" : "normal";

    if (isSameLocalDay(task.scheduledAt, dateInput)) {
      pushEntry(
        entries,
        task,
        dateInput,
        "do",
        task.scheduledAt!,
        Math.max(CALENDAR_MIN_DO_MINUTES, task.durationMinutes ?? CALENDAR_MIN_DO_MINUTES),
        false,
        oneTimeVisibility
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
        false,
        oneTimeVisibility
      );
    }
  }

  return entries.sort((a, b) => a.startMinutes - b.startMinutes);
}

export function entriesForDayMerged(
  activeTasks: Task[],
  archivedTasks: Task[],
  dateInput: string,
  showHidden: boolean
): CalendarEntry[] {
  const active = entriesForDay(activeTasks, dateInput, {
    includeHidden: showHidden,
  });
  if (!showHidden) return active;

  const archived = entriesForDay(archivedTasks, dateInput, {
    includeHidden: true,
    treatAsArchived: true,
  });
  return [...active, ...archived].sort((a, b) => a.startMinutes - b.startMinutes);
}

/** True when the task would appear on the calendar for the given day. */
export function taskShowsOnCalendarDay(task: Task, dateInput: string): boolean {
  if (task.recurrence !== "None" && taskOccursOnDay(task, dateInput)) {
    if (isOccurrenceAchieved(task, dateInput)) return false;
    if (isOccurrenceSkipped(task, dateInput)) return false;

    const occurrence = resolveOccurrenceForDay(task, dateInput);
    if (!occurrence) return false;

    return isSameLocalDay(occurrence.scheduledAt, dateInput);
  }

  if (isSameLocalDay(task.scheduledAt, dateInput)) return true;
  if (isSameLocalDay(task.dueAt, dateInput)) return true;
  return false;
}

export interface CalendarEntryLayout {
  column: number;
  columnCount: number;
}

interface LayoutInterval {
  key: string;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
}

function entriesOverlap(a: LayoutInterval, b: LayoutInterval): boolean {
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

function clusterLayoutItems(items: LayoutInterval[]): LayoutInterval[][] {
  const parent = items.map((_, index) => index);

  function find(index: number): number {
    let root = index;
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]!]!;
      root = parent[root]!;
    }
    return root;
  }

  function union(a: number, b: number) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (entriesOverlap(items[i]!, items[j]!)) {
        union(i, j);
      }
    }
  }

  const clusters = new Map<number, LayoutInterval[]>();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    const cluster = clusters.get(root) ?? [];
    cluster.push(items[i]!);
    clusters.set(root, cluster);
  }

  return [...clusters.values()];
}

function assignColumns(cluster: LayoutInterval[]): Map<string, CalendarEntryLayout> {
  const sorted = [...cluster].sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    return b.durationMinutes - a.durationMinutes;
  });

  const columns: LayoutInterval[][] = [];
  const layouts = new Map<string, CalendarEntryLayout>();

  for (const item of sorted) {
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      if (!columns[col]!.some((existing) => entriesOverlap(existing, item))) {
        columns[col]!.push(item);
        layouts.set(item.key, { column: col, columnCount: 0 });
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([item]);
      layouts.set(item.key, { column: columns.length - 1, columnCount: 0 });
    }
  }

  const columnCount = columns.length;
  for (const [key, layout] of layouts) {
    layouts.set(key, { column: layout.column, columnCount });
  }

  return layouts;
}

/** Side-by-side column layout for overlapping calendar entries on the same day. */
export function layoutCalendarEntries(
  items: Array<{ key: string; startMinutes: number; durationMinutes: number }>
): Map<string, CalendarEntryLayout> {
  if (items.length === 0) return new Map();

  const intervals: LayoutInterval[] = items.map((item) => ({
    key: item.key,
    startMinutes: item.startMinutes,
    endMinutes: item.startMinutes + item.durationMinutes,
    durationMinutes: item.durationMinutes,
  }));

  const result = new Map<string, CalendarEntryLayout>();
  for (const cluster of clusterLayoutItems(intervals)) {
    for (const [key, layout] of assignColumns(cluster)) {
      result.set(key, layout);
    }
  }
  return result;
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

const CALENDAR_SHOW_HIDDEN_KEY = "effortless:calendarShowHidden";

export function isCalendarShowHidden(): boolean {
  return localStorage.getItem(CALENDAR_SHOW_HIDDEN_KEY) === "1";
}

export function setCalendarShowHidden(show: boolean): void {
  localStorage.setItem(CALENDAR_SHOW_HIDDEN_KEY, show ? "1" : "0");
}
