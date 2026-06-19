-- Per-user configurable pity spin outcome profiles on DailySettings
ALTER TABLE "DailySettings" ADD COLUMN "spinPitySettings" JSONB NOT NULL DEFAULT '{"enabled":true,"oneLoss":{"win":50,"levelUp":25,"noReward":12,"levelDown":13},"maxLoss":{"win":75,"levelUp":25,"noReward":0,"levelDown":0}}';
