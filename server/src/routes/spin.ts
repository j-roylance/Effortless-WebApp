import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { isValidTier } from "../domain/tiers.js";
import { executeSpin } from "../services/spin.js";

export const spinRouter = Router();
spinRouter.use(requireAuth);

const spinSchema = z.object({
  tokenTier: z.string().refine(isValidTier, { message: "Invalid tier" }),
});

spinRouter.post("/", async (req: AuthedRequest, res) => {
  try {
    const body = spinSchema.parse(req.body);
    const timeZone = (req.headers["x-timezone"] as string) || "UTC";
    const result = await executeSpin(req.user!.userId, body.tokenTier, timeZone);
    res.json(result);
  } catch (e) {
    const err = e as Error & { status?: number; code?: string };
    res.status(err.status ?? 400).json({
      error: err.message,
      code: err.code,
    });
  }
});
