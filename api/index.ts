/**
 * Vercel serverless handler for all /api/* routes.
 * Loads the compiled Express app from server/dist (built during Vercel build).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Express } from "express";

let app: Express | null = null;

async function getApp(): Promise<Express> {
  if (app) return app;
  const mod = await import("../server/dist/app.js");
  app = mod.app;
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const application = await getApp();
    await new Promise<void>((resolve, reject) => {
      application(req, res, (err: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (err) {
    console.error("API error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
