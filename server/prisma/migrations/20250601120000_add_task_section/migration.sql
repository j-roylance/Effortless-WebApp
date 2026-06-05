-- CreateEnum
CREATE TYPE "TaskSection" AS ENUM ('Must', 'Should', 'Could');

-- AlterTable
ALTER TABLE "Habit" ADD COLUMN "section" "TaskSection" NOT NULL DEFAULT 'Could';
