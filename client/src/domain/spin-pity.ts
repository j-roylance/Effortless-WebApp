import type { SpinOutcomeWeights } from "./spin-odds";
import {
  DEFAULT_SPIN_OUTCOME_WEIGHTS,
  formatSpinOddsSummary,
  validateSpinOutcomeWeights,
} from "./spin-odds";

export interface SpinPitySettings {
  enabled: boolean;
  oneLoss: SpinOutcomeWeights;
  maxLoss: SpinOutcomeWeights;
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

export function deriveDefaultPitySettings(base: SpinOutcomeWeights): SpinPitySettings {
  return {
    enabled: true,
    oneLoss: computeAlgorithmicPityWeights(base, 1),
    maxLoss: computeAlgorithmicPityWeights(base, 2),
  };
}

function clampWeight(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseWeights(value: unknown, fallback: SpinOutcomeWeights): SpinOutcomeWeights {
  if (!value || typeof value !== "object") return { ...fallback };
  const o = value as Record<string, unknown>;
  return {
    win: clampWeight(o.win, fallback.win),
    levelUp: clampWeight(o.levelUp, fallback.levelUp),
    noReward: clampWeight(o.noReward, fallback.noReward),
    levelDown: clampWeight(o.levelDown, fallback.levelDown),
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
    oneLoss: parseWeights(o.oneLoss, defaults.oneLoss),
    maxLoss: parseWeights(o.maxLoss, defaults.maxLoss),
  };
}

export function syncPityLevelUp(
  base: SpinOutcomeWeights,
  pity: SpinPitySettings
): SpinPitySettings {
  return {
    ...pity,
    oneLoss: { ...pity.oneLoss, levelUp: base.levelUp },
    maxLoss: { ...pity.maxLoss, levelUp: base.levelUp },
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

/** Minimal pity hint when boosted; null when base odds apply. */
export function formatPityWinHint(
  baseWin: number,
  effectiveWin: number,
  consecutiveLosses: number
): string | null {
  if (consecutiveLosses <= 0 || effectiveWin <= baseWin) return null;
  if (consecutiveLosses >= 2) {
    return `${effectiveWin}% reward`;
  }
  return `${baseWin}%→${effectiveWin}%`;
}

export function pityTooltip(
  base: SpinOutcomeWeights,
  effective: SpinOutcomeWeights,
  consecutiveLosses: number
): string {
  if (consecutiveLosses <= 0) {
    return formatSpinOddsSummary(base);
  }
  const streak =
    consecutiveLosses >= 2 ? "2+ loss streak" : "1 loss streak";
  return `${streak}. ${formatSpinOddsSummary(effective)}`;
}

export const DEFAULT_SPIN_PITY_SETTINGS: SpinPitySettings = deriveDefaultPitySettings(
  DEFAULT_SPIN_OUTCOME_WEIGHTS
);
