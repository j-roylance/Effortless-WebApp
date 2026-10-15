import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { env } from "../lib/env.js";
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
