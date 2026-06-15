import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  exportAccountBackup,
  importAccountBackup,
} from "../services/account-backup.js";

export const accountBackupRouter = Router();
accountBackupRouter.use(requireAuth);

accountBackupRouter.get("/", async (req: AuthedRequest, res) => {
  const backup = await exportAccountBackup(req.user!.userId, req.user!.email);
  res.json(backup);
});

accountBackupRouter.post("/", async (req: AuthedRequest, res) => {
  try {
    await importAccountBackup(req.user!.userId, req.body);
    res.json({ ok: true });
  } catch (e) {
    const err = e as Error;
    res.status(400).json({ error: err.message });
  }
});
