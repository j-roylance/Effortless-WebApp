/**
 * Tier names and UI labels. Must match server tier order in server/src/domain/tiers.ts.
 */
export type RewardTier =
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Diamond"
  | "Platinum"
  | "Royal"
  | "King"
  | "Emperor"
  | "Planetary"
  | "Stellar"
  | "Galactic";

export const TIERS: RewardTier[] = [
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

export const TIER_FREQUENCY_LABEL: Record<RewardTier, string> = {
  Bronze: "20× per day",
  Silver: "10× per day",
  Gold: "5× per day",
  Diamond: "2× per day",
  Platinum: "1× per day",
  Royal: "2× per week",
  King: "1× per week",
  Emperor: "2× per month",
  Planetary: "1× per month",
  Stellar: "2× per year",
  Galactic: "1× per year",
};

export const TIER_COLORS: Record<RewardTier, string> = {
  Bronze: "#cd7f32",
  Silver: "#c0c0c0",
  Gold: "#ffd700",
  Diamond: "#b9f2ff",
  Platinum: "#e5e4e2",
  Royal: "#9b59b6",
  King: "#e74c3c",
  Emperor: "#f39c12",
  Planetary: "#1abc9c",
  Stellar: "#3498db",
  Galactic: "#e056fd",
};

export type SpinOutcome = "Win" | "LevelUp" | "NoReward" | "LevelDown";

export const OUTCOME_LABELS: Record<SpinOutcome, string> = {
  Win: "You won!",
  LevelUp: "Level up!",
  NoReward: "Nothing",
  LevelDown: "Step down",
};

export const OUTCOME_ROLL_ORDER: SpinOutcome[] = [
  "Win",
  "LevelUp",
  "NoReward",
  "LevelDown",
];

/** Short labels + symbols for the outcome dice roll animation. */
export const OUTCOME_ROLL_DISPLAY: Record<
  SpinOutcome,
  { label: string; symbol: string }
> = {
  Win: { label: "Reward", symbol: "★" },
  LevelUp: { label: "Step up", symbol: "↑" },
  NoReward: { label: "None", symbol: "—" },
  LevelDown: { label: "Step down", symbol: "↓" },
};
