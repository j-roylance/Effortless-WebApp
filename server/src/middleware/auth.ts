import type { NextFunction, Request, Response } from "express";
import { COOKIE_NAME, verifyToken } from "../auth/jwt.js";

export interface AuthedRequest extends Request {
  user?: { userId: string; email: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = bearer ?? req.cookies?.[COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = { userId: payload.userId, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
