import { useEffect, useMemo, useRef, useState } from "react";
import { WHEEL_SPIN_DURATION_MS } from "../domain/spin";
import type { RewardTier } from "../domain/tiers";
import { TIER_COLORS } from "../domain/tiers";

interface Slice {
  id: string;
  label: string;
  empty?: boolean;
}

function computeFinalRotation(sliceCount: number, winningIndex: number): number {
  const sliceAngle = 360 / sliceCount;
  const targetAngle = 360 - (winningIndex * sliceAngle + sliceAngle / 2);
  return 5 * 360 + targetAngle;
}

/** Animates a conic-gradient wheel to the slice index the server chose. */
export function SpinnerWheel({
  slices,
  winningIndex,
  tier,
  spinning,
  skip,
  onSpinEnd,
}: {
  slices: Slice[];
  winningIndex: number;
  tier: RewardTier;
  spinning: boolean;
  skip?: boolean;
  onSpinEnd?: () => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [instant, setInstant] = useState(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const finishedRef = useRef(false);
  const onSpinEndRef = useRef(onSpinEnd);
  const color = TIER_COLORS[tier];

  onSpinEndRef.current = onSpinEnd;

  const finalRotation = useMemo(
    () => (slices.length > 0 ? computeFinalRotation(slices.length, winningIndex) : 0),
    [slices.length, winningIndex]
  );

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onSpinEndRef.current?.();
  }

  useEffect(() => {
    if (!spinning || slices.length === 0) return;

    finishedRef.current = false;
    setInstant(false);
    setRotation(0);

    const startFrame = requestAnimationFrame(() => setRotation(finalRotation));
    endTimerRef.current = setTimeout(finish, WHEEL_SPIN_DURATION_MS);

    return () => {
      cancelAnimationFrame(startFrame);
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
    };
  }, [spinning, slices.length, winningIndex, finalRotation]);

  useEffect(() => {
    if (!skip || !spinning || finishedRef.current) return;

    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    setInstant(true);
    setRotation(finalRotation);
    requestAnimationFrame(finish);
  }, [skip, spinning, finalRotation]);

  if (slices.length === 0) {
    return (
      <div className="spinner-container">
        <p className="empty-state">No likes in pool</p>
      </div>
    );
  }

  const gradientStops = slices
    .map((_, i) => {
      const start = (i / slices.length) * 100;
      const end = ((i + 1) / slices.length) * 100;
      const shade = slices[i]?.empty
        ? "rgba(80,80,90,0.55)"
        : i % 2 === 0
          ? "rgba(0,243,255,0.15)"
          : "rgba(0,0,0,0.6)";
      return `${shade} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="spinner-container">
      <div className="spinner-pointer" />
      <div
        className={`spinner-wheel${instant ? " spinner-wheel--instant" : ""}`}
        style={{
          position: "relative",
          transform: `rotate(${rotation}deg)`,
          background: `conic-gradient(${gradientStops})`,
          borderColor: color,
        }}
      >
        {slices.map((slice, i) => {
          const angle = (360 / slices.length) * i + 360 / slices.length / 2;
          return (
            <span
              key={slice.id}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `rotate(${angle}deg) translateY(-95px) rotate(-${angle}deg)`,
                transformOrigin: "0 0",
                width: "100px",
                marginLeft: "-50px",
                textAlign: "center",
                fontSize: "0.65rem",
                color: "var(--text)",
                pointerEvents: "none",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {slice.empty
                ? "Empty"
                : slice.label.length > 14
                  ? `${slice.label.slice(0, 12)}…`
                  : slice.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
