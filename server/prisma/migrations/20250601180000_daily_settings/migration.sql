-- AlterTable: daily settings on User (one row per user via separate table)

-- CreateTable
CREATE TABLE "DailySettings" (
    "userId" TEXT NOT NULL,
    "planningRewardTier" "RewardTier",
    "allMustsRewardTier" "RewardTier",
    "allDoDatesRewardTier" "RewardTier",
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailySettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "DailyBonusClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "bonusType" TEXT NOT NULL,
    "tier" "RewardTier" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyBonusClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyBonusClaim_userId_dayKey_bonusType_key" ON "DailyBonusClaim"("userId", "dayKey", "bonusType");

-- CreateIndex
CREATE INDEX "DailyBonusClaim_userId_dayKey_idx" ON "DailyBonusClaim"("userId", "dayKey");

-- AddForeignKey
ALTER TABLE "DailySettings" ADD CONSTRAINT "DailySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyBonusClaim" ADD CONSTRAINT "DailyBonusClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
