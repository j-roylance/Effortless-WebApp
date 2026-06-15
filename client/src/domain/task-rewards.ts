import type { TaskRewardEntry } from "../api/types";
import type { RewardTier } from "./tiers";

export function rewardSummaries(rewards: TaskRewardEntry[]): string[] {
  return rewards.map((reward) => {
    if (reward.kind === "token") return `${reward.tier} token`;
    if (reward.kind === "like") return reward.likeLabel ?? "Like reward";
    return reward.label;
  });
}

export function tokenTiersFromTaskRewards(rewards: TaskRewardEntry[]): RewardTier[] {
  return rewards
    .filter((reward): reward is { kind: "token"; tier: RewardTier } => reward.kind === "token")
    .map((reward) => reward.tier);
}
