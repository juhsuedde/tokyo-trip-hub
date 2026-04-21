# TokyoTrip Hub — Phase 1 MVP

Collaborative travel capture PWA for groups. Phase 1 delivers the full data flow end-to-end:
users → sessions → trips → real-time entries → reactions → comments.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite PWA |
| Backend | Node.js + Express + Socket.io |
| Database | PostgreSQL 16 via Prisma ORM |
| Cache / Queue | Redis 7 |
| Media | Local disk (`/uploads`) — swap to S3/Cloudinary in Phase 2 |

---

## Quickstart

```bash
# 1. Clone and enter
git clone <repo> && cd tokyotrip

# 2. Start everything
docker-compose up --build

# 3. (First run only) Run migrations + seed demo data
docker-compose exec backend npx prisma migrate deploy
docker-compose exec backend npm run seed
```

App is live at:
- **Frontend PWA**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **API health**: http://localhost:3001/api/health

---

## Demo credentials (after seeding)

| Name | Session Token | Role |
|------|--------------|------|
| Alex | `demo-session-alex` | Owner |
| Yuki | `demo-session-yuki` | Member |
| Kai  | `demo-session-kai`  | Member |
| Sara | `demo-session-sara` | Member |

**Invite code**: `TOKYO1`

To use a demo session token via the API:
```
X-Session-Token: demo-session-alex
```

---

## API Reference

### Users

```
POST /api/users/register
Body: { "name": "Alex" }
Response: { user, sessionToken }

GET /api/users/me
Header: X-Session-Token: <token>
```

### Trips

```
POST /api/trips
Header: X-Session-Token
Body: { "title": "Tokyo Spring 2026", "startDate": "2026-04-20", "endDate": "2026-04-28" }
Response: { trip }  ← includes inviteCode

POST /api/trips/:inviteCode/join
Header: X-Session-Token
Response: { trip, membership }

GET /api/trips/:id
GET /api/trips/:id/feed?cursor=<entryId>&limit=20
GET /api/trips/:id/members
```

### Entries

```
POST /api/entries/trips/:tripId/entries
Header: X-Session-Token
# For TEXT:
Body (JSON): { type: "TEXT", rawText: "...", latitude?, longitude?, address?, capturedAt? }

# For PHOTO/VOICE/VIDEO:
Body (multipart): file=<binary>, type="PHOTO", rawText?, latitude?, longitude?

DELETE /api/entries/:id
```

### Reactions

```
POST /api/entries/:id/reactions
Body: { "emoji": "❤️" }
# Toggles — add if not present, remove if already reacted with same emoji
```

### Comments

```
POST /api/entries/:id/comments
Body: { "text": "Amazing!" }
```

---

## WebSocket Events

Connect to `ws://localhost:3001` via Socket.io, then:

```js
// Join a trip room
socket.emit('join-trip', tripId)

// Incoming events
socket.on('new-entry',       ({ entry }) => ...)
socket.on('entry-deleted',   ({ entryId }) => ...)
socket.on('reaction-updated',({ entryId, reactions }) => ...)
socket.on('new-comment',     ({ entryId, comment }) => ...)
socket.on('member-joined',   ({ tripId, user }) => ...)
```

---

## Data Model

```
User          — id, name, avatar, tempSession
Trip          — id, title, destination, dates, inviteCode, status
TripMembership— userId, tripId, role (OWNER|MEMBER)
Entry         — id, tripId, userId, type, rawText, contentUrl,
                transcription (Phase 2), ocrText (Phase 2),
                lat/lng, address, category, sentiment, tags[], createdAt
Reaction      — entryId, userId, emoji (unique per triple)
Comment       — entryId, userId, text
```

---

## Project Structure

```
tokyotrip/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma        ← Full data model
│   └── src/
│       ├── index.js             ← Express + Socket.io server
│       ├── lib/
│       │   ├── prisma.js        ← Prisma client singleton
│       │   ├── redis.js         ← Redis client
│       │   └── seed.js          ← Demo data
│       ├── middleware/
│       │   └── session.js       ← Session token auth
│       └── routes/
│           ├── trips.js         ← Trip CRUD + feed
│           ├── entries.js       ← Entry CRUD + file upload + reactions + comments
│           └── users.js         ← Register + /me
└── frontend/
    ├── Dockerfile
    ├── vite.config.js           ← Vite + PWA plugin
    └── src/
        ├── App.jsx              ← Root, session restore, tab routing
        ├── lib/
        │   ├── api.js           ← All fetch calls
        │   └── media.js         ← Image compression + FormData builder
        ├── hooks/
        │   └── useSocket.js     ← Socket.io hook
        ├── screens/
        │   ├── OnboardScreen.jsx← Register + create/join trip
        │   ├── FeedScreen.jsx   ← Main feed + real-time updates
        │   └── MapScreen.jsx    ← Geotagged entries (real map in Phase 2)
        └── components/
            ├── EntryCard.jsx    ← Feed entry with reactions + comments
            ├── CaptureBar.jsx   ← Text + photo capture with compression
            └── InviteModal.jsx  ← Invite code + member list
```

---

## Phase 2 Checklist (after Phase 1 is stable)

- [ ] **Offline / IndexedDB** — capture queue when offline, sync on reconnect
- [ ] **AI Pipeline** — Whisper transcription, GPT-4V OCR, auto-categorisation
- [ ] **Voice recording** — MediaRecorder API → upload → transcribe
- [ ] **Video capture** — compress to 720p H.264 before upload
- [ ] **Real map** — Leaflet + OpenStreetMap tiles with actual pin positions
- [ ] **S3/Cloudinary** — swap local `/uploads` disk for cloud media storage
- [ ] **Export engine** — Puppeteer PDF generation from trip entries
- [ ] **PWA offline app shell** — Service Worker + IndexedDB background sync

---

## Development (without Docker)

```bash
# Backend
cd backend
cp .env.example .env          # edit DATABASE_URL + REDIS_URL
npm install
npx prisma migrate dev
npm run seed
npm run dev                   # http://localhost:3001

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

---

## Deployment (Railway / Render)

1. Push repo to GitHub
2. Create services: PostgreSQL, Redis, web service (backend), static site (frontend)
3. Set env vars from `.env.example`
4. Backend start command: `npx prisma migrate deploy && node src/index.js`
5. Frontend build command: `npm run build`, publish dir: `dist`
6. Update `FRONTEND_URL` in backend and `VITE_API_URL` in frontend to production URLs
# trip-hub
