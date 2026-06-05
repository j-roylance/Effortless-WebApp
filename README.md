# Effortless

Mobile-first life pattern app: tasks, visions, calendar planning, and a token + likes reward loop with a Tron-themed randomizer.

## How it works

1. **Sign up** → welcome screen → AI prompts for vision/goal breakdown, or skip to Tasks.
2. **Tasks** — Must / Should / Could to-dos; **Achieve** earns tier tokens; new tasks grant +1 Bronze.
3. **Calendar** — day timeline for do/due dates; drag to reschedule; daily planning bonus.
4. **Likes** — things you enjoy per tier; **Spin** spends a token (server-side randomizer).
5. **Daily** — optional bonus tokens for planning, all Musts done, all do-dates done.
6. **Vision** — life visions with backward goal chains (check off, edit, add steps).
7. **AI** — generate copy-paste prompts for external assistants (vision/goal breakdown).

Tier schedule limits are enforced on the server. See [`server/src/domain/tiers.ts`](server/src/domain/tiers.ts).

## Repo layout

```text
client/          React UI (Vite) — pages, components, domain helpers
server/          Express API + Prisma schema/migrations
api/             Vercel entry: loads compiled server/dist/app.js
vercel.json      Production build + /api rewrites
```

**New here?** Read [`AGENTS.md`](AGENTS.md) (quick index) then [`ARCHITECTURE.md`](ARCHITECTURE.md) (request flow + naming map).

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
