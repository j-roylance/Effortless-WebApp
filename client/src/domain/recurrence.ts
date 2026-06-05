export type TaskRecurrence = "None" | "Daily" | "Weekly" | "Monthly";

export const TASK_RECURRENCES: TaskRecurrence[] = ["None", "Daily", "Weekly", "Monthly"];

export const RECURRENCE_LABEL: Record<Exclude<TaskRecurrence, "None">, string> = {
  Daily: "Daily",
  Weekly: "Weekly",
  Monthly: "Monthly",
};

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface RecurrenceConfig {
  time: string;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
}

export function isTaskPastDue(dueAt: string | null | undefined, now = new Date()): boolean {
  if (!dueAt) return false;
  return new Date(dueAt) < now;
}

/** True when the task was already achieved on the user's local calendar day. */
export function isTaskAchievedToday(
  achievedAt: string | null | undefined,
  now = new Date()
): boolean {
  if (!achievedAt) return false;
  return toLocalDateInput(achievedAt) === toLocalDateInput(now.toISOString());
}

export function toLocalDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toLocalTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function toISOFromLocal(date: string, time: string): string | null {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function recurrenceSummary(
  recurrence: TaskRecurrence,
  config: RecurrenceConfig | null
): string {
  if (recurrence === "None" || !config?.time) return "";
  if (recurrence === "Daily") return `Daily at ${config.time}`;
  if (recurrence === "Weekly" && config.daysOfWeek?.length) {
    const days = config.daysOfWeek.map((d) => WEEKDAY_LABELS[d]).join(", ");
    return `${days} at ${config.time}`;
  }
  if (recurrence === "Monthly" && config.daysOfMonth?.length) {
    const days = config.daysOfMonth.join(", ");
    return `Day ${days} at ${config.time}`;
  }
  return "";
}
