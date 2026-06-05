# Agent notes (Effortless)

## Product in one sentence

Tasks earn tier tokens; users define likes per tier and spin to win them, with server-side randomness and schedule limits.

## Where to change things

- **New API route** → `server/src/routes/`, mount in `server/src/app.ts`
- **Tier limits / labels** → `server/src/domain/tiers.ts` and `client/src/domain/tiers.ts` (keep in sync)
- **Spin logic** → `server/src/services/spin.ts`
- **UI screens** → `client/src/pages/`
- **Schema** → `server/prisma/schema.prisma` then `npx prisma migrate dev`

## Do not commit

- `server/.env`, any secrets
- `node_modules/`, `dist/`, `server/dist/`, `client/dist/`

## Deploy

Root is `.` on Vercel; `vercel.json` builds `server` then `client`. API handler is `api/index.ts` importing `server/dist/app.js` — run `npm run build` in `server/` before relying on compiled output locally.

## Common pitfalls

- Vercel project root must be repo root, not `client/`
- `JWT_SECRET` and `CLIENT_URL` required in production
- Supabase: `DATABASE_URL` = pooler :6543, `DIRECT_URL` = session :5432
