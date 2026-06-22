function LikeStat({
  keyLabel,
  value,
  className,
  title,
}: {
  keyLabel: string;
  value: number;
  className: string;
  title: string;
}) {
  return (
    <span className={className} title={title} aria-label={`${title}: ${value}`}>
      <span className="like-stat-key" aria-hidden="true">
        {keyLabel}
      </span>
      {value}
    </span>
  );
}

export function LikeUsageStepper({
  usedCount,
  availableCount,
  disabled,
  onDelta,
}: {
  usedCount: number;
  availableCount: number;
  disabled?: boolean;
  onDelta: (delta: 1 | -1) => void;
}) {
  const earnedCount = availableCount + usedCount;

  return (
    <div className="like-usage">
      <LikeStat
        keyLabel="E"
        value={earnedCount}
        className="like-usage-earned"
        title="Active earned (available + used, not expired)"
      />
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
        <LikeStat
          keyLabel="U"
          value={usedCount}
          className="like-usage-used"
          title="Active used (not expired)"
        />
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
      <LikeStat
        keyLabel="A"
        value={availableCount}
        className="like-usage-available"
        title="Available for split/combine"
      />
    </div>
  );
}
