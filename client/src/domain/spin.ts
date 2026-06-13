import type { SpinResult } from "../api/types";

/** Pause on the revealed outcome label before the like wheel starts. */
export const OUTCOME_REVEAL_MS = 300;

/** Duration of the client-side outcome dice roll (server result is already known). */
export const OUTCOME_ROLL_DURATION_MS = 1200;

/** CSS wheel spin duration; keep in sync with SpinnerWheel timer. */
export const WHEEL_SPIN_DURATION_MS = 4200;

/** True when the server picked a like and returned wheel slices to animate. */
export function spinNeedsLikeWheel(result: SpinResult): boolean {
  return (
    (result.outcome === "Win" ||
      result.outcome === "LevelUp" ||
      result.outcome === "LevelDown") &&
    result.spinnerLikes.length > 0
  );
}
