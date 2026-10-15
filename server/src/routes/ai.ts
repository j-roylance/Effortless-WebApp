import { Router } from "express";
import { z } from "zod";
import type { AiChat } from "@prisma/client";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import {
  AiChatError,
  isAiConfigured,
  streamChatCompletion,
} from "../services/ai-chat.js";

export const aiRouter = Router();
aiRouter.use(requireAuth);

const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      })
    )
    .min(1)
    .max(40),
});

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

const createChatSchema = z.object({
  kind: chatKindSchema,
  title: chatTitleSchema,
  messages: storedMessagesSchema,
});

const updateChatSchema = z
  .object({
    title: chatTitleSchema.optional(),
    messages: storedMessagesSchema.optional(),
  })
  .refine((b) => b.title !== undefined || b.messages !== undefined, {
    message: "Provide title or messages",
  });

function serializeChat(chat: AiChat) {
  return {
    id: chat.id,
    kind: chat.kind,
    title: chat.title,
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

aiRouter.get("/chats", async (req: AuthedRequest, res) => {
  const kind = chatKindSchema.safeParse(req.query.kind);
  const chats = await prisma.aiChat.findMany({
    where: { userId: req.user!.userId, ...(kind.success && { kind: kind.data }) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, kind: true, title: true, createdAt: true, updatedAt: true },
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
  const chat = await prisma.aiChat.create({
    data: { userId: req.user!.userId, ...parsed.data },
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
  const chat = await prisma.aiChat.update({
    where: { id: existing.id },
    data: parsed.data,
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

aiRouter.post("/chat", async (req: AuthedRequest, res) => {
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  if (!isAiConfigured()) {
    res.status(503).json({ error: "AI not configured" });
    return;
  }

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
