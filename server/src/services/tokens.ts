import type { RewardTier } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { TIERS } from "../domain/tiers.js";

export async function getTokenBalances(userId: string): Promise<Record<RewardTier, number>> {
  const rows = await prisma.rewardToken.groupBy({
    by: ["tier"],
    where: { userId, spentAt: null },
    _count: { _all: true },
  });

  const balances = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<RewardTier, number>;
  for (const row of rows) {
    balances[row.tier] = row._count._all;
  }
  return balances;
}
