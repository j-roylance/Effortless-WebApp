import type { RewardTier } from "./tiers";

export type OptionalRewardTier = RewardTier | "None";

export interface DailySettings {
  planningRewardTier: OptionalRewardTier;
  allMustsRewardTier: OptionalRewardTier;
  allDoDatesRewardTier: OptionalRewardTier;
}

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
