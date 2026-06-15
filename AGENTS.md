# Agent notes (Effortless)

## Product in one sentence

Tasks earn tier tokens; users define likes per tier and spin to win them; visions hold backward goal chains; AI tab builds copy-paste prompts for external assistants.

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
| UI screens | `client/src/pages/` |
| Shared page chrome | `client/src/components/PageHeader.tsx` |
| Token earn modals | `useRewardQueue`, `RewardModalHost` |
| Spin UI / animations | `RandomizerModal`, `OutcomeRoll`, `SpinnerWheel`, `client/src/domain/spin.ts` |
| Calendar / repeat overrides | `client/src/domain/calendar.ts`, `schedule-overrides.ts`, `PATCH /tasks/:id` with `occurrenceDayKey` |
| Task / daily rewards | `rewardKind` on `Habit`, `taskRewards` JSON, `TaskRewardsEditor`, `RewardPicker` |
| Like split/combine ratios | `server/src/domain/like-conversions.ts` **and** `client/src/domain/like-conversions.ts` |
| Like usage / ledger | `server/src/services/like-tracking.ts`, `LikeCreditLedger` model |
| Like split/combine UI | `LikeSplitModal`, `LikeCombineModal`, `LikesPage` |
| Schema | `server/prisma/schema.prisma` → `npx prisma migrate dev` |

## Routes (UI → page → API)

| Path | Page | Main API |
|------|------|----------|
| `/` | TasksPage | `GET /tasks`, `POST /tasks/:id/achieve` (multi-reward via `rewards` / `tokens[]`) |
| `/tasks/new`, `/tasks/:id/edit` | TaskFormPage | `POST/PATCH /tasks` with `rewards[]` |
| `/calendar` | CalendarPage | `GET /tasks`, `PATCH /tasks/:id` |
| `/likes` | LikesPage | `GET /likes` (with `rewardedCount`/`usedCount`/`availableCount`), `PATCH /likes/:id/used`, `POST /likes/:id/split`, `POST /likes/combine`, `POST /likes/reset-tier` |
| `/daily-settings` | Settings (DailySettingsPage) | `GET/PUT /daily-settings` |
| `/visions` | VisionsPage | `GET /visions` |
| `/visions/:id/chain` | VisionChainPage | `GET/POST/PATCH /visions/:id/goals` (top-level goals) |
| `/visions/:id/chain/:goalId` | VisionChainPage | `GET /visions/:id/goals?focus=:goalId` (sub-goals) |
| `/ai` | AiPage | (client-only prompts) |
| `/welcome` | WelcomePage | (signup onboarding only) |

`/welcome` is **outside** `AppShell` (no tab bar). FAB `+` shows on `/` (tasks) and `/visions` only.

## React Query keys

`["tasks"]`, `["tokens"]`, `["likes"]`, `["visions"]`, `["vision-goals", visionId, chainKey]`, `["daily-settings"]`, `["wheel-config", tier]`

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

## Common pitfalls

- Vercel project root must be repo root, not `client/`
- `JWT_SECRET` and `CLIENT_URL` required in production
- Supabase: `DATABASE_URL` = pooler :6543, `DIRECT_URL` = session :5432
- Client sends `X-Timezone` header (`api/client.ts`) for spin schedule and daily bonuses
- Repeating tasks: series rule in `recurrence` + `recurrenceConfig`; per-day drag overrides in `scheduleOverrides`; calendar shows Do blocks only (no Due); calendar PATCH uses `occurrenceDayKey` (YYYY-MM-DD)
- Due dates are manual only (one-time tasks): server never derives `dueAt` from `durationMinutes`
