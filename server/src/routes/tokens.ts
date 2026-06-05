import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { safeTimeZone } from "../domain/daily.js";
import { getTokenBalances } from "../services/tokens.js";
import { getScheduleStatus } from "../services/spin.js";

export const tokensRouter = Router();
tokensRouter.use(requireAuth);

tokensRouter.get("/", async (req: AuthedRequest, res) => {
  const timeZone = safeTimeZone(req.headers["x-timezone"] as string);
  const balances = await getTokenBalances(req.user!.userId);
  const schedule = await getScheduleStatus(req.user!.userId, timeZone);
  res.json({ balances, schedule });
});
