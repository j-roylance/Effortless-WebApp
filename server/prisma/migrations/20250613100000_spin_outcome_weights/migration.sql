-- Per-user weighted spin outcome odds on DailySettings
ALTER TABLE "DailySettings" ADD COLUMN "spinOutcomeWeights" JSONB NOT NULL DEFAULT '{"win":25,"levelUp":25,"noReward":25,"levelDown":25}';
