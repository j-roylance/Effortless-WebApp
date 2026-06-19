import type { SpinOutcomeWeights } from "./spin-odds";
import { formatSpinOddsSummary } from "./spin-odds";

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
    consecutiveLosses >= 2
      ? "2+ losses — reward maxed"
      : "1 loss — reward doubled";
  return `${streak}. ${formatSpinOddsSummary(effective)}`;
}
