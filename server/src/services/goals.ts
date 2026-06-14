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

/** Append new goal at the end of the chain (highest sortOrder). */
export async function createGoalPenultimate(
  tx: Tx,
  userId: string,
  visionId: string,
  name: string,
  parentGoalId: string | null = null
): Promise<Goal> {
  const last = await tx.goal.findFirst({
    where: { visionId, userId, parentGoalId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return tx.goal.create({
    data: {
      userId,
      visionId,
      name,
      sortOrder: last ? last.sortOrder + 1 : 0,
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
