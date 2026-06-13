import type { TaskRewardKind, MilestoneReward } from "./rewards";
import type { RewardTier } from "./tiers";

export type { MilestoneReward } from "./rewards";
export { NONE_MILESTONE_REWARD, parseMilestoneReward } from "./rewards";

export interface DailySettings {
  planningReward: MilestoneReward;
  allMustsReward: MilestoneReward;
  allDoDatesReward: MilestoneReward;
}

export const DEFAULT_DAILY_SETTINGS: DailySettings = {
  planningReward: { kind: "none" },
  allMustsReward: { kind: "none" },
  allDoDatesReward: { kind: "none" },
};

export type OptionalRewardTier = RewardTier | "None";

export const OPTIONAL_TIER_OPTIONS: OptionalRewardTier[] = [
  "None",
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

export function milestoneRewardFromLegacyTier(tier: OptionalRewardTier): MilestoneReward {
  if (tier === "None") return { kind: "none" };
  return { kind: "token", tier };
}

export function taskRewardKindFromApi(value: string): TaskRewardKind {
  if (value === "None" || value === "Token" || value === "Like" || value === "Custom") {
    return value;
  }
  return "Token";
}
