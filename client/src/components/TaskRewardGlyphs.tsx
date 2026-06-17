import type { TaskRewardEntry } from "../api/types";
import { rewardGlyphs } from "../domain/task-rewards";

export function TaskRewardGlyphs({
  rewards,
  variant = "default",
}: {
  rewards: TaskRewardEntry[];
  variant?: "calendar" | "default";
}) {
  const glyphs = rewardGlyphs(rewards);
  if (glyphs.length === 0) return null;

  const className =
    variant === "calendar" ? "calendar-reward-glyphs" : "task-reward-glyphs";

  return (
    <span className={className} aria-hidden={false}>
      {glyphs.map((glyph, index) => (
        <span
          key={`${glyph.char}-${index}`}
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
      ))}
    </span>
  );
}
