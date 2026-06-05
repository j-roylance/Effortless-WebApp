-- CreateTable
CREATE TABLE "TierWheelConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "RewardTier" NOT NULL,
    "multiplier" INTEGER NOT NULL DEFAULT 1,
    "sliceCounts" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TierWheelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TierWheelConfig_userId_tier_key" ON "TierWheelConfig"("userId", "tier");

-- CreateIndex
CREATE INDEX "TierWheelConfig_userId_idx" ON "TierWheelConfig"("userId");

-- AddForeignKey
ALTER TABLE "TierWheelConfig" ADD CONSTRAINT "TierWheelConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
