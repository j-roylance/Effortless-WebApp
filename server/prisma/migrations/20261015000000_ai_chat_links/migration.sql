-- AlterTable
ALTER TABLE "AiChat" ADD COLUMN     "goalId" TEXT,
ADD COLUMN     "visionId" TEXT;

-- CreateIndex
CREATE INDEX "AiChat_userId_visionId_idx" ON "AiChat"("userId", "visionId");

-- AddForeignKey
ALTER TABLE "AiChat" ADD CONSTRAINT "AiChat_visionId_fkey" FOREIGN KEY ("visionId") REFERENCES "Vision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChat" ADD CONSTRAINT "AiChat_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

