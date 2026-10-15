import { Router, type Response } from "express";
import { z } from "zod";
import type { AiChat, Prisma } from "@prisma/client";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import {
  AiChatError,
  cleanName,
  completeChat,
  isAiConfigured,
  parseList,
  streamChatCompletion,
  type ChatMessage,
} from "../services/ai-chat.js";

export const aiRouter = Router();
aiRouter.use(requireAuth);

const requestMessagesSchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(8000),
    })
  )
  .min(1)
  .max(40);

const chatBodySchema = z.object({ messages: requestMessagesSchema });

const chatKindSchema = z.enum(["vision", "goal"]);
const chatTitleSchema = z.string().trim().min(1).max(120);
const storedMessagesSchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(20000),
    })
  )
  .min(1)
  .max(300);
const linkIdSchema = z.string().min(1).max(64).nullable().optional();

const createChatSchema = z.object({
  kind: chatKindSchema,
  title: chatTitleSchema,
  messages: storedMessagesSchema,
  visionId: linkIdSchema,
  goalId: linkIdSchema,
});

const updateChatSchema = z
  .object({
    title: chatTitleSchema.optional(),
    messages: storedMessagesSchema.optional(),
    visionId: linkIdSchema,
    goalId: linkIdSchema,
  })
  .refine(
    (b) =>
      b.title !== undefined ||
      b.messages !== undefined ||
      b.visionId !== undefined ||
      b.goalId !== undefined,
    { message: "Provide title, messages, or a link" }
  );

const suggestNameSchema = z.object({
  messages: requestMessagesSchema,
  target: z.enum(["vision", "goal"]),
});

const draftChainSchema = z.object({
  target: z.enum(["vision", "goal"]),
  text: z.string().trim().min(1).max(4000),
  progress: z.string().max(4000).optional().default(""),
  existingGoals: z.array(z.string().max(200)).max(50).optional().default([]),
});

function serializeChat(chat: AiChat) {
  return {
    id: chat.id,
    kind: chat.kind,
    title: chat.title,
    visionId: chat.visionId,
    goalId: chat.goalId,
    messages: chat.messages,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  };
}

async function findOwnChat(req: AuthedRequest) {
  return prisma.aiChat.findFirst({
    where: { id: String(req.params.id), userId: req.user!.userId },
  });
}

/** Resolves the final vision/goal link, or returns an error message if it isn't the user's. */
async function resolveLink(
  userId: string,
  visionId: string | null,
  goalId: string | null
): Promise<{ visionId: string | null; goalId: string | null } | string> {
  if (goalId) {
    const goal = await prisma.goal.findFirst({
      where: { id: goalId, userId },
      select: { visionId: true },
    });
    if (!goal) return "Goal not found";
    if (visionId && visionId !== goal.visionId) return "Goal is not in that vision";
    return { visionId: goal.visionId, goalId };
  }
  if (visionId) {
    const vision = await prisma.vision.findFirst({ where: { id: visionId, userId } });
    if (!vision) return "Vision not found";
  }
  return { visionId, goalId: null };
}

function sendAiError(res: Response, err: unknown) {
  const message = err instanceof AiChatError ? err.message : "AI request failed";
  const status = err instanceof AiChatError ? err.status : 500;
  res.status(status).json({ error: message });
}

function requireAiConfigured(res: Response): boolean {
  if (isAiConfigured()) return true;
  res.status(503).json({ error: "AI not configured" });
  return false;
}

aiRouter.get("/chats", async (req: AuthedRequest, res) => {
  const kind = chatKindSchema.safeParse(req.query.kind);
  const visionId = typeof req.query.visionId === "string" ? req.query.visionId : null;
  const goalId = typeof req.query.goalId === "string" ? req.query.goalId : null;
  const unlinked = req.query.unlinked === "1";

  const where: Prisma.AiChatWhereInput = {
    userId: req.user!.userId,
    ...(kind.success && { kind: kind.data }),
  };
  if (goalId) {
    where.goalId = goalId;
  } else if (visionId) {
    where.visionId = visionId;
    where.goalId = null;
  } else if (unlinked) {
    where.visionId = null;
  }

  const chats = await prisma.aiChat.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      kind: true,
      title: true,
      visionId: true,
      goalId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json({
    chats: chats.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  });
});

aiRouter.post("/chats", async (req: AuthedRequest, res) => {
  const parsed = createChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { visionId, goalId, ...rest } = parsed.data;
  const link = await resolveLink(req.user!.userId, visionId ?? null, goalId ?? null);
  if (typeof link === "string") {
    res.status(400).json({ error: link });
    return;
  }
  const chat = await prisma.aiChat.create({
    data: { userId: req.user!.userId, ...rest, ...link },
  });
  res.status(201).json({ chat: serializeChat(chat) });
});

aiRouter.get("/chats/:id", async (req: AuthedRequest, res) => {
  const chat = await findOwnChat(req);
  if (!chat) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ chat: serializeChat(chat) });
});

aiRouter.patch("/chats/:id", async (req: AuthedRequest, res) => {
  const parsed = updateChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const existing = await findOwnChat(req);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const { visionId, goalId, ...rest } = parsed.data;
  let link = {};
  if (visionId !== undefined || goalId !== undefined) {
    const resolved = await resolveLink(
      req.user!.userId,
      visionId !== undefined ? visionId : existing.visionId,
      goalId !== undefined ? goalId : existing.goalId
    );
    if (typeof resolved === "string") {
      res.status(400).json({ error: resolved });
      return;
    }
    link = resolved;
  }

  const chat = await prisma.aiChat.update({
    where: { id: existing.id },
    data: { ...rest, ...link },
  });
  res.json({ chat: serializeChat(chat) });
});

