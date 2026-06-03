-- CreateEnum
CREATE TYPE "RewardTier" AS ENUM ('Bronze', 'Silver', 'Gold', 'Diamond', 'Platinum', 'Royal', 'King', 'Emperor', 'Planetary', 'Stellar', 'Galactic');

-- CreateEnum
CREATE TYPE "SpinOutcome" AS ENUM ('Win', 'LevelUp', 'NoReward', 'LevelDown');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "googleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Habit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" "RewardTier" NOT NULL,
    "persistAfterDone" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "achievedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "RewardTier" NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "RewardTier" NOT NULL,
    "source" TEXT NOT NULL,
    "spentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpinLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenTier" "RewardTier" NOT NULL,
    "outcome" "SpinOutcome" NOT NULL,
    "effectiveTier" "RewardTier" NOT NULL,
    "rewardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpinLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "Habit_userId_idx" ON "Habit"("userId");

-- CreateIndex
CREATE INDEX "UserReward_userId_tier_idx" ON "UserReward"("userId", "tier");

-- CreateIndex
CREATE INDEX "RewardToken_userId_tier_idx" ON "RewardToken"("userId", "tier");

-- CreateIndex
CREATE INDEX "RewardToken_userId_spentAt_idx" ON "RewardToken"("userId", "spentAt");

-- CreateIndex
CREATE INDEX "SpinLog_userId_effectiveTier_createdAt_idx" ON "SpinLog"("userId", "effectiveTier", "createdAt");

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReward" ADD CONSTRAINT "UserReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardToken" ADD CONSTRAINT "RewardToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpinLog" ADD CONSTRAINT "SpinLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
