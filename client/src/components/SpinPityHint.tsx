import type { RewardTier, SpinPityStatus } from "../api/types";
import type { SpinOutcomeWeights } from "../domain/spin-odds";
import { formatPityWinHint, pityTooltip } from "../domain/spin-pity";

export function SpinPityHint({
  pity,
  baseWeights,
}: {
  pity: SpinPityStatus | undefined;
  baseWeights: SpinOutcomeWeights;
}) {
  if (!pity) return null;

  const resolvedBase = pity.baseWeights ?? baseWeights;
  const hint = formatPityWinHint(
    resolvedBase.win,
    pity.effectiveWeights.win,
    pity.consecutiveLosses
  );
  if (!hint) return null;

  return (
    <span
      className="spin-pity-hint"
      title={pityTooltip(resolvedBase, pity.effectiveWeights, pity.consecutiveLosses)}
    >
      {hint}
    </span>
  );
}

export function SpinPityHintForTier({
  tier,
  pityByTier,
  baseWeights,
}: {
  tier: RewardTier;
  pityByTier: Record<RewardTier, SpinPityStatus> | undefined;
  baseWeights: SpinOutcomeWeights;
}) {
  return <SpinPityHint pity={pityByTier?.[tier]} baseWeights={baseWeights} />;
}
