-- Definite rewards for tasks and daily milestones

CREATE TYPE "TaskRewardKind" AS ENUM ('None', 'Token', 'Like', 'Custom');

ALTER TABLE "Habit" ADD COLUMN "rewardKind" "TaskRewardKind" NOT NULL DEFAULT 'Token';
ALTER TABLE "Habit" ADD COLUMN "rewardLikeId" TEXT;
ALTER TABLE "Habit" ADD COLUMN "customRewardLabel" TEXT;
ALTER TABLE "Habit" ALTER COLUMN "tier" DROP NOT NULL;

ALTER TABLE "Habit" ADD CONSTRAINT "Habit_rewardLikeId_fkey"
  FOREIGN KEY ("rewardLikeId") REFERENCES "UserReward"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Habit_rewardLikeId_idx" ON "Habit"("rewardLikeId");

ALTER TABLE "DailySettings" ADD COLUMN "planningReward" JSONB NOT NULL DEFAULT '{"kind":"none"}';
ALTER TABLE "DailySettings" ADD COLUMN "allMustsReward" JSONB NOT NULL DEFAULT '{"kind":"none"}';
ALTER TABLE "DailySettings" ADD COLUMN "allDoDatesReward" JSONB NOT NULL DEFAULT '{"kind":"none"}';

UPDATE "DailySettings"
SET "planningReward" = jsonb_build_object('kind', 'token', 'tier', "planningRewardTier")
WHERE "planningRewardTier" IS NOT NULL;

UPDATE "DailySettings"
SET "allMustsReward" = jsonb_build_object('kind', 'token', 'tier', "allMustsRewardTier")
WHERE "allMustsRewardTier" IS NOT NULL;

UPDATE "DailySettings"
SET "allDoDatesReward" = jsonb_build_object('kind', 'token', 'tier', "allDoDatesRewardTier")
WHERE "allDoDatesRewardTier" IS NOT NULL;

ALTER TABLE "DailySettings" DROP COLUMN "planningRewardTier";
ALTER TABLE "DailySettings" DROP COLUMN "allMustsRewardTier";
ALTER TABLE "DailySettings" DROP COLUMN "allDoDatesRewardTier";

ALTER TABLE "DailyBonusClaim" ADD COLUMN "rewardLabel" TEXT;
ALTER TABLE "DailyBonusClaim" ALTER COLUMN "tier" DROP NOT NULL;
