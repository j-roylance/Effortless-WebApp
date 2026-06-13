import { Prisma, RewardTier, TaskRecurrence, TaskSection } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { isValidTier } from "../domain/tiers.js";
import { isValidSection, normalizeSection } from "../domain/tasks.js";
import {
  advanceSchedule,
  nextOccurrenceAfter,
  parseRecurrenceConfig,
  type RecurrenceConfig,
} from "../domain/recurrence.js";
import {
  mergeOccurrenceOverride,
  parseScheduleOverrides,
  taskOccursOnDay,
} from "../domain/schedule-overrides.js";
import { dayKeyForTimezone, isSameDayInTimezone, safeTimeZone } from "../domain/daily.js";
import { evaluateAchievementBonuses } from "../services/daily-rewards.js";

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

const recurrenceConfigSchema = z.object({
  time: z.string().regex(/^\d{2}:\d{2}$/),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  daysOfMonth: z.array(z.number().int().min(1).max(31)).optional(),
});

const taskBodySchema = z.object({
  name: z.string().min(1).max(200),
  tier: z.string().refine(isValidTier, { message: "Invalid tier" }),
  section: z
    .string()
    .refine(isValidSection, { message: "Invalid section" })
    .optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  durationMinutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  recurrence: z.nativeEnum(TaskRecurrence).optional(),
  recurrenceConfig: recurrenceConfigSchema.nullable().optional(),
  persistAfterDone: z.boolean().optional(),
  occurrenceDayKey: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const taskPatchSchema = taskBodySchema.partial();

async function nextSortOrder(userId: string, section: TaskSection): Promise<number> {
  const count = await prisma.habit.count({
    where: { userId, archivedAt: null, section },
  });
  return count;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function validateRecurrence(
  recurrence: TaskRecurrence,
  config: RecurrenceConfig | null
): string | null {
  if (recurrence === TaskRecurrence.None) return null;
  if (!config?.time) return "Recurrence requires a time";
  if (recurrence === TaskRecurrence.Weekly && !config.daysOfWeek?.length) {
    return "Weekly recurrence requires at least one day";
  }
  if (recurrence === TaskRecurrence.Monthly && !config.daysOfMonth?.length) {
    return "Monthly recurrence requires at least one day of the month";
  }
  return null;
}

type ScheduleInput = {
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  dueAt?: string | null;
  recurrence?: TaskRecurrence;
  recurrenceConfig?: RecurrenceConfig | null;
};

function resolveScheduleFields(body: ScheduleInput) {
  const recurrence = body.recurrence ?? TaskRecurrence.None;
  const recurrenceConfig =
    recurrence === TaskRecurrence.None
      ? null
      : body.recurrenceConfig
        ? parseRecurrenceConfig(body.recurrenceConfig)
        : null;

  const recurrenceError = validateRecurrence(recurrence, recurrenceConfig);
  if (recurrenceError) throw new Error(recurrenceError);

  let scheduledAt = parseDate(body.scheduledAt ?? null);
  let dueAt = parseDate(body.dueAt ?? null);
  const durationMinutes = body.durationMinutes ?? null;

  if (recurrence !== TaskRecurrence.None && recurrenceConfig) {
    const next = nextOccurrenceAfter(recurrence, recurrenceConfig, new Date());
    if (!scheduledAt && next) scheduledAt = next;
  }

  return { scheduledAt, durationMinutes, dueAt, recurrence, recurrenceConfig };
}

function toJsonConfig(config: RecurrenceConfig | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!config) return Prisma.JsonNull;
  return config as unknown as Prisma.InputJsonValue;
}

function toJsonOverrides(
  overrides: ReturnType<typeof parseScheduleOverrides>
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!overrides) return Prisma.JsonNull;
  return overrides as unknown as Prisma.InputJsonValue;
}

function serializeTask(row: {
  section: TaskSection;
  scheduledAt: Date | null;
  dueAt: Date | null;
  recurrence: TaskRecurrence;
  recurrenceConfig: unknown;
  scheduleOverrides?: unknown;
  [key: string]: unknown;
}) {
  return {
    ...row,
    section: normalizeSection(row.section),
    recurrenceConfig: parseRecurrenceConfig(row.recurrenceConfig),
    scheduleOverrides: parseScheduleOverrides(row.scheduleOverrides),
  };
}

tasksRouter.get("/", async (req: AuthedRequest, res) => {
  const rows = await prisma.habit.findMany({
    where: { userId: req.user!.userId, archivedAt: null },
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  res.json({ tasks: rows.map(serializeTask) });
});

/** New task grants +1 Bronze token (source: task_create). */
tasksRouter.post("/", async (req: AuthedRequest, res) => {
  try {
    const body = taskBodySchema.parse(req.body);
    const section = normalizeSection(body.section);
    const schedule = resolveScheduleFields(body);

    const result = await prisma.$transaction(async (tx) => {
      const sortOrder = await nextSortOrder(req.user!.userId, section);
      const task = await tx.habit.create({
        data: {
          userId: req.user!.userId,
          name: body.name.trim(),
          tier: body.tier,
          section,
          scheduledAt: schedule.scheduledAt,
          durationMinutes: schedule.durationMinutes,
          dueAt: schedule.dueAt,
          recurrence: schedule.recurrence,
          recurrenceConfig: toJsonConfig(schedule.recurrenceConfig),
          persistAfterDone: body.persistAfterDone ?? true,
          sortOrder,
        },
      });

      const token = await tx.rewardToken.create({
        data: {
          userId: req.user!.userId,
          tier: RewardTier.Bronze,
          source: "task_create",
        },
      });

      return { task, token };
    });

    res.status(201).json({
      task: serializeTask(result.task),
      token: { id: result.token.id, tier: result.token.tier },
    });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

tasksRouter.patch("/:id", async (req: AuthedRequest, res) => {
  try {
    const taskId = String(req.params.id);
    const body = taskPatchSchema.parse(req.body);
    const existing = await prisma.habit.findFirst({
      where: { id: taskId, userId: req.user!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const occurrenceDayKey = body.occurrenceDayKey;
    const isOccurrencePatch =
      !!occurrenceDayKey &&
      (body.scheduledAt !== undefined || body.dueAt !== undefined);

    if (isOccurrencePatch) {
      if (existing.recurrence === TaskRecurrence.None) {
        res.status(400).json({ error: "Occurrence overrides require a repeating task" });
        return;
      }
      const timeZone = safeTimeZone(req.headers["x-timezone"] as string);
      if (!taskOccursOnDay(existing, occurrenceDayKey, timeZone)) {
        res.status(400).json({ error: "Task does not occur on that day" });
        return;
      }

      const patch: { scheduledAt?: string; dueAt?: string | null } = {};
      if (body.scheduledAt !== undefined) {
        patch.scheduledAt = body.scheduledAt ?? undefined;
      }
      if (body.dueAt !== undefined) {
        patch.dueAt = body.dueAt;
      }

      const scheduleOverrides = mergeOccurrenceOverride(existing, occurrenceDayKey, patch);
      const task = await prisma.habit.update({
        where: { id: existing.id },
        data: { scheduleOverrides: toJsonOverrides(scheduleOverrides) },
      });
      res.json({ task: serializeTask(task) });
      return;
    }

    const nextSection =
      body.section !== undefined ? normalizeSection(body.section) : existing.section;
    const sectionChanged = nextSection !== existing.section;

    const scheduleTouched =
      body.scheduledAt !== undefined ||
      body.durationMinutes !== undefined ||
      body.dueAt !== undefined ||
      body.recurrence !== undefined ||
      body.recurrenceConfig !== undefined;

    let scheduleUpdate: ReturnType<typeof resolveScheduleFields> | null = null;
    if (scheduleTouched) {
      const nextRecurrence =
        body.recurrence !== undefined ? body.recurrence : existing.recurrence;
      const useRecurringDefaults =
        nextRecurrence !== TaskRecurrence.None &&
        body.scheduledAt === null &&
        body.dueAt === null;

      scheduleUpdate = resolveScheduleFields({
        scheduledAt: useRecurringDefaults
          ? null
          : body.scheduledAt !== undefined
            ? body.scheduledAt
            : existing.scheduledAt?.toISOString() ?? null,
        durationMinutes:
          body.durationMinutes !== undefined
            ? body.durationMinutes
            : existing.durationMinutes,
        dueAt: useRecurringDefaults
          ? null
          : body.dueAt !== undefined
            ? body.dueAt
            : existing.dueAt?.toISOString() ?? null,
        recurrence: nextRecurrence,
        recurrenceConfig:
          body.recurrenceConfig !== undefined
            ? body.recurrenceConfig
            : parseRecurrenceConfig(existing.recurrenceConfig),
      });
    }

    const task = await prisma.habit.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.tier !== undefined && { tier: body.tier }),
        ...(body.section !== undefined && { section: nextSection }),
        ...(sectionChanged && {
          sortOrder: await nextSortOrder(req.user!.userId, nextSection),
        }),
        ...(scheduleUpdate && {
          scheduledAt: scheduleUpdate.scheduledAt,
          durationMinutes: scheduleUpdate.durationMinutes,
          dueAt: scheduleUpdate.dueAt,
          recurrence: scheduleUpdate.recurrence,
          recurrenceConfig: toJsonConfig(scheduleUpdate.recurrenceConfig),
          ...(scheduleUpdate.recurrence === TaskRecurrence.None && {
            scheduleOverrides: Prisma.JsonNull,
          }),
        }),
        ...(body.persistAfterDone !== undefined && {
          persistAfterDone: body.persistAfterDone,
        }),
      },
    });
    res.json({ task: serializeTask(task) });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});

tasksRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const taskId = String(req.params.id);
  const existing = await prisma.habit.findFirst({
    where: { id: taskId, userId: req.user!.userId },
  });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await prisma.habit.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

/** Complete task; grant token at task tier; archive if one-time. */
tasksRouter.post("/:id/achieve", async (req: AuthedRequest, res) => {
  const taskId = String(req.params.id);
  const task = await prisma.habit.findFirst({
    where: { id: taskId, userId: req.user!.userId, archivedAt: null },
  });
  if (!task) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const now = new Date();
  const timeZone = safeTimeZone(req.headers["x-timezone"] as string);
  const todayKey = dayKeyForTimezone(timeZone, now);

  if (isSameDayInTimezone(task.achievedAt, todayKey, timeZone)) {
    res.status(409).json({ error: "Already achieved today" });
    return;
  }

  const preAchieveScheduledAt = task.scheduledAt;
  const config = parseRecurrenceConfig(task.recurrenceConfig);
  const advanced =
    task.recurrence !== TaskRecurrence.None
      ? advanceSchedule(
          task.recurrence,
          config,
          task.scheduledAt,
          task.dueAt,
          now
        )
      : { scheduledAt: task.scheduledAt, dueAt: task.dueAt };

  const result = await prisma.$transaction(async (tx) => {
    const token = await tx.rewardToken.create({
      data: {
        userId: req.user!.userId,
        tier: task.tier,
        source: "task_achieve",
      },
    });

    const updated = await tx.habit.update({
      where: { id: task.id },
      data: {
        achievedAt: now,
        scheduledAt: advanced.scheduledAt,
        dueAt: advanced.dueAt,
        ...(!task.persistAfterDone && { archivedAt: now }),
      },
    });

    return { token, task: updated };
  });

  const bonusTokens = await evaluateAchievementBonuses(
    req.user!.userId,
    timeZone,
    todayKey,
    [{ taskId: task.id, scheduledAt: preAchieveScheduledAt }]
  );

  res.json({
    task: serializeTask(result.task),
    token: { id: result.token.id, tier: result.token.tier },
    bonusTokens,
  });
});
