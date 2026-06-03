import { Router } from "express";
import { z } from "zod";
import { LocalProvider } from "../auth/localProvider.js";
import { COOKIE_NAME, cookieOptions, signToken } from "../auth/jwt.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

const authProvider = new LocalProvider();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRouter = Router();

function setAuthCookie(res: import("express").Response, userId: string, email: string) {
  const token = signToken({ userId, email });
  res.cookie(COOKIE_NAME, token, cookieOptions);
}

authRouter.post("/register", async (req, res) => {
  try {
    const body = registerSchema.parse(req.body);
    const user = await authProvider.register(body.email, body.password);
    setAuthCookie(res, user.id, user.email);
    res.status(201).json({ user: { id: user.id, email: user.email } });
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 400).json({ error: err.message });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await authProvider.login(body.email, body.password);
    setAuthCookie(res, user.id, user.email);
    res.json({ user: { id: user.id, email: user.email } });
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 401).json({ error: "Invalid credentials" });
  }
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, createdAt: true },
  });
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ user });
});
