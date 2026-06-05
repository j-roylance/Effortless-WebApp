import { useEffect, useRef, useState } from "react";
import type { RewardTier } from "../domain/tiers";
import { TIER_COLORS } from "../domain/tiers";

interface Slice {
  id: string;
  label: string;
}

export function SpinnerWheel({
  slices,
  winningIndex,
  tier,
  spinning,
  onSpinEnd,
}: {
  slices: Slice[];
  winningIndex: number;
  tier: RewardTier;
  spinning: boolean;
  onSpinEnd?: () => void;
}) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(0);
  const color = TIER_COLORS[tier];

  useEffect(() => {
    if (!spinning || slices.length === 0) return;

    const sliceAngle = 360 / slices.length;
    const targetAngle = 360 - (winningIndex * sliceAngle + sliceAngle / 2);
    const fullSpins = 5 * 360;
    const finalRotation = fullSpins + targetAngle;

    requestAnimationFrame(() => {
      setRotation(finalRotation);
    });

    const timer = setTimeout(() => {
      onSpinEnd?.();
    }, 4200);

    return () => clearTimeout(timer);
  }, [spinning, slices.length, winningIndex, onSpinEnd]);

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
      const shade = i % 2 === 0 ? "rgba(0,243,255,0.15)" : "rgba(0,0,0,0.6)";
      return `${shade} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="spinner-container">
      <div className="spinner-pointer" />
      <div
        ref={wheelRef}
        className="spinner-wheel"
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
              {slice.label.length > 14 ? `${slice.label.slice(0, 12)}…` : slice.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
