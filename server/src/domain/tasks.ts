import { TaskSection } from "@prisma/client";

export const TASK_SECTIONS: TaskSection[] = [
  TaskSection.Must,
  TaskSection.Should,
  TaskSection.Could,
];

export function isValidSection(value: string): value is TaskSection {
  return TASK_SECTIONS.includes(value as TaskSection);
}

/** Unassigned or unknown values fall back to Could. */
export function normalizeSection(value: string | null | undefined): TaskSection {
  if (value && isValidSection(value)) return value;
  return TaskSection.Could;
}

export function isTaskPastDue(dueAt: Date | null | undefined, now = new Date()): boolean {
  if (!dueAt) return false;
  return dueAt < now;
}
