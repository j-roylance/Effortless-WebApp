import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { safeTimeZone } from "../domain/daily.js";
import { getTokenBalances } from "../services/tokens.js";
import { getPityStatusByTier, getScheduleStatus } from "../services/spin.js";

export const tokensRouter = Router();
tokensRouter.use(requireAuth);

tokensRouter.get("/", async (req: AuthedRequest, res) => {
  const timeZone = safeTimeZone(req.headers["x-timezone"] as string);
  const [balances, schedule, pityByTier] = await Promise.all([
    getTokenBalances(req.user!.userId),
    getScheduleStatus(req.user!.userId, timeZone),
    getPityStatusByTier(req.user!.userId),
  ]);
  res.json({ balances, schedule, pityByTier });
});
