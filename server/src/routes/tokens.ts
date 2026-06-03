import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getTokenBalances } from "../services/tokens.js";
import { getScheduleStatus } from "../services/spin.js";

export const tokensRouter = Router();
tokensRouter.use(requireAuth);

tokensRouter.get("/", async (req: AuthedRequest, res) => {
  const timeZone = (req.headers["x-timezone"] as string) || "UTC";
  const balances = await getTokenBalances(req.user!.userId);
  const schedule = await getScheduleStatus(req.user!.userId, timeZone);
  res.json({ balances, schedule });
});
