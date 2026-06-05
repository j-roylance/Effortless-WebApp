/**
 * Express application (shared by local dev and Vercel).
 * Local entry: index.ts listens on a port. Production: api/index.ts imports this app.
 */
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./lib/env.js";
import { authRouter } from "./routes/auth.js";
import { tasksRouter } from "./routes/tasks.js";
import { likesRouter } from "./routes/likes.js";
import { tokensRouter } from "./routes/tokens.js";
import { spinRouter } from "./routes/spin.js";
import { wheelConfigRouter } from "./routes/wheel-config.js";

export const app = express();

app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/likes", likesRouter);
app.use("/api/tokens", tokensRouter);
app.use("/api/spin", spinRouter);
app.use("/api/wheel-config", wheelConfigRouter);
