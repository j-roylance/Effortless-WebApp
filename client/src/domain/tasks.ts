import type { Task } from "../api/types";
import { isTaskPastDue } from "./recurrence";

export type TaskSection = "Must" | "Should" | "Could";

export const TASK_SECTIONS: TaskSection[] = ["Must", "Should", "Could"];

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

export function groupTasksBySection(
  tasks: Task[],
  pastDue: boolean
): Record<TaskSection, Task[]> {
  const grouped = Object.fromEntries(
    TASK_SECTIONS.map((section) => [section, [] as Task[]])
  ) as Record<TaskSection, Task[]>;

  for (const task of tasks) {
    const overdue = isTaskPastDue(task.dueAt);
    if (overdue !== pastDue) continue;
    grouped[normalizeSection(task.section)].push(task);
  }

  return grouped;
}
