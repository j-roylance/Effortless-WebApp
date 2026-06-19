/**
 * Effortless account backup format. Import reads `version` + `data` only;
 * `aiRecoveryGuide` and other metadata are ignored on upload.
 */
export const BACKUP_FORMAT = "effortless-backup";
export const BACKUP_VERSION = 2;

export const AI_RECOVERY_GUIDE = `Effortless account backup — AI recovery guide

This file is a full export of one user's app data from Effortless (habit/task rewards app).
The product UI/API names differ from Prisma database model names.

FORMAT
- format: must be "effortless-backup"
- version: integer schema version (currently 1)
- exportedAt: ISO timestamp when the export was created
- account.email: informational only; not restored on import
- data: object containing all restorable tables (see below)

GLOSSARY (UI name → data key → DB model)
- Task → data.tasks → Habit
- Like (prize string per tier) → data.likes → UserReward
- Token (spin currency) → data.tokens → RewardToken
- Vision → data.visions → Vision
- Goal (chain step) → data.goals → Goal (parentGoalId for nested sub-goals)
- Daily settings → data.dailySettings → DailySettings (single row)
- Wheel odds per tier → data.wheelConfigs → TierWheelConfig
- Spin history → data.spinLogs → SpinLog (rewardId links to a like id when won)
- Like usage counters → data.likeUsedCounts → LikeUsedCount (per like, per bucketKey period)
- Tier like resets → data.tierLikeResets → TierLikeReset
- Like grants from tasks/dailies → data.likeGrantLogs → LikeGrantLog
- Like split/combine ledger → data.likeCreditLedger → LikeCreditLedger
- Like credits (usable instances) → data.likeCredits → LikeCredit
- Daily bonus claims → data.dailyBonusClaims → DailyBonusClaim

TASK REWARDS
- Legacy single reward: rewardKind, tier, rewardLikeId, customRewardLabel on each task
- Multiple rewards: taskRewards JSON array of { kind: "token"|"like"|"custom", tier?, likeId?, label? }
- rewardLikeId / likeId values must match an id in data.likes

REWARD TIERS (low → high)
Bronze, Silver, Gold, Diamond, Platinum, Royal, King, Emperor, Planetary, Stellar, Galactic

IMPORT ORDER (if rebuilding manually)
1. likes (UserReward)
2. visions
3. goals (parents before children via parentGoalId)
4. tasks (Habit) — after likes for rewardLikeId FK
5. dailySettings, wheelConfigs
6. tokens, spinLogs, likeUsedCounts, tierLikeResets, likeGrantLogs, likeCreditLedger, likeCredits, dailyBonusClaims

DATES: all *At fields are ISO-8601 UTC strings.
ENUMS: stored as strings matching Prisma enum names (e.g. TaskSection: Must, Should, Could).

To restore: assign a new userId to every row, preserve original ids for internal FK references,
and insert in the order above. Do not import password or auth credentials from this file.`;

export interface AccountBackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  aiRecoveryGuide: string;
  account: { email: string };
  data: AccountBackupData;
}

export interface AccountBackupData {
  likes: ExportedLike[];
  tasks: ExportedTask[];
  visions: ExportedVision[];
  goals: ExportedGoal[];
  dailySettings: ExportedDailySettings | null;
  wheelConfigs: ExportedWheelConfig[];
  tokens: ExportedToken[];
  spinLogs: ExportedSpinLog[];
  likeUsedCounts: ExportedLikeUsedCount[];
  tierLikeResets: ExportedTierLikeReset[];
  likeGrantLogs: ExportedLikeGrantLog[];
  likeCreditLedger: ExportedLikeCreditLedger[];
  likeCredits: ExportedLikeCredit[];
  dailyBonusClaims: ExportedDailyBonusClaim[];
}

export interface ExportedLike {
  id: string;
  tier: string;
  label: string;
  createdAt: string;
}

