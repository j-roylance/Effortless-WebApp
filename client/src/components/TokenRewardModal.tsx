import { useMemo, type CSSProperties } from "react";
import { TIERS, TIER_COLORS, type RewardTier } from "../domain/tiers";

function tierIntensity(tier: RewardTier) {
  const index = Math.max(0, TIERS.indexOf(tier));
  return {
    index,
    sparkleCount: 10 + index * 5,
    ringCount: 1 + Math.floor(index / 3),
    glowScale: 1 + index * 0.08,
    burstDuration: `${2.4 + index * 0.15}s`,
  };
}

export function TokenRewardModal({
  tier,
  onClose,
}: {
  tier: RewardTier;
  onClose: () => void;
}) {
  const color = TIER_COLORS[tier];
  const intensity = tierIntensity(tier);

  const sparkles = useMemo(
    () =>
      Array.from({ length: intensity.sparkleCount }, (_, i) => {
        const angle = ((i * 137.508) % 360) * (Math.PI / 180);
        const radius = 55 + (i % 9) * 14 + intensity.index * 3;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const size = 4 + (i % 4) + Math.floor(intensity.index / 2);
        const delay = (i % 12) * 0.08;
        const duration = 1.2 + (i % 5) * 0.2 + intensity.index * 0.05;
        return { id: i, x, y, size, delay, duration };
      }),
    [intensity.sparkleCount, intensity.index]
  );

  const rings = useMemo(
    () =>
      Array.from({ length: intensity.ringCount }, (_, i) => ({
        id: i,
        delay: i * 0.35,
        scale: 1.2 + i * 0.45,
      })),
    [intensity.ringCount]
  );

  return (
    <div
      className="modal-overlay token-reward-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="token-reward-modal neon-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="token-reward-title"
        style={
          {
            "--token-color": color,
            "--token-glow": `${24 + intensity.index * 6}px`,
            "--burst-duration": intensity.burstDuration,
          } as CSSProperties
        }
      >
        <button
          type="button"
          className="token-reward-close-top icon-btn"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        <div className="token-reward-stage" aria-hidden>
          {rings.map((ring) => (
            <span
              key={ring.id}
              className="token-reward-ring"
              style={{ animationDelay: `${ring.delay}s`, ["--ring-scale" as string]: ring.scale }}
            />
          ))}

          {sparkles.map((s) => (
            <span
              key={s.id}
              className="token-reward-sparkle"
              style={{
                width: s.size,
                height: s.size,
                left: `calc(50% + ${s.x}px)`,
                top: `calc(50% + ${s.y}px)`,
                animationDelay: `${s.delay}s`,
                animationDuration: `${s.duration}s`,
              }}
            />
          ))}

          <div className="token-reward-coin">
            <span className="token-reward-coin-inner">{tier}</span>
          </div>
        </div>

        <h2 id="token-reward-title" className="token-reward-title">
          Congrats!
        </h2>
        <p className="token-reward-message">
          You got a {tier} reward token!
        </p>

        <button
          type="button"
          className="neon-btn neon-btn-primary token-reward-close-bottom"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
