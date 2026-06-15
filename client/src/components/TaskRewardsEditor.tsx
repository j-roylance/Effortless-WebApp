import type { UserLike } from "../api/types";
import type { MilestoneReward } from "../domain/rewards";
import { RewardPicker } from "./RewardPicker";

export function taskToRewardsList(task: {
  rewards?: MilestoneReward[];
  rewardKind: string;
  tier: string | null;
  rewardLikeId: string | null;
  customRewardLabel: string | null;
}): MilestoneReward[] {
  if (task.rewards && task.rewards.length > 0) {
    return task.rewards;
  }
  if (task.rewardKind === "None") return [];
  if (task.rewardKind === "Token" && task.tier) return [{ kind: "token", tier: task.tier }];
  if (task.rewardKind === "Like" && task.rewardLikeId) {
    return [{ kind: "like", likeId: task.rewardLikeId }];
  }
  if (task.rewardKind === "Custom" && task.customRewardLabel) {
    return [{ kind: "custom", label: task.customRewardLabel }];
  }
  return [];
}

export function TaskRewardsEditor({
  rewards,
  onChange,
  likes,
  idPrefix,
}: {
  rewards: MilestoneReward[];
  onChange: (rewards: MilestoneReward[]) => void;
  likes: UserLike[];
  idPrefix: string;
}) {
  function updateReward(index: number, value: MilestoneReward) {
    const next = [...rewards];
    next[index] = value;
    onChange(next);
  }

  function removeReward(index: number) {
    onChange(rewards.filter((_, i) => i !== index));
  }

  function addReward() {
    onChange([...rewards, { kind: "token", tier: "Bronze" }]);
  }

  return (
    <div className="task-rewards-editor">
      <div className="task-rewards-editor-header">
        <span className="schedule-sub-label">Rewards when achieved</span>
        <button
          type="button"
          className="icon-btn task-rewards-add-btn"
          aria-label="Add reward"
          title="Add reward"
          onClick={addReward}
        >
          +
        </button>
      </div>

      {rewards.length === 0 ? (
        <p className="schedule-hint">No rewards. Tap + to add one.</p>
      ) : (
        <ul className="task-rewards-list">
          {rewards.map((reward, index) => (
            <li key={`${idPrefix}-reward-${index}`} className="task-rewards-row">
              <RewardPicker
                idPrefix={`${idPrefix}-${index}`}
                value={reward}
                onChange={(value) => updateReward(index, value)}
                likes={likes}
              />
              <button
                type="button"
                className="icon-btn task-rewards-remove-btn"
                aria-label="Remove reward"
                onClick={() => removeReward(index)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
