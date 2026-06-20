import type { Task } from "../api/types";
import { taskShowsOnCalendarDay } from "./calendar";
import { toLocalDateInput } from "./recurrence";

export type TaskSection = "Must" | "Should" | "Could";

export type TaskTimeBucket = "today" | "future" | "past";

export const TASK_SECTIONS: TaskSection[] = ["Must", "Should", "Could"];

export const TASK_TIME_BUCKETS: TaskTimeBucket[] = ["today", "future", "past"];

export const TASK_TIME_BUCKET_LABEL: Record<TaskTimeBucket, string> = {
  today: "Today",
  future: "Future",
  past: "Past",
};

export const TASK_SECTION_LABEL: Record<TaskSection, string> = {
  Must: "Must",
  Should: "Should",
  Could: "Could",
};

export const TASK_SECTION_COLOR: Record<TaskSection, string> = {
  Must: "#ff4466",
  Should: "#00ff88",
  Could: "#4488ff",
};

export function normalizeSection(value: string | null | undefined): TaskSection {
  if (value === "Must" || value === "Should" || value === "Could") return value;
  return "Could";
}

function emptySectionGroups(): Record<TaskSection, Task[]> {
  return Object.fromEntries(
    TASK_SECTIONS.map((section) => [section, [] as Task[]])
  ) as Record<TaskSection, Task[]>;
}

export function classifyTaskTimeBucket(task: Task, todayKey: string): TaskTimeBucket {
  if (taskShowsOnCalendarDay(task, todayKey)) return "today";

  if (task.recurrence !== "None") return "future";

  const schedKey = task.scheduledAt ? toLocalDateInput(task.scheduledAt) : null;
  const dueKey = task.dueAt ? toLocalDateInput(task.dueAt) : null;

  if (!schedKey && !dueKey) return "future";

  if ((schedKey && schedKey > todayKey) || (dueKey && dueKey > todayKey)) {
    return "future";
  }

  if ((schedKey && schedKey < todayKey) || (dueKey && dueKey < todayKey)) {
    return "past";
  }

  return "future";
}

export function groupTasksByTimeAndSection(
  tasks: Task[],
  todayKey: string
): Record<TaskTimeBucket, Record<TaskSection, Task[]>> {
  const grouped = Object.fromEntries(
    TASK_TIME_BUCKETS.map((bucket) => [bucket, emptySectionGroups()])
  ) as Record<TaskTimeBucket, Record<TaskSection, Task[]>>;

  for (const task of tasks) {
    const bucket = classifyTaskTimeBucket(task, todayKey);
    grouped[bucket][normalizeSection(task.section)].push(task);
  }

  return grouped;
}

export function timeBucketHasTasks(
  bySection: Record<TaskSection, Task[]>
): boolean {
  return TASK_SECTIONS.some((section) => bySection[section].length > 0);
}
