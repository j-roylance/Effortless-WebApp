import { RewardTier, SpinOutcome } from "@prisma/client";
import type { SpinOutcomeWeights } from "./spin-odds.js";

export interface SpinLogOutcome {
  outcome: SpinOutcome;
}

/** True when this spin extends the pity loss streak for the spent token tier. */
export function isPityLoss(tokenTier: RewardTier, outcome: SpinOutcome): boolean {
  if (outcome === SpinOutcome.NoReward) return true;
  if (tokenTier === RewardTier.Bronze && outcome === SpinOutcome.LevelDown) return true;
  return false;
}

/** Count consecutive pity losses from most recent spin backward. */
export function countConsecutivePityLosses(
  recentSpins: SpinLogOutcome[],
  tokenTier: RewardTier
): number {
  let count = 0;
  for (const spin of recentSpins) {
    if (isPityLoss(tokenTier, spin.outcome)) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

function normalizeWeights(weights: SpinOutcomeWeights): SpinOutcomeWeights {
  const rounded = {
    win: Math.max(0, Math.round(weights.win)),
    levelUp: Math.max(0, Math.round(weights.levelUp)),
    noReward: Math.max(0, Math.round(weights.noReward)),
    levelDown: Math.max(0, Math.round(weights.levelDown)),
  };

  let total =
    rounded.win + rounded.levelUp + rounded.noReward + rounded.levelDown;
  const fields: (keyof SpinOutcomeWeights)[] = [
    "win",
    "levelUp",
    "noReward",
    "levelDown",
  ];

  while (total !== 100) {
    const delta = 100 - total;
    const adjustable = fields.filter((key) =>
      delta > 0 ? true : rounded[key] > 0
    );
    if (adjustable.length === 0) break;
    const key = adjustable[0]!;
    rounded[key] += delta > 0 ? 1 : -1;
    total += delta > 0 ? 1 : -1;
  }

  return rounded;
}

/** Boost Reward (win) only; Step up stays fixed. */
export function applyPityToWeights(
  base: SpinOutcomeWeights,
  consecutiveLosses: number
): SpinOutcomeWeights {
  if (consecutiveLosses <= 0 || base.win <= 0) {
    return { ...base };
  }

  const levelUp = base.levelUp;

  if (consecutiveLosses >= 2) {
    return normalizeWeights({
      win: 100 - levelUp,
      levelUp,
      noReward: 0,
      levelDown: 0,
    });
  }

  const lossPool = base.noReward + base.levelDown;
  const increase = Math.min(base.win, lossPool);
  const win = base.win + increase;

  let noReward = base.noReward;
  let levelDown = base.levelDown;

  if (increase > 0 && lossPool > 0) {
    const noTake = Math.round((increase * base.noReward) / lossPool);
    const downTake = increase - noTake;
    noReward = base.noReward - noTake;
    levelDown = base.levelDown - downTake;
  }

  return normalizeWeights({ win, levelUp, noReward, levelDown });
}

export function effectiveWeightsForTier(
  base: SpinOutcomeWeights,
  tokenTier: RewardTier,
  recentSpins: SpinLogOutcome[]
): { consecutiveLosses: number; effectiveWeights: SpinOutcomeWeights } {
  const consecutiveLosses = countConsecutivePityLosses(recentSpins, tokenTier);
  const effectiveWeights = applyPityToWeights(base, consecutiveLosses);
  return { consecutiveLosses, effectiveWeights };
}
