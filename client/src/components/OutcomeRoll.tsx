import { useEffect, useRef, useState } from "react";
import { OUTCOME_ROLL_DURATION_MS } from "../domain/spin";
import {
  OUTCOME_ROLL_DISPLAY,
  OUTCOME_ROLL_ORDER,
  type SpinOutcome,
} from "../domain/tiers";

const MIN_TICK_MS = 70;
const MAX_TICK_MS = 200;

/**
 * Cosmetic dice roll: cycles through the four outcomes, then lands on the
 * server result passed in as finalOutcome.
 */
export function OutcomeRoll({
  finalOutcome,
  tierColor,
  skip,
  onComplete,
}: {
  finalOutcome: SpinOutcome;
  tierColor: string;
  skip?: boolean;
  onComplete: (skipped?: boolean) => void;
}) {
  const [displayed, setDisplayed] = useState<SpinOutcome>(OUTCOME_ROLL_ORDER[0]!);
  const [landed, setLanded] = useState(false);
  const [tick, setTick] = useState(0);

  const onCompleteRef = useRef(onComplete);
  const finishedRef = useRef(false);
  const tickTimerRef = useRef<ReturnType<typeof setTimeout>>();

  onCompleteRef.current = onComplete;

  function finish(wasSkipped = false) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
    onCompleteRef.current(wasSkipped);
  }

  function landOn(outcome: SpinOutcome, wasSkipped = false) {
    setDisplayed(outcome);
    setLanded(true);
    finish(wasSkipped);
  }

  useEffect(() => {
    finishedRef.current = false;
    setLanded(false);
    setDisplayed(OUTCOME_ROLL_ORDER[0]!);
    setTick(0);

    const startedAt = Date.now();
    let orderIndex = 0;

    function scheduleNextTick() {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= OUTCOME_ROLL_DURATION_MS) {
        landOn(finalOutcome);
        return;
      }

      orderIndex = (orderIndex + 1) % OUTCOME_ROLL_ORDER.length;
      setDisplayed(OUTCOME_ROLL_ORDER[orderIndex]!);
      setTick((n) => n + 1);

      const progress = elapsed / OUTCOME_ROLL_DURATION_MS;
      const delay = MIN_TICK_MS + progress * (MAX_TICK_MS - MIN_TICK_MS);
      tickTimerRef.current = setTimeout(scheduleNextTick, delay);
    }

    tickTimerRef.current = setTimeout(scheduleNextTick, MIN_TICK_MS);

    return () => {
      if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
    };
  }, [finalOutcome]);

  useEffect(() => {
    if (!skip || finishedRef.current) return;
    landOn(finalOutcome, true);
  }, [skip, finalOutcome]);

  const face = OUTCOME_ROLL_DISPLAY[displayed];

  return (
    <div className="outcome-roll" aria-live="polite">
      <div
        key={landed ? "landed" : tick}
        className={`outcome-roll-face${landed ? " outcome-roll-face--landed" : " outcome-roll-face--tick"}`}
        style={{ borderColor: tierColor, boxShadow: `0 0 20px ${tierColor}44` }}
      >
        <span className="outcome-roll-symbol" style={{ color: tierColor }}>
          {face.symbol}
        </span>
        <span className="outcome-roll-label">{face.label}</span>
      </div>
    </div>
  );
}
