# Effortless

Mobile-first life pattern app: split to-dos and things you like into achievement and reward. Complete tasks to earn tiered tokens, list personal likes per tier, and spend tokens on a Tron-themed server-side randomizer.

## How it works

1. **Sign up / log in** — session stored in an httpOnly cookie.
2. **Tasks tab** — add to-dos; each new task grants **+1 Bronze token**; **Achieve** grants a token at that task’s tier.
3. **Likes tab** — list things you enjoy per tier (Bronze → Galactic); **Spin** spends one token of that tier.
4. **Randomizer** — 25% win, 25% level up, 25% nothing, 25% step down; wins pick from your likes list (spinner animation follows the server result).

Tier schedule limits (e.g. 20 Bronze wins per day) are enforced on the server. See [`server/src/domain/tiers.ts`](server/src/domain/tiers.ts).

## Repo layout

```text
client/          React UI (Vite)
server/          Express API + Prisma schema/migrations
api/             Vercel entry: loads compiled server/dist/app.js
vercel.json      Production build + /api rewrites
```

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for request flow, data model, and where to change behavior.

## Local development

```bash
# 1. Configure database (Supabase or local Postgres)
cp .env.example server/.env
# Edit server/.env: DATABASE_URL, DIRECT_URL, JWT_SECRET

# 2. API
cd server && npm install && npx prisma migrate deploy && npm run dev

# 3. UI (second terminal)
cd client && npm install && npm run dev
```

- App: http://localhost:5173 (proxies `/api` → http://localhost:4000)
- Health: http://localhost:4000/api/health

## Production (Vercel + Supabase)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Supabase **transaction** pooler (port 6543, `pgbouncer=true`) |
| `DIRECT_URL` | Supabase **session** pooler (port 5432) — migrations only |
| `JWT_SECRET` | Auth signing secret (required) |
| `CLIENT_URL` | e.g. `https://effortless-azure.vercel.app` |
| `NODE_ENV` | `production` |

1. Import this repo on Vercel with **root directory** `.` (not `client/`).
2. Set env vars above → deploy.
3. Verify `/api/health` and sign-up on your Vercel URL.

Push to `main` triggers automatic redeploys.

## Scripts

| Location | Command | Purpose |
|----------|---------|---------|
| `server/` | `npm run dev` | API with hot reload |
| `client/` | `npm run dev` | Vite dev server |
| `server/` | `npx prisma migrate deploy` | Apply DB migrations |
| `server/` | `npm run build` | Compile API to `dist/` (used by Vercel) |
