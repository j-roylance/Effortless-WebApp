import type { SpinOutcomeWeights } from "../domain/spin-odds";
import type { SpinPitySettings } from "../domain/spin-pity";
import { SpinOddsEditor } from "./SpinOddsEditor";

export function SpinPityEditor({
  value,
  baseLevelUp,
  baseWin,
  onChange,
}: {
  value: SpinPitySettings;
  baseLevelUp: number;
  baseWin: number;
  onChange: (value: SpinPitySettings) => void;
}) {
  function updateProfile(
    key: "oneLoss" | "maxLoss",
    profile: SpinOutcomeWeights
  ) {
    onChange({ ...value, [key]: profile });
  }

  return (
    <div className="spin-pity-editor">
      <label className="spin-pity-enable">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        <span>Enable pity odds</span>
      </label>

      {value.enabled && (
        <>
          <div className="spin-pity-profile">
            <h4 className="spin-pity-profile-title">After 1 loss</h4>
            <SpinOddsEditor
              value={value.oneLoss}
              onChange={(profile) => updateProfile("oneLoss", profile)}
              lockedLevelUp={baseLevelUp}
            />
            {value.oneLoss.win < baseWin && (
              <p className="spin-pity-warning">
                Reward should be at least {baseWin}% (base).
              </p>
            )}
          </div>

          <div className="spin-pity-profile">
            <h4 className="spin-pity-profile-title">After 2+ losses</h4>
            <SpinOddsEditor
              value={value.maxLoss}
              onChange={(profile) => updateProfile("maxLoss", profile)}
              lockedLevelUp={baseLevelUp}
            />
            {value.maxLoss.win < value.oneLoss.win && (
              <p className="spin-pity-warning">
                Reward should be at least {value.oneLoss.win}% (1-loss profile).
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
