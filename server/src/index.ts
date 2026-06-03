import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./lib/env.js";
import { authRouter } from "./routes/auth.js";
import { habitsRouter } from "./routes/habits.js";
import { rewardsRouter } from "./routes/rewards.js";
import { tokensRouter } from "./routes/tokens.js";
import { spinRouter } from "./routes/spin.js";

const app = express();

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
app.use("/api/habits", habitsRouter);
app.use("/api/rewards", rewardsRouter);
app.use("/api/tokens", tokensRouter);
app.use("/api/spin", spinRouter);

app.listen(env.port, () => {
  console.log(`Effortless API listening on http://localhost:${env.port}`);
});
