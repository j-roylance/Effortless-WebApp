import { SpinOutcome } from "@prisma/client";

export interface SpinOutcomeWeights {
  win: number;
  levelUp: number;
  noReward: number;
  levelDown: number;
}

export const DEFAULT_SPIN_OUTCOME_WEIGHTS: SpinOutcomeWeights = {
  win: 25,
  levelUp: 25,
  noReward: 25,
  levelDown: 25,
};

export function parseSpinOutcomeWeights(value: unknown): SpinOutcomeWeights {
  if (!value || typeof value !== "object") return { ...DEFAULT_SPIN_OUTCOME_WEIGHTS };
  const o = value as Record<string, unknown>;
  return {
    win: clampWeight(o.win, DEFAULT_SPIN_OUTCOME_WEIGHTS.win),
    levelUp: clampWeight(o.levelUp, DEFAULT_SPIN_OUTCOME_WEIGHTS.levelUp),
    noReward: clampWeight(o.noReward, DEFAULT_SPIN_OUTCOME_WEIGHTS.noReward),
    levelDown: clampWeight(o.levelDown, DEFAULT_SPIN_OUTCOME_WEIGHTS.levelDown),
  };
}

function clampWeight(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function spinOutcomeWeightsToJson(weights: SpinOutcomeWeights): SpinOutcomeWeights {
  return {
    win: weights.win,
    levelUp: weights.levelUp,
    noReward: weights.noReward,
    levelDown: weights.levelDown,
  };
}

export function validateSpinOutcomeWeights(weights: SpinOutcomeWeights): string | null {
  const fields: (keyof SpinOutcomeWeights)[] = ["win", "levelUp", "noReward", "levelDown"];
  for (const key of fields) {
    const value = weights[key];
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      return "Spin odds must be whole numbers from 0 to 100";
    }
  }
  const total = weights.win + weights.levelUp + weights.noReward + weights.levelDown;
  if (total !== 100) {
    return `Spin odds must add up to 100% (currently ${total}%)`;
  }
  return null;
}

export function rollWeightedOutcome(weights: SpinOutcomeWeights): SpinOutcome {
  const entries: [SpinOutcome, number][] = [
    [SpinOutcome.Win, weights.win],
    [SpinOutcome.LevelUp, weights.levelUp],
    [SpinOutcome.NoReward, weights.noReward],
    [SpinOutcome.LevelDown, weights.levelDown],
  ];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return SpinOutcome.NoReward;

  let roll = Math.random() * total;
  for (const [outcome, weight] of entries) {
    roll -= weight;
    if (roll < 0) return outcome;
  }
  return entries[entries.length - 1]![0];
}
