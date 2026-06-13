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

export const SPIN_ODDS_FIELDS: {
  key: keyof SpinOutcomeWeights;
  label: string;
  description: string;
}[] = [
  {
    key: "win",
    label: "Reward",
    description: "Spin for a like at the token tier you spent.",
  },
  {
    key: "levelUp",
    label: "Step up",
    description: "Spin for a like one tier higher (no extra token).",
  },
  {
    key: "noReward",
    label: "None",
    description: "No like this spin.",
  },
  {
    key: "levelDown",
    label: "Step down",
    description: "Spin for a like one tier lower (Bronze gives nothing).",
  },
];

export function spinOddsTotal(weights: SpinOutcomeWeights): number {
  return weights.win + weights.levelUp + weights.noReward + weights.levelDown;
}

export function formatSpinOddsSummary(weights: SpinOutcomeWeights): string {
  return `${weights.win}% reward · ${weights.levelUp}% step up · ${weights.noReward}% none · ${weights.levelDown}% step down`;
}

export function validateSpinOutcomeWeights(weights: SpinOutcomeWeights): string | null {
  const fields: (keyof SpinOutcomeWeights)[] = ["win", "levelUp", "noReward", "levelDown"];
  for (const key of fields) {
    const value = weights[key];
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      return "Spin odds must be whole numbers from 0 to 100";
    }
  }
  const total = spinOddsTotal(weights);
  if (total !== 100) {
    return `Spin odds must add up to 100% (currently ${total}%)`;
  }
  return null;
}
