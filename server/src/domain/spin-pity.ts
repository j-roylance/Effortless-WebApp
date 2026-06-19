import { RewardTier, SpinOutcome } from "@prisma/client";
import {
  parseSpinOutcomeWeights,
  validateSpinOutcomeWeights,
  type SpinOutcomeWeights,
} from "./spin-odds.js";

export interface SpinLogOutcome {
  outcome: SpinOutcome;
}

export interface SpinPitySettings {
  enabled: boolean;
  oneLoss: SpinOutcomeWeights;
  maxLoss: SpinOutcomeWeights;
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

/** Legacy algorithmic pity (used to derive defaults). */
function computeAlgorithmicPityWeights(
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

/** Default pity profiles derived from base spin odds. */
export function deriveDefaultPitySettings(base: SpinOutcomeWeights): SpinPitySettings {
  return {
    enabled: true,
    oneLoss: computeAlgorithmicPityWeights(base, 1),
    maxLoss: computeAlgorithmicPityWeights(base, 2),
  };
}

/** Keep a pity profile at 100% when Step up is synced to base odds. */
export function rebalanceProfileLevelUp(
  profile: SpinOutcomeWeights,
  newLevelUp: number
): SpinOutcomeWeights {
  let { win, noReward, levelDown } = profile;
  const levelUpDelta = newLevelUp - profile.levelUp;

  if (levelUpDelta > 0) {
    let remaining = levelUpDelta;
    const pool = noReward + levelDown;
    const fromPool = Math.min(remaining, pool);
    if (fromPool > 0 && pool > 0) {
      const noTake = Math.round((fromPool * noReward) / pool);
      const downTake = fromPool - noTake;
      noReward -= noTake;
      levelDown -= downTake;
      remaining -= fromPool;
    }
    win = Math.max(0, win - remaining);
  } else if (levelUpDelta < 0) {
    win = Math.max(0, win - levelUpDelta);
  }

  const rebalanced = normalizeWeights({
    win,
    levelUp: newLevelUp,
    noReward,
    levelDown,
  });

  const total =
    rebalanced.win +
    rebalanced.levelUp +
    rebalanced.noReward +
    rebalanced.levelDown;
  if (total !== 100) {
    return normalizeWeights({
      ...rebalanced,
      win: Math.max(0, rebalanced.win + (100 - total)),
    });
  }

  return rebalanced;
}

export function syncPityLevelUp(
  base: SpinOutcomeWeights,
  pity: SpinPitySettings
): SpinPitySettings {
  return {
    ...pity,
    oneLoss: rebalanceProfileLevelUp(pity.oneLoss, base.levelUp),
    maxLoss: rebalanceProfileLevelUp(pity.maxLoss, base.levelUp),
  };
}

export function parseSpinPitySettings(
  value: unknown,
  base: SpinOutcomeWeights
): SpinPitySettings {
  const defaults = deriveDefaultPitySettings(base);
  if (!value || typeof value !== "object") return defaults;

  const o = value as Record<string, unknown>;
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : defaults.enabled,
    oneLoss: parseSpinOutcomeWeights(o.oneLoss ?? defaults.oneLoss),
    maxLoss: parseSpinOutcomeWeights(o.maxLoss ?? defaults.maxLoss),
  };
}

export function spinPitySettingsToJson(pity: SpinPitySettings): SpinPitySettings {
  return {
    enabled: pity.enabled,
    oneLoss: { ...pity.oneLoss },
    maxLoss: { ...pity.maxLoss },
  };
}

export function validateSpinPitySettings(
  base: SpinOutcomeWeights,
  pity: SpinPitySettings
): string | null {
  for (const [label, profile] of [
    ["After 1 loss", pity.oneLoss],
    ["After 2+ losses", pity.maxLoss],
  ] as const) {
    const oddsErr = validateSpinOutcomeWeights(profile);
    if (oddsErr) return `${label}: ${oddsErr}`;
    if (profile.levelUp !== base.levelUp) {
      return `${label}: Step up must match base spin odds (${base.levelUp}%)`;
    }
  }

  if (pity.oneLoss.win < base.win) {
    return "After 1 loss: Reward must be at least the base Reward %";
  }
  if (pity.maxLoss.win < pity.oneLoss.win) {
    return "After 2+ losses: Reward must be at least the 1-loss Reward %";
  }

  return null;
}

export function resolvePityWeights(
  base: SpinOutcomeWeights,
  consecutiveLosses: number,
  pity: SpinPitySettings
): SpinOutcomeWeights {
  if (!pity.enabled || consecutiveLosses <= 0) {
    return { ...base };
  }
  if (consecutiveLosses === 1) {
    return { ...pity.oneLoss };
  }
  return { ...pity.maxLoss };
}

/** Boost Reward (win) only; Step up stays fixed. Uses default algorithmic profiles. */
export function applyPityToWeights(
  base: SpinOutcomeWeights,
  consecutiveLosses: number
): SpinOutcomeWeights {
  return resolvePityWeights(
    base,
    consecutiveLosses,
    deriveDefaultPitySettings(base)
  );
}

export function effectiveWeightsForTier(
  base: SpinOutcomeWeights,
  tokenTier: RewardTier,
  recentSpins: SpinLogOutcome[],
  pity?: SpinPitySettings
): { consecutiveLosses: number; effectiveWeights: SpinOutcomeWeights } {
  const consecutiveLosses = countConsecutivePityLosses(recentSpins, tokenTier);
  const settings = pity ?? deriveDefaultPitySettings(base);
  const effectiveWeights = resolvePityWeights(base, consecutiveLosses, settings);
  return { consecutiveLosses, effectiveWeights };
}
