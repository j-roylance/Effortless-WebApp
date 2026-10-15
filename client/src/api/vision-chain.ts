import { api } from "./client";
import type { Goal, Vision, VisionWithGoals } from "./types";

/** Query for one level of a vision chain: top-level goals, or a goal's sub-goals when goalId is set. */
export function visionChainQuery(visionId: string, goalId: string | null) {
  return {
    queryKey: ["vision-goals", visionId, goalId ?? "root"] as const,
    queryFn: () =>
      api<VisionWithGoals>(
        goalId
          ? `/visions/${visionId}/goals?focus=${encodeURIComponent(goalId)}`
          : `/visions/${visionId}/goals`
      ),
  };
}

export function createVision(name: string) {
  return api<Vision>("/visions", { method: "POST", body: JSON.stringify({ name }) });
}

/** Adds goals in order at the end of the chain level (each one an earlier step than the last). */
export async function appendGoals(
  visionId: string,
  parentGoalId: string | null,
  names: string[]
): Promise<Goal[]> {
  const created: Goal[] = [];
  for (const name of names) {
    created.push(
      await api<Goal>(`/visions/${visionId}/goals`, {
        method: "POST",
        body: JSON.stringify({ name, ...(parentGoalId ? { parentGoalId } : {}) }),
      })
    );
  }
  return created;
}
