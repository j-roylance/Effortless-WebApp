# Deploy Effortless (Vercel + Supabase)

No Next.js required. The React app and Express API deploy together on **Vercel**. **Supabase** provides PostgreSQL.

## Architecture

```text
Browser → https://your-app.vercel.app
         ├── static files (Vite / client)
         └── /api/* → Vercel Serverless Function (Express via api/index.ts)
                      └── Supabase Postgres (Prisma)
```

Same domain for UI and API → login cookies work without a third host.

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Settings → Database → Connection string**
3. Copy two URLs:
   - **Transaction pooler** (port **6543**, `pgbouncer=true`) → `DATABASE_URL`
   - **Direct / Session** (port **5432**) → `DIRECT_URL`
4. Replace `[YOUR-PASSWORD]` with your database password.

## 2. Vercel

1. Import GitHub repo `j-roylance/Effortless-WebApp` at [vercel.com](https://vercel.com).
2. **Root Directory:** leave as **`.`** (repo root) — `vercel.json` configures builds.
3. **Environment variables** (Production + Preview):

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Supabase transaction pooler URI |
| `DIRECT_URL` | Supabase direct URI |
| `JWT_SECRET` | Long random secret |
| `NODE_ENV` | `production` |
| `CLIENT_URL` | `https://your-production-domain.vercel.app` (recommended) |

4. Deploy. Build runs `prisma migrate deploy` then builds the client.

## 3. Verify

- `https://your-app.vercel.app` — UI loads
- `https://your-app.vercel.app/api/health` — `{"ok":true}`
- Sign up, add a habit, refresh — data persists in Supabase

In Supabase **Table Editor**, you should see `User`, `Habit`, `UserReward`, etc.

## Local development (unchanged)

```bash
# Postgres running locally (or use Supabase URLs in server/.env)
cd server && npm install && npx prisma migrate deploy && npm run dev
cd client && npm install && npm run dev
```

For local Supabase, put pooler URL in `DATABASE_URL` and direct URL in `DIRECT_URL` in `server/.env`.

Optional: `npx vercel dev` at repo root runs frontend + API like production.

## GitHub auto-deploy

Push to `main` → Vercel rebuilds and runs migrations.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on migrate | Check `DIRECT_URL` and Supabase IP allowlist (Vercel IPs or allow all for MVP) |
| 500 on API | Vercel → Deployments → Functions → logs |
| Login fails | `CLIENT_URL` must match the URL in your browser exactly |
| Prisma connection errors | Use pooler URL for `DATABASE_URL`, not direct |
