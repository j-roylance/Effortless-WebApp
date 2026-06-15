-- CreateTable
CREATE TABLE "LikeCreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "likeId" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LikeCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LikeCreditLedger_userId_likeId_bucketKey_idx" ON "LikeCreditLedger"("userId", "likeId", "bucketKey");

-- AddForeignKey
ALTER TABLE "LikeCreditLedger" ADD CONSTRAINT "LikeCreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LikeCreditLedger" ADD CONSTRAINT "LikeCreditLedger_likeId_fkey" FOREIGN KEY ("likeId") REFERENCES "UserReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
