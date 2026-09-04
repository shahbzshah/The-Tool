# CodeZen Flow — MVP

Mindfulness meets momentum — detect flow, reduce stress, and build zen streaks right inside your workflow.

Implementation of the docs in `../codezen-flow-vscode-pack/docs` (MASTER_PROMPT architecture).

## Structure

- `backend/` — Express 4 + TypeScript + Prisma (SQLite dev DB) API on `:4000` (`GET /health`)
- `frontend/` — React 18 + Vite + Tailwind v3 + Zustand + Recharts SPA on `:5173` (proxies `/api/*` -> `:4000`; falls back to mock data when the backend is offline)

## Quickstart

```bash
# Backend (two lines):
cd backend && npm install && npx prisma db push && npm run db:seed && npm run dev

# Frontend:
cd frontend && npm install && npm run dev
```

Open http://localhost:5173 — the demo user `dev@codezenflow.com` is seeded with 7 days of commits, issues, meditation sessions and weekly scores.

## Auth

`POST /api/v1/auth/login` with `{ "provider": "github", "code": "demo" }` issues a demo JWT (Cler.k/PR OAuth2 swap-in point). All other `/api/v1` endpoints require `Authorization: Bearer <token>`.

## API (per docs/API_SPEC.md)

`/health`, `/auth/login`, `/dashboard`, `/flow/tracker`, `/flow/triggers`, `/meditations`, `/meditations/:id/start`, `/streaks`, `/mood/checkins`, `/mood/sentiments`, `/score/weekly`, `/settings`, `/settings/integrations/:provider`, `/webhooks/github` (HMAC `X-Hub-Signature-256` verified when `GITHUB_WEBHOOK_SECRET` is set).

## Quality gates

```bash
cd backend && npm test      # 16 Jest unit tests (flow detector, mood analyzer, streaks)
cd backend && npm run build # tsc
cd frontend && npm run build # tsc + vite build
```

## Next steps (out of scope for MVP)

VS Code extension (`extensions/vscode-codezen-flow`), Socket.IO push, Clerk.dev auth, Redis/BullMQ jobs, real GitHub/GitLab OAuth, Postgres provider swap.