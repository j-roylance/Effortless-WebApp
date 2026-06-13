# Architecture

## Request path

```text
Browser
  → Vercel static (client/dist) for pages
  → /api/* rewrite → api/index.ts → server/dist/app.js (Express)
  → Prisma → Supabase PostgreSQL
```

Local dev: Vite proxies `/api` to `localhost:4000` ([`client/vite.config.ts`](client/vite.config.ts)).

## Server (`server/src/`)

| Path | Role |
|------|------|
| `app.ts` | Express app: middleware, route mounting, `/api/health` |
| `index.ts` | Local dev only: `app.listen()` |
| `routes/auth.ts` | Register, login, logout, me |
| `routes/tasks.ts` | CRUD + achieve; daily bonuses on achieve |
| `routes/likes.ts` | User-defined likes per tier |
| `routes/tokens.ts` | Unspent token counts + schedule status |
| `routes/spin.ts` | Spend token, run randomizer |
| `routes/wheel-config.ts` | Per-tier wheel slice weights |
| `routes/daily-settings.ts` | Daily bonus tier settings + planning claim |
| `routes/visions.ts` | Vision CRUD; nests goals router |
| `routes/goals.ts` | Goal chain CRUD under `/visions/:visionId/goals` |
| `services/spin.ts` | Outcome roll, like pick, schedule caps |
| `services/tokens.ts` | Aggregate token balances |
| `services/daily-rewards.ts` | Planning / all-musts / all-do-dates bonuses |
| `services/goals.ts` | Goal serialization, penultimate insert |
| `domain/tiers.ts` | Tier order, frequency labels, schedule windows |
| `domain/visions.ts` | `serializeVision` for API JSON |
| `middleware/auth.ts` | JWT from cookie or `Authorization` header |
| `auth/localProvider.ts` | Email/password with bcryptjs |
| `lib/prisma.ts` | Prisma client (singleton for serverless) |
| `lib/env.ts` | Required env vars |

## Client (`client/src/`)

| Path | Role |
|------|------|
| `App.tsx` | Route table (guest / welcome / shell) |
| `components/AppShell.tsx` | Header, tab bar, conditional FAB |
| `api/client.ts` | `fetch` wrapper, credentials, `X-Timezone` |
| `api/types.ts` | DTOs shared across pages |
| `domain/tiers.ts` | Tier names/colors (mirror server enums) |
| `domain/ai-prompts.ts` | Static prompt templates for AI tab |
| `hooks/useTokenRewardQueue.ts` | Queue multiple token modals in sequence |
| `pages/TasksPage.tsx` | List, achieve, token chip |
| `pages/TaskFormPage.tsx` | Create/edit task (also embedded in Calendar) |
| `pages/CalendarPage.tsx` | Day timeline, drag reschedule, planning |
| `pages/LikesPage.tsx` | Likes per tier + spin modal |
| `pages/VisionsPage.tsx` | Vision list |
| `pages/VisionChainPage.tsx` | Vertical goal chain |
| `pages/AiPage.tsx` | Vision / goal breakdown prompt builders |
| `pages/WelcomePage.tsx` | Post-signup onboarding (no shell) |
| `components/RandomizerModal.tsx` | Calls POST `/api/spin`, shows outcome + wheel |

## Database (Prisma)

User-facing names differ from some table names:

- **Task** → `Habit` — tier, sections, schedule, recurrence, achieve/archive
- **Like** → `UserReward` — user’s prize strings per tier
- **Vision** → `Vision` — flat list per user
- **Goal** → `Goal` — chain steps under a vision (`sortOrder` ascending = near vision → furthest)
- **RewardToken** — unspent tokens (`spentAt` null until spin)
- **SpinLog** — audit of spins for schedule enforcement
- **DailySettings** / **DailyBonusClaim** — optional daily milestone tokens
- **TierWheelConfig** — per-user wheel slice layout
- **User** — email + password hash (`googleId` reserved for future OAuth)

Migrations live in `server/prisma/migrations/`.

## Token sources (`RewardToken.source`)

| Source | When |
|--------|------|
| `task_create` | New task saved |
| `task_achieve` | Achieve pressed |
| `daily_planning` | Done planning today (calendar) |
| `daily_all_musts` | All Must do-dates achieved today |
| `daily_all_do_dates` | All do-date tasks achieved today |

Legacy rows may still use `habit_create` / `habit_achieve` or historical `spin_level_up` token grants.

## Spin algorithm (authoritative on server)

1. Reject if schedule cap reached for spent tier.
2. Spend oldest unspent token of that tier.
3. Roll outcome: Win / LevelUp / NoReward / LevelDown (25% each).
4. If Win, LevelUp, or LevelDown (not from Bronze): pick random like (`UserReward`) at effective tier; enforce cap on effective tier. Bronze step down grants nothing.

Client wheel only animates to the index the server returns.

## Onboarding flow

```text
Signup → /welcome → "Click to begin" → /ai
                 → "I already have goals" → /
Login → / (tasks)
```
