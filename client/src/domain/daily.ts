import type { TaskRewardKind, MilestoneReward } from "./rewards";
import type { RewardTier } from "./tiers";
import {
  DEFAULT_SPIN_OUTCOME_WEIGHTS,
  type SpinOutcomeWeights,
} from "./spin-odds";
import {
  deriveDefaultPitySettings,
  type SpinPitySettings,
} from "./spin-pity";

export type { MilestoneReward } from "./rewards";
export { NONE_MILESTONE_REWARD, parseMilestoneReward } from "./rewards";
export type { SpinOutcomeWeights } from "./spin-odds";
export type { SpinPitySettings } from "./spin-pity";
export { deriveDefaultPitySettings, syncPityLevelUp } from "./spin-pity";

export interface DailySettings {
  planningReward: MilestoneReward;
  allMustsReward: MilestoneReward;
  allDoDatesReward: MilestoneReward;
  spinOutcomeWeights: SpinOutcomeWeights;
  spinPitySettings: SpinPitySettings;
}

export const DEFAULT_DAILY_SETTINGS: DailySettings = {
  planningReward: { kind: "none" },
  allMustsReward: { kind: "none" },
  allDoDatesReward: { kind: "none" },
  spinOutcomeWeights: { ...DEFAULT_SPIN_OUTCOME_WEIGHTS },
  spinPitySettings: deriveDefaultPitySettings(DEFAULT_SPIN_OUTCOME_WEIGHTS),
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