export interface ExportedTask {
  id: string;
  name: string;
  rewardKind: string;
  tier: string | null;
  rewardLikeId: string | null;
  customRewardLabel: string | null;
  taskRewards: unknown;
  section: string;
  scheduledAt: string | null;
  durationMinutes: number | null;
  dueAt: string | null;
  recurrence: string;
  recurrenceConfig: unknown;
  scheduleOverrides: unknown;
  persistAfterDone: boolean;
  sortOrder: number;
  achievedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface ExportedVision {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
}

export interface ExportedGoal {
  id: string;
  visionId: string;
  name: string;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
  parentGoalId: string | null;
}

export interface ExportedDailySettings {
  planningReward: unknown;
  allMustsReward: unknown;
  allDoDatesReward: unknown;
  spinOutcomeWeights: unknown;
  spinPitySettings?: unknown;
  updatedAt: string;
}

export interface ExportedWheelConfig {
  id: string;
  tier: string;
  multiplier: number;
  sliceCounts: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ExportedToken {
  id: string;
  tier: string;
  source: string;
  spentAt: string | null;
  createdAt: string;
}

export interface ExportedSpinLog {
  id: string;
  tokenTier: string;
  outcome: string;
  effectiveTier: string;
  rewardId: string | null;
  createdAt: string;
}

export interface ExportedLikeUsedCount {
  id: string;
  likeId: string;
  bucketKey: string;
  usedCount: number;
}

export interface ExportedTierLikeReset {
  id: string;
  tier: string;
  bucketKey: string;
  resetAt: string;
}

export interface ExportedLikeGrantLog {
  id: string;
  likeId: string;
  tier: string;
  source: string;
  createdAt: string;
}

export interface ExportedLikeCreditLedger {
  id: string;
  likeId: string;
  bucketKey: string;
  delta: number;
  kind: string;
  createdAt: string;
}

export interface ExportedLikeCredit {
  id: string;
  likeId: string;
  tier: string;
  earnedAt: string;
  expiresAt: string;
  usedAt: string | null;
  voidedAt: string | null;
  source: string;
  sourceId: string | null;
}

export interface ExportedDailyBonusClaim {
  id: string;
  dayKey: string;
  bonusType: string;
  tier: string | null;
  rewardLabel: string | null;
  createdAt: string;
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export function parseBackupFile(value: unknown): AccountBackupFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid backup file");
  }
  const raw = value as Record<string, unknown>;
  if (raw.format !== BACKUP_FORMAT) {
    throw new Error('Invalid backup format (expected "effortless-backup")');
  }
  if (raw.version !== 1 && raw.version !== 2) {
    throw new Error(`Unsupported backup version: ${String(raw.version)}`);
  }
  if (!raw.data || typeof raw.data !== "object" || Array.isArray(raw.data)) {
    throw new Error("Backup missing data section");
  }
  const data = raw.data as Record<string, unknown>;
  const requireArray = (key: string) => {
    const v = data[key];
    if (!Array.isArray(v)) throw new Error(`Backup data.${key} must be an array`);
    return v;
  };

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : new Date().toISOString(),
    aiRecoveryGuide:
      typeof raw.aiRecoveryGuide === "string" ? raw.aiRecoveryGuide : AI_RECOVERY_GUIDE,
    account:
      raw.account && typeof raw.account === "object" && !Array.isArray(raw.account)
        ? { email: String((raw.account as { email?: string }).email ?? "") }
        : { email: "" },
    data: {
      likes: requireArray("likes") as ExportedLike[],
      tasks: requireArray("tasks") as ExportedTask[],
      visions: requireArray("visions") as ExportedVision[],
      goals: requireArray("goals") as ExportedGoal[],
      dailySettings: (data.dailySettings as ExportedDailySettings | null) ?? null,
      wheelConfigs: requireArray("wheelConfigs") as ExportedWheelConfig[],
      tokens: requireArray("tokens") as ExportedToken[],
      spinLogs: requireArray("spinLogs") as ExportedSpinLog[],
      likeUsedCounts: requireArray("likeUsedCounts") as ExportedLikeUsedCount[],
      tierLikeResets: requireArray("tierLikeResets") as ExportedTierLikeReset[],
      likeGrantLogs: requireArray("likeGrantLogs") as ExportedLikeGrantLog[],
      likeCreditLedger: requireArray("likeCreditLedger") as ExportedLikeCreditLedger[],
      likeCredits: (Array.isArray(data.likeCredits) ? data.likeCredits : []) as ExportedLikeCredit[],
      dailyBonusClaims: requireArray("dailyBonusClaims") as ExportedDailyBonusClaim[],
    },
  };
}

export { iso };
