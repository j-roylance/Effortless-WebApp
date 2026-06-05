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
