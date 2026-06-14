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

/** Insert new goal immediately before an existing sibling in the chain. */
export async function insertGoalBefore(
  tx: Tx,
  userId: string,
  visionId: string,
  name: string,
  insertBeforeGoalId: string
): Promise<Goal> {
  const anchor = await tx.goal.findFirst({
    where: { id: insertBeforeGoalId, visionId, userId },
  });
  if (!anchor) throw new Error("Goal not found");

  await tx.goal.updateMany({
    where: {
      visionId,
      userId,
      parentGoalId: anchor.parentGoalId,
      sortOrder: { gte: anchor.sortOrder },
    },
    data: { sortOrder: { increment: 1 } },
  });

  return tx.goal.create({
    data: {
      userId,
      visionId,
      name,
      sortOrder: anchor.sortOrder,
      parentGoalId: anchor.parentGoalId,
    },
  });
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
