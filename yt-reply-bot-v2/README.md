# yt-reply-bot-v2

Second-generation AlvinHub comment-reply bot. Built alongside the existing
`yt-reply-bot` (not replacing it yet) — same YouTube channel, same Google
Cloud project, same 500,000 units/day quota.

## What it does differently from v1

1. **Reply filter**: skips a comment thread if you (the channel owner) have
   *ever* replied in it — no re-replying, no chasing whether the commenter
   responded back. See `backend/src/filter/shouldReply.js`.
2. **Reply voice**: replies are generated with a single editable style prompt
   (`backend/src/replies/stylePrompt.js`) aimed at sounding like you —
   personal, warm, occasionally funny, no corporate filler. No keyword
   special-casing (you decided against that) — it's one consistent voice
   applied to every comment. Drop real (comment → your reply) examples into
   `EXAMPLE_REPLIES` in that file whenever you want to sharpen it further;
   nothing else needs to change.

## Feature parity with v1 (rebuilt here)

- Configurable scan interval (10 / 20 / 30 / 60 min presets or custom)
- Per-video targeting (track/untrack specific videos)
- Manual catch-up ("reply to everything unreplied on this video now")
- Manual "scan all now"
- Auto-pause at a configurable daily unit threshold
- Recent-reply log

## Architecture

```
backend/   Node/Express API + BullMQ workers + serves the built dashboard
  src/youtube/    YouTube Data API v3 client + quota tracking
  src/filter/     "have I already replied?" logic
  src/replies/    Claude-generated reply text + the editable style prompt
  src/jobs/       BullMQ queue: scan (read) and reply (write) as separate jobs
  src/scheduler.js  Repeatable scan job, interval read from Postgres settings
  src/routes/api.js Dashboard API
  src/db/schema.sql Postgres schema (videos, replied_threads, quota_usage, settings)

frontend/  React + Vite dashboard — built to frontend/dist, then served by
           the backend as static files. One Railway service, one URL,
           no separate hosting, no CORS to configure.
```

Reads (scanning, 1 unit/page) and writes (posting replies, 50 units each) are
two separate BullMQ queues on purpose: a slow/backlogged scan never blocks
replies from going out, and the reply worker is rate-limited independently
(`REPLY_POST_DELAY_MS`) so posts go out spaced apart rather than bursting.

## Setup (local)

```bash
cd backend
cp .env.example .env   # fill in the SAME YT_* credentials as v1, plus ANTHROPIC_API_KEY
npm install
cd ../frontend
npm install
npm run build            # produces frontend/dist, which the backend will serve
cd ../backend
npm run start             # runs migration, then starts the server, workers, and the built dashboard
```
Open http://localhost:3000 — that's both the dashboard and the API.

## Deploy — single Railway service

One service does everything: API, workers, scheduler, and dashboard.

1. New Project → Deploy from GitHub repo → select this repo.
2. In the service's Settings:
   - **Root Directory**: point it at the folder containing both `backend/`
     and `frontend/` (check your repo's actual layout — if you uploaded via
     GitHub's web UI, this may be nested one level deeper than you expect).
   - **Build Command**: `npm install --prefix frontend && npm run build --prefix frontend && npm install --prefix backend`
   - **Start Command**: `npm run start --prefix backend`
3. Add a Postgres plugin and a Redis plugin to the same Railway project —
   they auto-fill `DATABASE_URL` and `REDIS_URL`.
4. In Variables, add `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`,
   `YT_CHANNEL_ID`, `ANTHROPIC_API_KEY`.
5. Deploy. Check Deploy Logs for `listening on` and `Scanning every`.
6. Settings → Networking → Generate Domain if you want a public URL to open
   the dashboard from outside Railway.

Nothing gets deployed to Netlify for this version.

## What I couldn't verify from here

- I don't have v1's actual code/UI, only the feature list from your notes —
  this dashboard matches the *functionality* (interval control, per-video
  targeting, auto-pause, catch-up), not necessarily the exact layout. Send
  over the old repo or a screenshot if you want this to visually match it.
- No live test against the YouTube or Anthropic APIs from this environment
  (no network access to googleapis.com from here) — syntax-checked every
  file, but the actual OAuth/posting flow needs testing with your real
  credentials once deployed.
- `google-auth-library`/`googleapis` package versions are recent as of my
  training but worth a quick `npm outdated` check before you deploy, since
  Google ships new majors fairly often.

## Cutover plan (once this is stable)

Run both bots in parallel with v1 pointed at a *different* set of tracked
videos than v2 (or v1 paused) to avoid double-replying to the same threads —
they don't share a database, so nothing here stops both bots from acting on
the same comment if both are live and untracked-video-overlap happens. Once
you're confident in v2, retire v1's workers (Railway service can stay up for
the dashboard/history or be decommissioned).
