import { RewardTier, TaskRewardKind } from "@prisma/client";
import { isValidTier } from "./tiers.js";

export type MilestoneReward =
  | { kind: "none" }
  | { kind: "token"; tier: RewardTier }
  | { kind: "like"; likeId: string }
  | { kind: "custom"; label: string };

export const NONE_MILESTONE_REWARD: MilestoneReward = { kind: "none" };

export function parseMilestoneReward(value: unknown): MilestoneReward {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return NONE_MILESTONE_REWARD;
  }
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;

  if (kind === "none") return { kind: "none" };
  if (kind === "token" && typeof raw.tier === "string" && isValidTier(raw.tier)) {
    return { kind: "token", tier: raw.tier as RewardTier };
  }
  if (kind === "like" && typeof raw.likeId === "string" && raw.likeId.length > 0) {
    return { kind: "like", likeId: raw.likeId };
  }
  if (kind === "custom" && typeof raw.label === "string") {
    const label = raw.label.trim();
    if (label.length > 0 && label.length <= 200) {
      return { kind: "custom", label };
    }
  }
  return NONE_MILESTONE_REWARD;
}

export function milestoneRewardToJson(
  reward: MilestoneReward
): Record<string, string> | { kind: "none" } {
  if (reward.kind === "none") return { kind: "none" };
  if (reward.kind === "token") return { kind: "token", tier: reward.tier };
  if (reward.kind === "like") return { kind: "like", likeId: reward.likeId };
  return { kind: "custom", label: reward.label };
}

export interface TaskRewardInput {
  rewardKind: TaskRewardKind;
  tier: RewardTier | null;
  rewardLikeId: string | null;
  customRewardLabel: string | null;
}

export function normalizeTaskRewardInput(input: Partial<TaskRewardInput>): TaskRewardInput {
  const rewardKind = input.rewardKind ?? TaskRewardKind.Token;
  return {
    rewardKind,
    tier: input.tier ?? null,
    rewardLikeId: input.rewardLikeId ?? null,
    customRewardLabel: input.customRewardLabel?.trim() || null,
  };
}

export function validateTaskRewardFields(reward: TaskRewardInput): string | null {
  if (reward.rewardKind === TaskRewardKind.None) {
    return null;
  }
  if (reward.rewardKind === TaskRewardKind.Token) {
    if (!reward.tier) return "Token reward requires a tier";
    return null;
  }
  if (reward.rewardKind === TaskRewardKind.Like) {
    if (!reward.rewardLikeId) return "Like reward requires selecting a like";
    return null;
  }
  if (reward.rewardKind === TaskRewardKind.Custom) {
    if (!reward.customRewardLabel) return "Custom reward requires a label";
    if (reward.customRewardLabel.length > 200) {
      return "Custom reward label must be 200 characters or less";
    }
    return null;
  }
  return "Invalid reward kind";
}

export async function validateTaskRewardLike(
  userId: string,
  likeId: string,
  findLike: (id: string) => Promise<{ userId: string } | null>
): Promise<string | null> {
  const like = await findLike(likeId);
  if (!like || like.userId !== userId) {
    return "Selected like not found";
  }
  return null;
}

export function taskRewardStorageFields(reward: TaskRewardInput): {
  rewardKind: TaskRewardKind;
  tier: RewardTier | null;
  rewardLikeId: string | null;
  customRewardLabel: string | null;
} {
  if (reward.rewardKind === TaskRewardKind.None) {
    return {
      rewardKind: TaskRewardKind.None,
      tier: null,
      rewardLikeId: null,
      customRewardLabel: null,
    };
  }
  if (reward.rewardKind === TaskRewardKind.Token) {
    return {
      rewardKind: TaskRewardKind.Token,
      tier: reward.tier,
      rewardLikeId: null,
      customRewardLabel: null,
    };
  }
  if (reward.rewardKind === TaskRewardKind.Like) {
    return {
      rewardKind: TaskRewardKind.Like,
      tier: null,
      rewardLikeId: reward.rewardLikeId,
      customRewardLabel: null,
    };
  }
  return {
    rewardKind: TaskRewardKind.Custom,
    tier: null,
    rewardLikeId: null,
    customRewardLabel: reward.customRewardLabel,
  };
}

export type RewardGrant =
  | { type: "none" }
  | { type: "token"; tier: RewardTier }
  | { type: "definite"; label: string };

export function resolveMilestoneRewardGrant(reward: MilestoneReward): RewardGrant {
  if (reward.kind === "none") return { type: "none" };
  if (reward.kind === "token") return { type: "token", tier: reward.tier };
  if (reward.kind === "like") return { type: "definite", label: "" };
  return { type: "definite", label: reward.label };
}

export function resolveTaskRewardGrant(
  rewardKind: TaskRewardKind,
  tier: RewardTier | null,
  likeLabel: string | null,
  customRewardLabel: string | null
): RewardGrant {
  if (rewardKind === TaskRewardKind.None) return { type: "none" };
  if (rewardKind === TaskRewardKind.Token && tier) {
    return { type: "token", tier };
  }
  if (rewardKind === TaskRewardKind.Like && likeLabel) {
    return { type: "definite", label: likeLabel };
  }
  if (rewardKind === TaskRewardKind.Custom && customRewardLabel) {
    return { type: "definite", label: customRewardLabel };
  }
  return { type: "none" };
}

export function rewardSummary(
  rewardKind: TaskRewardKind,
  tier: RewardTier | null,
  likeLabel: string | null,
  customRewardLabel: string | null
): string {
  if (rewardKind === TaskRewardKind.None) return "No reward";
  if (rewardKind === TaskRewardKind.Token && tier) return `${tier} token`;
  if (rewardKind === TaskRewardKind.Like && likeLabel) return likeLabel;
  if (rewardKind === TaskRewardKind.Custom && customRewardLabel) {
    return customRewardLabel;
  }
  return "No reward";
}
