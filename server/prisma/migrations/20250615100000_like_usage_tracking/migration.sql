-- CreateTable
CREATE TABLE "LikeUsedCount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "likeId" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LikeUsedCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierLikeReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "RewardTier" NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TierLikeReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LikeGrantLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "likeId" TEXT NOT NULL,
    "tier" "RewardTier" NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LikeGrantLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LikeUsedCount_userId_bucketKey_idx" ON "LikeUsedCount"("userId", "bucketKey");

-- CreateIndex
CREATE UNIQUE INDEX "LikeUsedCount_userId_likeId_bucketKey_key" ON "LikeUsedCount"("userId", "likeId", "bucketKey");

-- CreateIndex
CREATE UNIQUE INDEX "TierLikeReset_userId_tier_bucketKey_key" ON "TierLikeReset"("userId", "tier", "bucketKey");

-- CreateIndex
CREATE INDEX "LikeGrantLog_userId_likeId_createdAt_idx" ON "LikeGrantLog"("userId", "likeId", "createdAt");

-- AddForeignKey
ALTER TABLE "LikeUsedCount" ADD CONSTRAINT "LikeUsedCount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LikeUsedCount" ADD CONSTRAINT "LikeUsedCount_likeId_fkey" FOREIGN KEY ("likeId") REFERENCES "UserReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierLikeReset" ADD CONSTRAINT "TierLikeReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LikeGrantLog" ADD CONSTRAINT "LikeGrantLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LikeGrantLog" ADD CONSTRAINT "LikeGrantLog_likeId_fkey" FOREIGN KEY ("likeId") REFERENCES "UserReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
