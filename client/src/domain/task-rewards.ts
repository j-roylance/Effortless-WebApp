import type { TaskRewardEntry } from "../api/types";
import { TIER_COLORS, type RewardTier } from "./tiers";

export type RewardGlyph = { char: string; title: string; color?: string };

export function rewardGlyphs(rewards: TaskRewardEntry[]): RewardGlyph[] {
  return rewards.map((reward) => {
    if (reward.kind === "token") {
      return {
        char: reward.tier[0]!,
        color: TIER_COLORS[reward.tier],
        title: `${reward.tier} token`,
      };
    }
    if (reward.kind === "like") {
      const label = reward.likeLabel ?? "Like";
      return {
        char: label[0]!.toUpperCase(),
        title: reward.likeLabel ?? "Like reward",
      };
    }
    return {
      char: "C",
      title: reward.label,
    };
  });
}

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
