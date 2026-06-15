export function LikeUsageStepper({
  rewardedCount,
  usedCount,
  disabled,
  onDelta,
}: {
  rewardedCount: number;
  usedCount: number;
  disabled?: boolean;
  onDelta: (delta: 1 | -1) => void;
}) {
  return (
    <div className="like-usage">
      <span className="like-usage-rewarded" title="Earned this period">
        {rewardedCount}
      </span>
      <div className="like-usage-stepper">
        <button
          type="button"
          className="like-usage-btn"
          aria-label="Decrease used count"
          disabled={disabled || usedCount <= 0}
          onClick={() => onDelta(-1)}
        >
          −
        </button>
        <span className="like-usage-used" title="Used this period">
          {usedCount}
        </span>
        <button
          type="button"
          className="like-usage-btn"
          aria-label="Increase used count"
          disabled={disabled}
          onClick={() => onDelta(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
