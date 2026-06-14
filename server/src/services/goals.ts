import type { Goal, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type Tx = Prisma.TransactionClient;

export function serializeGoal(goal: Goal) {
  return {
    id: goal.id,
    visionId: goal.visionId,
    name: goal.name,
    sortOrder: goal.sortOrder,
    completedAt: goal.completedAt?.toISOString() ?? null,
    createdAt: goal.createdAt.toISOString(),
    parentGoalId: goal.parentGoalId ?? null,
  };
}

/** Insert new goal immediately before the furthest goal in the chain. */
export async function createGoalPenultimate(
  tx: Tx,
  userId: string,
  visionId: string,
  name: string,
  parentGoalId: string | null = null
): Promise<Goal> {
  const furthest = await tx.goal.findFirst({
    where: { visionId, userId, parentGoalId },
    orderBy: { sortOrder: "desc" },
  });

  if (!furthest) {
    return tx.goal.create({
      data: { userId, visionId, name, sortOrder: 0, parentGoalId },
    });
  }

  await tx.goal.update({
    where: { id: furthest.id },
    data: { sortOrder: furthest.sortOrder + 1 },
  });

  return tx.goal.create({
    data: {
      userId,
      visionId,
      name,
      sortOrder: furthest.sortOrder,
      parentGoalId,
    },
  });
}

export async function nextVisionSortOrder(userId: string): Promise<number> {
  const count = await prisma.vision.count({
    where: { userId, archivedAt: null },
  });
  return count;
}
