import type { RewardTier } from "./tiers";

export type TaskRewardKind = "None" | "Token" | "Like" | "Custom";

export const TASK_REWARD_KINDS: TaskRewardKind[] = ["None", "Token", "Like", "Custom"];

export const REWARD_KIND_LABEL: Record<TaskRewardKind, string> = {
  None: "No reward",
  Token: "Token",
  Like: "Specific like",
  Custom: "Custom reward",
};

export type MilestoneReward =
  | { kind: "none" }
  | { kind: "token"; tier: RewardTier }
  | { kind: "like"; likeId: string }
  | { kind: "custom"; label: string };

export const NONE_MILESTONE_REWARD: MilestoneReward = { kind: "none" };

const TIERS: RewardTier[] = [
  "Bronze",
  "Silver",
  "Gold",
  "Diamond",
  "Platinum",
  "Royal",
  "King",
  "Emperor",
  "Planetary",
  "Stellar",
  "Galactic",
];

function isValidTier(value: string): value is RewardTier {
  return TIERS.includes(value as RewardTier);
}

export function parseMilestoneReward(value: unknown): MilestoneReward {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return NONE_MILESTONE_REWARD;
  }
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;

  if (kind === "none") return { kind: "none" };
  if (kind === "token" && typeof raw.tier === "string" && isValidTier(raw.tier)) {
    return { kind: "token", tier: raw.tier };
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

export function milestoneRewardToApi(reward: MilestoneReward): MilestoneReward {
  return reward;
}

export function rewardSummary(
  rewardKind: TaskRewardKind,
  tier: RewardTier | null,
  likeLabel: string | null | undefined,
  customRewardLabel: string | null | undefined
): string {
  if (rewardKind === "None") return "No reward";
  if (rewardKind === "Token" && tier) return `${tier} token`;
  if (rewardKind === "Like" && likeLabel) return likeLabel;
  if (rewardKind === "Custom" && customRewardLabel) return customRewardLabel;
  return "No reward";
}

/** User-facing headline for daily milestone reward modals (matches server `source`). */
export const DAILY_BONUS_HEADLINE: Record<string, string> = {
  daily_planning: "Daily Schedule Complete!",
  daily_all_musts: "All Daily Must Tasks Accomplished!",
  daily_all_do_dates: "All Daily Tasks Accomplished!",
};

export function headlineForRewardSource(source: string | undefined): string | undefined {
  if (!source) return undefined;
  return DAILY_BONUS_HEADLINE[source];
}

export type RewardQueueItem =
  | { type: "token"; tier: RewardTier; headline?: string }
  | { type: "definite"; label: string; headline?: string };
