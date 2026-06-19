-- CreateTable
CREATE TABLE "LikeCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "likeId" TEXT NOT NULL,
    "tier" "RewardTier" NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "sourceId" TEXT,

    CONSTRAINT "LikeCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LikeCredit_userId_likeId_expiresAt_idx" ON "LikeCredit"("userId", "likeId", "expiresAt");

-- CreateIndex
CREATE INDEX "LikeCredit_userId_likeId_earnedAt_idx" ON "LikeCredit"("userId", "likeId", "earnedAt");

-- AddForeignKey
ALTER TABLE "LikeCredit" ADD CONSTRAINT "LikeCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LikeCredit" ADD CONSTRAINT "LikeCredit_likeId_fkey" FOREIGN KEY ("likeId") REFERENCES "UserReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
