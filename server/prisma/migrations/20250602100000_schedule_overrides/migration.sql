-- Per-day calendar overrides for recurring tasks
ALTER TABLE "Habit" ADD COLUMN "scheduleOverrides" JSONB;
