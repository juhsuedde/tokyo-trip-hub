# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TokyoTrip Hub is a collaborative travel journal PWA. A group of travelers captures photos, voice notes, and text entries during a trip, which are enriched by AI (transcription, OCR, categorization, sentiment). Entries are displayed in a real-time feed and on a Leaflet map, and can be exported as PDF/EPUB/Markdown.

**Stack:** Node.js 18 / Express 4 backend, React 18 / Vite 5 frontend, PostgreSQL 16 (Prisma 5 ORM), Redis 7 (Bull queues + pub/sub), Socket.io 4 (real-time).

## Development Commands

### Local Development (recommended)

```bash
# Terminal 1: Database & cache
docker compose up postgres redis

# Terminal 2: Backend
cd backend && cp .env.example .env
npm install && npx prisma migrate dev && npx prisma generate && npm run seed
npm run dev

# Terminal 3: Frontend
cd frontend && cp .env.example .env
npm install && npm run dev
```

### Full Docker

```bash
docker compose up --build
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

### Backend (`backend/`)

- `npm run dev` — dev server with nodemon hot reload
- `npm test` — Jest tests (only `__tests__/validation.test.js` exists)
- `npm run lint` — ESLint on `src/`
- `npm run prisma:generate` / `npm run prisma:migrate` — Prisma client management
- `npm run seed` — seeds 4 demo users, 1 trip (invite code `TOKYO1`), 5 entries

### Frontend (`frontend/`)

- `npm run dev` — Vite dev server (port 5173, network-accessible via `--host`)
- `npm run build` — production build

### Mobile Testing

Find local IP with `ipconfig getifaddr en0` (macOS) and access `http://YOUR_IP:5173`. Add IP to `ALLOWED_ORIGINS` in `backend/src/index.js` if CORS blocks.

## Architecture

### Backend (`backend/src/`)

**Entry point:** `index.js` — creates Express app + HTTP server + Socket.io server.

**Middleware chain (order matters):** CORS → Helmet → Pino logger (correlation IDs) → rate limiter → JSON/cookie/file parsers → static `/uploads` (JWT-gated) → `optionalAuth` session middleware.

**Routes:**
- `/api/auth` — JWT auth (register, login, refresh with rotation, password reset). Rate-limited to 5 req/15min.
- `/api/trips` — CRUD, join by invite code, feed (cursor-paginated), members, archive, duplicate
- `/api/entries` — create (enqueues AI jobs), delete, reactions, comments
- `/api/users` — legacy session-token registration
- `/api/export` — PDF/EPUB/MD export via Bull queue
- `/api/apikeys` — API key CRUD (PRO tier)
- `/api/admin` — admin stats, user management

**Background jobs (Bull queues):**
- `ai-processing` — audio transcription + image OCR with multi-provider fallback (Groq → OpenAI for audio; OpenRouter → OpenAI for vision)
- `generate-export` — PDF/EPUB/Markdown generation

**Real-time:** Redis Pub/Sub bridges Bull workers to Socket.io. Events: `new-entry`, `entry-deleted`, `entry-updated`, `ai-processing`, `export-complete`. Clients join `trip:${tripId}` rooms.

### Frontend (`frontend/src/`)

State-based routing in `App.jsx`: no user → `AuthScreen`, has user but no trip → `OnboardScreen`, has both → tabbed Feed + Map.

**Offline-first:** IndexedDB queue stores pending entries. Background Sync API + `online` event trigger automatic retry. `api.js` falls back to offline queue on network errors.

### Database (Prisma)

9 models: User, Trip, TripMembership, Entry, Reaction, Comment, RefreshToken, AuditLog, ApiKey. Key details:
- Users have tiers: FREE (3 trips, 50 entries/trip, markdown export), PREMIUM (unlimited trips, 500 entries/trip, all exports), PRO (unlimited + API + custom domains)
- Trips have unique 6-char invite codes
- Refresh tokens use family tracking for reuse detection
- AuditLog tracks all significant actions

### Auth

Dual system: modern JWT (access 15min + refresh 30d with rotation + family revocation) and legacy temp session tokens. Token extraction supports: Bearer header, `X-Session-Token` header, `token` cookie.

## Key Patterns

- **Validation:** Zod schemas in `lib/validation.js`, applied via `validateAsync` middleware that stores parsed data on `req.validated`
- **Input sanitization:** All user text goes through `sanitizeHtml()` (HTML-entity encoding)
- **AI providers:** Multi-provider factory with fallback chains. Set `MOCK_AI=true` to develop without API costs
- **Storage abstraction:** `STORAGE_TYPE` env switches between `local` (disk), `s3`, `cloudinary`
- **Error handling:** Central Express error handler, Prisma P2002 unique constraint handling, Bull exponential backoff (3 attempts AI, 2 for exports)
- **Subscription enforcement:** `middleware/subscription.js` enforces tier limits before route handlers

## Gotchas

- CORS is strict — origins must match exactly (configured in `index.js`)
- Socket.io shares the same CORS config as Express
- Uploads directory is configurable via `UPLOAD_DIR` env
- Exports directory holds generated PDF/EPUB files
- `node_modules/` are volume-mounted in Docker — don't rely on container-local installs persisting
- The `exportEngine.js` contains large HTML template strings for PDF/EPUB generation
