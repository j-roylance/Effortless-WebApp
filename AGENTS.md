# Agent notes (Effortless)

## Product in one sentence

Tasks earn tier tokens; users define likes per tier and spin to win them; visions hold backward goal chains; an AI sheet on the vision pages chats with a configured model and turns the chat into visions/goals (or builds copy-paste prompts when none is set).

## Naming glossary (user-facing vs code)

| UI / API | Prisma model | Notes |
|----------|--------------|-------|
| Task | `Habit` | `/api/tasks` |
| Like | `UserReward` | `/api/likes` |
| Token | `RewardToken` | `/api/tokens`, `/api/spin` |
| Vision | `Vision` | `/api/visions` |
| Goal (chain step) | `Goal` | `/api/visions/:id/goals`; optional `parentGoalId` for sub-goals |

Grep hits for `habit` in old token `source` values are expected.

## Where to change things

| Change | Location |
|--------|----------|
| New API route | `server/src/routes/`, mount in `server/src/app.ts` |
| Tier limits / labels | `server/src/domain/tiers.ts` **and** `client/src/domain/tiers.ts` |
| Spin logic | `server/src/services/spin.ts` |
| Spin odds | `server/src/domain/spin-odds.ts`, `DailySettings.spinOutcomeWeights` |
| Daily bonuses | `server/src/services/daily-rewards.ts` |
| Vision / goal chain | `server/src/routes/visions.ts`, `goals.ts`, `services/goals.ts` |
| AI prompt text | `client/src/domain/ai-prompts.ts` |
| AI model calls | `server/src/services/ai-chat.ts` (OpenAI-compatible streaming + `completeChat`/`parseList` for structured asks), `server/src/routes/ai.ts`, `AI_*` env in `server/src/lib/env.ts` |
| AI sheet (vision routes) | `AiPanel.tsx` (`AiPanelProvider`/`useAiPanel` in `AppShell`; target derived from route), `AiChatPanel.tsx` (chat + Add Vision / Add Goal / Save whole chain), `AiChainTools.tsx` (`NameConfirmBox`, `ChainChecklist`), `api/vision-chain.ts` |
| Saved AI chats | `AiChat` model (`kind` vision/goal, `messages` JSON, optional `visionId`/`goalId` link), `/ai/chats` CRUD in `server/src/routes/ai.ts`; revert = PATCH with truncated `messages` |
| UI screens | `client/src/pages/` |
| Shared page chrome | `client/src/components/PageHeader.tsx` |
| Token earn modals | `useRewardQueue`, `RewardModalHost` |
| Spin UI / animations | `RandomizerModal`, `OutcomeRoll`, `SpinnerWheel`, `client/src/domain/spin.ts` |
| Calendar / repeat overrides | `client/src/domain/calendar.ts`, `schedule-overrides.ts`, `PATCH /tasks/:id` with `occurrenceDayKey` |
| Task / daily rewards | `rewardKind` on `Habit`, `taskRewards` JSON, `TaskRewardsEditor`, `RewardPicker` |
| Like split/combine ratios | `server/src/domain/like-conversions.ts` **and** `client/src/domain/like-conversions.ts` |
| Like usage / ledger | `server/src/services/like-tracking.ts`, `LikeCreditLedger` model |
| Like split/combine UI | `LikeSplitModal`, `LikeCombineModal`, `LikesPage` |
| Account backup / restore | `server/src/services/account-backup.ts`, `AccountBackupSection`, `GET/POST /account/backup` |
| Schema | `server/prisma/schema.prisma` → `npx prisma migrate dev` |

## Routes (UI → page → API)

| Path | Page | Main API |
|------|------|----------|
| `/` | TasksPage | `GET /tasks`, `POST /tasks/:id/achieve` (multi-reward via `rewards` / `tokens[]`) |
| `/tasks/new`, `/tasks/:id/edit` | TaskFormPage | `POST/PATCH /tasks` with `rewards[]` |
| `/calendar` | CalendarPage | `GET /tasks`, `PATCH /tasks/:id` |
| `/likes` | LikesPage | `GET /likes` (with `rewardedCount`/`usedCount`/`availableCount`), `PATCH /likes/:id/used`, `POST /likes/:id/split`, `POST /likes/combine`, `POST /likes/reset-tier` |
| `/daily-settings` | Settings (DailySettingsPage) | `GET/PUT /daily-settings`, `GET/POST /account/backup` |
| `/visions` | VisionsPage | `GET /visions` |
| `/visions/:id/chain` | VisionChainPage | `GET/POST/PATCH /visions/:id/goals` (top-level goals) |
| `/visions/:id/chain/:goalId` | VisionChainPage | `GET /visions/:id/goals?focus=:goalId` (sub-goals) |
| `/ai` | redirect | → `/visions?ai=1` (opens the AI sheet) |
| `/welcome` | WelcomePage | (signup onboarding only) |

