import type { RewardTier, SpinPityStatus, TaskRewardEntry } from "../api/types";
import type { SpinOutcomeWeights } from "../domain/spin-odds";
import { rewardGlyphs } from "../domain/task-rewards";
import { SpinPityHintForTier } from "./SpinPityHint";

export function TaskRewardGlyphs({
  rewards,
  variant = "default",
  pityByTier,
  baseSpinWeights,
}: {
  rewards: TaskRewardEntry[];
  variant?: "calendar" | "default";
  pityByTier?: Record<RewardTier, SpinPityStatus>;
  baseSpinWeights?: SpinOutcomeWeights;
}) {
  const glyphs = rewardGlyphs(rewards);
  if (glyphs.length === 0) return null;

  const className =
    variant === "calendar" ? "calendar-reward-glyphs" : "task-reward-glyphs";

  return (
    <span className={className} aria-hidden={false}>
      {glyphs.map((glyph, index) => {
        const glyphEl = (
          <span
            className={
              variant === "calendar"
                ? `calendar-reward-glyph${glyph.color ? " calendar-reward-glyph--tier" : ""}`
                : "task-reward-glyph"
            }
            title={glyph.title}
            aria-label={glyph.title}
            style={glyph.color ? { borderColor: glyph.color } : undefined}
          >
            {glyph.char}
          </span>
        );

        if (glyph.tier && pityByTier && baseSpinWeights) {
          return (
            <span key={`${glyph.char}-${index}`} className="task-reward-token">
              {glyphEl}
              <SpinPityHintForTier
                tier={glyph.tier}
                pityByTier={pityByTier}
                baseWeights={baseSpinWeights}
              />
            </span>
          );
        }

        return (
          <span key={`${glyph.char}-${index}`}>
            {glyphEl}
          </span>
        );
      })}
    </span>
  );
}