aiRouter.delete("/chats/:id", async (req: AuthedRequest, res) => {
  const existing = await findOwnChat(req);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await prisma.aiChat.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

aiRouter.get("/status", (_req: AuthedRequest, res) => {
  const enabled = isAiConfigured();
  res.json({ enabled, model: enabled ? env.ai.model : null });
});

const HELPER_SYSTEM: ChatMessage = {
  role: "system",
  content:
    "You help a person turn a planning conversation into short names for a goal-tracking app. Follow the requested output format exactly and add nothing else.",
};

aiRouter.post("/suggest-name", async (req: AuthedRequest, res) => {
  const parsed = suggestNameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  if (!requireAiConfigured(res)) return;

  const what =
    parsed.data.target === "vision"
      ? "my vision"
      : "the goal we most recently agreed on (the newest step in the chain)";
  try {
    const reply = await completeChat(
      [
        HELPER_SYSTEM,
        ...parsed.data.messages,
        {
          role: "user",
          content: `Based on our conversation, reply with ONLY a short name (under 10 words) for ${what}. No quotes, no explanation.`,
        },
      ],
      { maxTokens: 60 }
    );
    const firstLine = reply.split("\n").find((line) => line.trim()) ?? "";
    const name = cleanName(firstLine);
    if (!name) {
      res.status(502).json({ error: "AI did not suggest a name; type one instead" });
      return;
    }
    res.json({ name });
  } catch (err) {
    sendAiError(res, err);
  }
});

aiRouter.post("/extract-chain", async (req: AuthedRequest, res) => {
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  if (!requireAiConfigured(res)) return;

  try {
    const reply = await completeChat(
      [
        HELPER_SYSTEM,
        ...parsed.data.messages,
        {
          role: "user",
          content:
            "List every goal in the chain we worked out as a numbered list, one short goal name (under 12 words) per line. Start with the goal closest to the vision or big goal (the last step right before it is achieved) and end with the first, most achievable step. Do not include the vision or big goal itself. Reply with only the list.",
        },
      ],
      { maxTokens: 600 }
    );
    const goals = parseList(reply);
    if (goals.length === 0) {
      res.status(502).json({ error: "AI did not return a list of goals; try again" });
      return;
    }
    res.json({ goals });
  } catch (err) {
    sendAiError(res, err);
  }
});

aiRouter.post("/draft-chain", async (req: AuthedRequest, res) => {
  const parsed = draftChainSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  if (!requireAiConfigured(res)) return;

  const { target, text, progress, existingGoals } = parsed.data;
  const label = target === "vision" ? "VISION" : "GOAL";
  const subject = target === "vision" ? "life vision" : "big goal";
  const existing =
    existingGoals.length > 0
      ? `\n\nGoals already in my chain (do not repeat them):\n${existingGoals.map((g) => `- ${g}`).join("\n")}`
      : "";

  try {
    const reply = await completeChat(
      [
        HELPER_SYSTEM,
        {
          role: "user",
          content: `Draft a backward goal chain for my ${subject}.

My ${subject}:
${text}

What I have done so far:
${progress.trim() || "(nothing noted yet)"}${existing}

Work backward from the ${subject}: first the goal right before it is achieved, then the goal before that, down to a first step small enough to start this week. Use 4 to 8 goals, each under 12 words.

Reply in exactly this format and nothing else:
${label}: <short name for my ${subject}, under 10 words>
1. <goal closest to the ${subject}>
2. <the goal before that>
...
N. <first small step>`,
        },
      ],
      { maxTokens: 600 }
    );

    const labelPattern = new RegExp(`^\\s*\\**${label}\\**\\s*:`, "i");
    const lines = reply.split("\n");
    const labelLine = lines.find((line) => labelPattern.test(line));
    const name = labelLine ? cleanName(labelLine.replace(labelPattern, "")) : "";
    const goals = parseList(lines.filter((line) => line !== labelLine).join("\n"));
    if (goals.length === 0) {
      res.status(502).json({ error: "AI did not return a list of goals; try again" });
      return;
    }
    res.json({ name: name || null, goals });
  } catch (err) {
    sendAiError(res, err);
  }
});

aiRouter.post("/chat", async (req: AuthedRequest, res) => {
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  if (!requireAiConfigured(res)) return;

  const clientAbort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) clientAbort.abort();
  });

  let started = false;
  try {
    await streamChatCompletion(
      parsed.data.messages,
      (token) => {
        if (!started) {
          started = true;
          res.status(200);
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("X-Accel-Buffering", "no");
        }
        res.write(token);
      },
      clientAbort.signal
    );
    if (!started) {
      res.status(502).json({ error: "Model returned an empty reply; try again" });
      return;
    }
    res.end();
  } catch (err) {
    const message = err instanceof AiChatError ? err.message : "AI request failed";
    const status = err instanceof AiChatError ? err.status : 500;
    if (!started) {
      res.status(status).json({ error: message });
    } else {
      res.end(`\n\n[Error: ${message}]`);
    }
  }
});
