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
| `routes/habits.ts` | CRUD + achieve; **POST /** mints Bronze token on create |
| `routes/rewards.ts` | User-defined reward lines per tier |
| `routes/tokens.ts` | Unspent token counts + schedule status |
| `routes/spin.ts` | Spend token, run randomizer |
| `services/spin.ts` | Outcome roll, prize pick, schedule caps |
| `services/tokens.ts` | Aggregate token balances |
| `domain/tiers.ts` | Tier order, frequency labels, schedule windows |
| `middleware/auth.ts` | JWT from cookie or `Authorization` header |
| `auth/localProvider.ts` | Email/password with bcryptjs |
| `lib/prisma.ts` | Prisma client (singleton for serverless) |
| `lib/env.ts` | Required env vars |

## Client (`client/src/`)

| Path | Role |
|------|------|
| `App.tsx` | Routes: guest (login/signup) vs protected shell |
| `api/client.ts` | `fetch` wrapper, credentials, timezone header |
| `domain/tiers.ts` | Tier names/colors (mirror server enums) |
| `pages/HabitsPage.tsx` | List, achieve, token chip |
| `pages/HabitFormPage.tsx` | Create/edit habit |
| `pages/RewardsPage.tsx` | Rewards per tier + spin modal |
| `components/RandomizerModal.tsx` | Calls POST `/api/spin`, shows outcome + wheel |

## Database (Prisma)

- **User** — email + password hash (`googleId` reserved for future OAuth)
- **Habit** — tier, one-time vs recurring (`persistAfterDone` / `archivedAt`)
- **UserReward** — user’s prize strings per tier
- **RewardToken** — unspent tokens (`spentAt` null until spin or future use)
- **SpinLog** — audit of spins for schedule enforcement

Migrations live in `server/prisma/migrations/`.

## Token sources (`RewardToken.source`)

| Source | When |
|--------|------|
| `habit_create` | New habit saved |
| `habit_achieve` | Achieve pressed |
| `spin_level_up` | Level-up outcome on spin |

## Spin algorithm (authoritative on server)

1. Reject if schedule cap reached for spent tier.
2. Spend oldest unspent token of that tier.
3. Roll outcome: Win / LevelUp / NoReward / LevelDown (25% each).
4. If Win or LevelUp: pick random `UserReward` at effective tier; enforce cap on effective tier.
5. LevelUp also mints one token at the higher tier.

Client wheel only animates to the index the server returns.
