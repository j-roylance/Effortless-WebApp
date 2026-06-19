import {
  SPIN_ODDS_FIELDS,
  spinOddsTotal,
  type SpinOutcomeWeights,
} from "../domain/spin-odds";

export function SpinOddsEditor({
  value,
  onChange,
  lockedLevelUp,
}: {
  value: SpinOutcomeWeights;
  onChange: (value: SpinOutcomeWeights) => void;
  lockedLevelUp?: number;
}) {
  const total = spinOddsTotal(value);
  const totalValid = total === 100;

  function updateField(key: keyof SpinOutcomeWeights, raw: string) {
    if (key === "levelUp" && lockedLevelUp !== undefined) return;
    const parsed = raw === "" ? 0 : Number.parseInt(raw, 10);
    const next = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="spin-odds-editor">
      {SPIN_ODDS_FIELDS.map((field) => {
        const isLocked = field.key === "levelUp" && lockedLevelUp !== undefined;
        const displayValue = isLocked ? lockedLevelUp : value[field.key];

        return (
          <label key={field.key} className="spin-odds-row">
            <span className="spin-odds-row-label">
              <span className="spin-odds-row-title">{field.label}</span>
              <span className="spin-odds-row-desc">
                {isLocked ? "Same as base spin odds." : field.description}
              </span>
            </span>
            <span className="spin-odds-input-wrap">
              <input
                type="number"
                className={`neon-input spin-odds-input${isLocked ? " spin-odds-input--locked" : ""}`}
                min={0}
                max={100}
                step={1}
                value={displayValue}
                readOnly={isLocked}
                disabled={isLocked}
                onChange={(e) => updateField(field.key, e.target.value)}
                aria-label={`${field.label} odds percent`}
              />
              <span className="spin-odds-suffix">%</span>
            </span>
          </label>
        );
      })}
      <p
        className={`spin-odds-total${totalValid ? "" : " spin-odds-total--invalid"}`}
        aria-live="polite"
      >
        Total: {total}% {totalValid ? "" : "(must equal 100%)"}
      </p>
    </div>
  );
}