`/welcome` is **outside** `AppShell` (no tab bar). FAB `+` shows on `/` (tasks) and `/visions` only (hidden while the AI sheet is open).

AI sheet (on `/visions` and chain pages; "Plan with AI" / "AI" header buttons) uses: `GET /ai/status`, `POST /ai/chat` (streams plain text), `GET /ai/chats?visionId=|goalId=|unlinked=1`, `POST /ai/chats`, `GET/PATCH/DELETE /ai/chats/:id`, `POST /ai/suggest-name` → `{ name }`, `POST /ai/extract-chain` → `{ goals }`, `POST /ai/draft-chain` → `{ name, goals }` (goals ordered closest-to-vision first, appended in that order). Falls back to client-only prompts when AI is not configured.

## React Query keys

`["tasks"]`, `["tokens"]`, `["likes"]`, `["visions"]`, `["vision-goals", visionId, chainKey]`, `["daily-settings"]`, `["wheel-config", tier]`, `["ai-status"]`, `["ai-chats", "unlinked" | "vision:<id>" | "goal:<id>"]`, `["ai-chat", id]`

## Do not commit

- `server/.env`, any secrets
- `node_modules/`, `dist/`, `server/dist/`, `client/dist/` (build artifacts; may be stale)

## Deploy

Root is `.` on Vercel; `vercel.json` builds `server` then `client`. API handler is `api/index.ts` importing `server/dist/app.js` — run `npm run build` in `server/` before relying on compiled output locally.

### Safe DB migration checklist

When `schema.prisma` changes:

1. Prefer additive migrations (`ADD COLUMN`, nullable, default null) — existing rows stay valid.
2. From `server/`: `npx prisma migrate deploy` against the target database.
3. Spot-check: row counts unchanged; new columns null on existing rows.
4. Push to `main` so Vercel build matches the applied schema.

Code-only changes skip step 2–3; push alone triggers redeploy.

### AI chat setup

AI chat is off unless `AI_BASE_URL` and `AI_MODEL` are set (server env / Vercel project env). `AI_API_KEY` is sent as a Bearer token when present. Any OpenAI-compatible `/chat/completions` endpoint works:

| Provider | `AI_BASE_URL` | `AI_MODEL` example | Key |
|----------|---------------|--------------------|-----|
| HF Inference Providers | `https://router.huggingface.co/v1` | `Qwen/Qwen2.5-7B-Instruct` | HF token (Inference permission) |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-8b-instant` | Groq key |
| OpenRouter | `https://openrouter.ai/api/v1` | a `:free` model id | OpenRouter key |
| Own HF Space (Ollama) | `https://<user>-<space>.hf.space/v1` | `qwen2.5:1.5b` | none (public Space) |
| Local Ollama | `http://localhost:11434/v1` | `qwen2.5:1.5b` | none |

Minimal self-hosted HF Space: create a **Docker** Space with `app_port: 11434` in its README front matter and a Dockerfile like:

```dockerfile
FROM ollama/ollama
# HF runs Docker Spaces as uid 1000, so models and HOME must not live under /root.
ENV OLLAMA_HOST=0.0.0.0:11434 OLLAMA_MODELS=/models HOME=/tmp
RUN mkdir -p /models && (ollama serve &) && sleep 5 && ollama pull qwen2.5:1.5b \
  && chmod -R a+rwX /models
ENTRYPOINT ["ollama", "serve"]
```

(Starting-point recipe; not exercised by this repo's tests.)

Free CPU Spaces are slow (10–60s replies) and sleep when idle; the first request after sleep may fail with "Model is waking up". Vercel `maxDuration` for `api/index.ts` is 60s, so keep models small.

## Common pitfalls

- Vercel project root must be repo root, not `client/`
- `JWT_SECRET` and `CLIENT_URL` required in production
- Supabase: `DATABASE_URL` = pooler :6543, `DIRECT_URL` = session :5432
- Client sends `X-Timezone` header (`api/client.ts`) for spin schedule and daily bonuses
- Repeating tasks: series rule in `recurrence` + `recurrenceConfig`; per-day drag overrides in `scheduleOverrides`; calendar shows Do blocks only (no Due); calendar PATCH uses `occurrenceDayKey` (YYYY-MM-DD)
- Due dates are manual only (one-time tasks): server never derives `dueAt` from `durationMinutes`
