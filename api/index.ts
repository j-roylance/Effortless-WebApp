import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Express } from "express";

let app: Express | null = null;
let loadError: string | null = null;

async function getApp(): Promise<Express> {
  if (app) return app;
  if (loadError) throw new Error(loadError);
  try {
    const mod = await import("../server/dist/app.js");
    app = mod.app;
    return app;
  } catch (err) {
    loadError = err instanceof Error ? err.stack ?? err.message : String(err);
    console.error("Failed to load API:", loadError);
    throw err;
  }
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
    console.error("API handler error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "API error",
        detail: loadError ?? (err instanceof Error ? err.message : String(err)),
      });
    }
  }
}
