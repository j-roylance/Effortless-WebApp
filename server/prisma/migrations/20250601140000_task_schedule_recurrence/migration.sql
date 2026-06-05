-- CreateEnum
CREATE TYPE "TaskRecurrence" AS ENUM ('None', 'Daily', 'Weekly', 'Monthly');

-- AlterTable
ALTER TABLE "Habit" ADD COLUMN "scheduledAt" TIMESTAMP(3);
ALTER TABLE "Habit" ADD COLUMN "durationMinutes" INTEGER;
ALTER TABLE "Habit" ADD COLUMN "dueAt" TIMESTAMP(3);
ALTER TABLE "Habit" ADD COLUMN "recurrence" "TaskRecurrence" NOT NULL DEFAULT 'None';
ALTER TABLE "Habit" ADD COLUMN "recurrenceConfig" JSONB;
