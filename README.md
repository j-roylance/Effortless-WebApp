# Effortless

Habit tracking with tiered reward tokens and a Tron-themed randomizer.

## Stack

- **Client:** React, Vite, TypeScript
- **Server:** Node.js, Express, Prisma, PostgreSQL

## Local setup

```bash
docker compose up -d
cp .env.example server/.env
cd server && npm install && npx prisma migrate dev && npm run dev
cd client && npm install && npm run dev
```

- App: http://localhost:5173
- API: http://localhost:4000/api
