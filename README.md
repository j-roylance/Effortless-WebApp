# Effortless

Habit tracking with tiered reward tokens and a Tron-themed randomizer.

## Stack

- **Client:** React, Vite, TypeScript
- **Server:** Node.js, Express, Prisma
- **Production:** Vercel (UI + API) + Supabase (PostgreSQL)

## Local setup

```bash
cd server
cp ../.env.example .env   # edit DATABASE_URL, DIRECT_URL, JWT_SECRET
npm install
npx prisma migrate deploy
npm run dev

# second terminal
cd client
npm install
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:4000/api

## Deploy (Vercel + Supabase)

See **[DEPLOY.md](DEPLOY.md)** for step-by-step instructions. No Next.js required.

## Project layout

```text
client/     Vite React frontend
server/     Express API + Prisma
api/        Vercel serverless entry (wraps Express)
vercel.json Deploy config
```
