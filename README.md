# The-Tool — Opportunity Hunter + Ideas App

Find underrated Play Store opportunities, refine them with AI, design, document, and export a complete build pack.

## Pipeline

**Hunter → Refine → Design → Docs → Export**

1. **Hunter** — Scan the Play Store by keyword. Apps are scored on rating, installs, and competition gap. Includes Idea Radar (trending HN stories) and a daily watchlist cron.
2. **Refine** — Chat with AI to sharpen the idea. The Living Idea Specification updates live from the conversation.
3. **Design** — Generate a Stitch prompt, upload Stitch exports, feature-coverage checklist.
4. **Docs** — Generate 14 document kinds (PRD, BRD, Technical Spec, User Stories, Workflow, DB Schema, API Spec, Design System, UI inventory, Folder Structure, Rules, Master Prompt, Build Guide, Refined Brief).
5. **Export** — Download a zip pack with all docs, plus an agent-skills bundle.

## Quickstart

```bash
npm install
# Required env:
#   DATABASE_URL=postgresql://...
#   NVIDIA_API_KEY=...
# Optional:
#   NVIDIA_MODEL=meta/llama-3.2-11b-vision-instruct
#   AUTH_SECRET=...        # auto-generated and stored if unset
#   ADMIN_EMAIL=...        # defaults to admin@gmail.com
npx prisma generate && npx prisma db push
npm run dev
```

Open http://localhost:3000 — register an account to start.

## AI provider

NVIDIA only (`https://integrate.api.nvidia.com/v1`). API key resolves from `NVIDIA_API_KEY` env var first, then the encrypted Settings store.

## Daily watchlist

`POST /api/hunter/watchlist` runs keyword scans. Authenticated via Ed25519 request signatures (public key in Settings → Cron Public Key). The cron job `thetool-daily-watchlist-scan` fires daily at 06:51 EAT.

## Project structure

- `src/app/` — Next.js 14 app router pages + API routes
- `src/lib/` — AI client, auth, Hunter (scraper/scoring/trends), doc generation, settings
- `src/components/` — UI components
- `prisma/` — schema + backfill scripts
