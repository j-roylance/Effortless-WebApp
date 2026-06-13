import { useEffect, useState } from "react";
import type { UserLike } from "../api/types";
import {
  REWARD_KIND_LABEL,
  TASK_REWARD_KINDS,
  type MilestoneReward,
  type TaskRewardKind,
} from "../domain/rewards";
import { TIERS, TIER_COLORS, type RewardTier } from "../domain/tiers";

type RewardPickerValue =
  | { kind: "none" }
  | { kind: "token"; tier: RewardTier }
  | { kind: "like"; likeId: string }
  | { kind: "custom"; label: string };

export function taskToPickerValue(task: {
  rewardKind: TaskRewardKind;
  tier: RewardTier | null;
  rewardLikeId: string | null;
  customRewardLabel: string | null;
}): RewardPickerValue {
  if (task.rewardKind === "None") return { kind: "none" };
  if (task.rewardKind === "Token" && task.tier) return { kind: "token", tier: task.tier };
  if (task.rewardKind === "Like" && task.rewardLikeId) {
    return { kind: "like", likeId: task.rewardLikeId };
  }
  if (task.rewardKind === "Custom" && task.customRewardLabel) {
    return { kind: "custom", label: task.customRewardLabel };
  }
  return { kind: "token", tier: "Bronze" };
}

export function pickerToTaskFields(value: RewardPickerValue): {
  rewardKind: TaskRewardKind;
  tier: RewardTier | null;
  rewardLikeId: string | null;
  customRewardLabel: string | null;
} {
  if (value.kind === "none") {
    return {
      rewardKind: "None",
      tier: null,
      rewardLikeId: null,
      customRewardLabel: null,
    };
  }
  if (value.kind === "token") {
    return {
      rewardKind: "Token",
      tier: value.tier,
      rewardLikeId: null,
      customRewardLabel: null,
    };
  }
  if (value.kind === "like") {
    return {
      rewardKind: "Like",
      tier: null,
      rewardLikeId: value.likeId,
      customRewardLabel: null,
    };
  }
  return {
    rewardKind: "Custom",
    tier: null,
    rewardLikeId: null,
    customRewardLabel: value.label.trim(),
  };
}

function initialLikeTier(value: RewardPickerValue, likes: UserLike[]): RewardTier {
  if (value.kind === "like") {
    const like = likes.find((l) => l.id === value.likeId);
    if (like) return like.tier;
  }
  return likes[0]?.tier ?? "Bronze";
}

export function RewardPicker({
  value,
  onChange,
  likes,
  idPrefix,
}: {
  value: MilestoneReward;
  onChange: (value: MilestoneReward) => void;
  likes: UserLike[];
  idPrefix: string;
}) {
  const kind: TaskRewardKind =
    value.kind === "none"
      ? "None"
      : value.kind === "token"
        ? "Token"
        : value.kind === "like"
          ? "Like"
          : "Custom";

  const [likeTier, setLikeTier] = useState<RewardTier>(() => initialLikeTier(value, likes));

  useEffect(() => {
    if (value.kind === "like") {
      const like = likes.find((l) => l.id === value.likeId);
      if (like) setLikeTier(like.tier);
    }
  }, [value, likes]);

  function setKind(nextKind: TaskRewardKind) {
    if (nextKind === "None") onChange({ kind: "none" });
    else if (nextKind === "Token") onChange({ kind: "token", tier: "Bronze" });
    else if (nextKind === "Like") {
      const first = likes.find((l) => l.tier === likeTier) ?? likes[0];
      onChange(first ? { kind: "like", likeId: first.id } : { kind: "none" });
    } else onChange({ kind: "custom", label: "" });
  }

  const likesForTier = likes.filter((l) => l.tier === likeTier);

  return (
    <div className="reward-picker">
      <label htmlFor={`${idPrefix}-kind`} className="schedule-sub-label">
        Reward when achieved
      </label>
      <select
        id={`${idPrefix}-kind`}
        className="neon-select"
        value={kind}
        onChange={(e) => setKind(e.target.value as TaskRewardKind)}
      >
        {TASK_REWARD_KINDS.map((k) => (
          <option key={k} value={k}>
            {REWARD_KIND_LABEL[k]}
          </option>
        ))}
      </select>

      {kind === "Token" && value.kind === "token" && (
        <>
          <label htmlFor={`${idPrefix}-tier`} className="schedule-sub-label">
            Token tier
          </label>
          <select
            id={`${idPrefix}-tier`}
            className="neon-select"
            value={value.tier}
            onChange={(e) =>
              onChange({ kind: "token", tier: e.target.value as RewardTier })
            }
            style={{ borderColor: TIER_COLORS[value.tier] }}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </>
      )}

      {kind === "Like" && (
        <>
          <label htmlFor={`${idPrefix}-like-tier`} className="schedule-sub-label">
            Like tier
          </label>
          <select
            id={`${idPrefix}-like-tier`}
            className="neon-select"
            value={likeTier}
            onChange={(e) => {
              const tier = e.target.value as RewardTier;
              setLikeTier(tier);
              const first = likes.find((l) => l.tier === tier);
              if (first) onChange({ kind: "like", likeId: first.id });
            }}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label htmlFor={`${idPrefix}-like`} className="schedule-sub-label">
            Specific like
          </label>
          {likesForTier.length === 0 ? (
            <p className="schedule-hint">Add likes at this tier on the Likes tab first.</p>
          ) : (
            <select
              id={`${idPrefix}-like`}
              className="neon-select"
              value={value.kind === "like" ? value.likeId : ""}
              onChange={(e) => onChange({ kind: "like", likeId: e.target.value })}
            >
              {likesForTier.map((like) => (
                <option key={like.id} value={like.id}>
                  {like.label}
                </option>
              ))}
            </select>
          )}
        </>
      )}

      {kind === "Custom" && value.kind === "custom" && (
        <>
          <label htmlFor={`${idPrefix}-custom`} className="schedule-sub-label">
            Custom reward
          </label>
          <input
            id={`${idPrefix}-custom`}
            className="neon-input"
            value={value.label}
            onChange={(e) => onChange({ kind: "custom", label: e.target.value })}
            placeholder="e.g. 30 min gaming"
            maxLength={200}
          />
        </>
      )}
    </div>
  );
}

export type { RewardPickerValue };
