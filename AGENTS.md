# TokyoTrip Hub - Agent Guidelines

## 🚀 Development Setup

### Docker (Recommended)
```bash
# Start all services
docker compose up --build

# Initialize database (separate terminal)
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

### Local Development
**Terminal 1 - Database & Cache:**
```bash
docker compose up postgres redis
```

**Terminal 2 - Backend:**
```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma generate
npm run dev
```

**Terminal 3 - Frontend:**
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## 🔧 Key Commands

- **API Health Check:** `GET http://localhost:3001/api/health`
- **Frontend PWA:** `http://localhost:5173`
- **Apply Migrations:** `npx prisma migrate dev` (in backend/)
- **Seed Data:** `npm run seed` (in backend/)
- **Generate Prisma Client:** `npx prisma generate`

## 📱 Mobile Testing

1. Find local IP: `ipconfig getifaddr en0` (macOS) or `hostname -I` (Linux)
2. Access frontend: `http://YOUR_IP:5173`
3. If CORS fails, add IP to `ALLOWED_ORIGINS` in `backend/src/index.js`

## ⚙️ Environment

**Backend (.env):**
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tokyotrip?schema=public"
REDIS_URL="redis://localhost:6379"
OPENAI_API_KEY=sk-...
MOCK_AI=true  # Use false for real OpenAI calls
BASE_URL=http://backend:3001
PORT=3001
UPLOAD_DIR="./uploads"
```

**Frontend (.env):**
```
VITE_API_URL=http://localhost:3001
```

## 🧪 AI Development

- Set `MOCK_AI=true` to develop without OpenAI costs
- Real AI processing requires valid `OPENAI_API_KEY` and `MOCK_AI=false`

## 📦 Project Structure

- `backend/` - Node.js/Express API with Prisma, Socket.io, Bull queues
- `frontend/` - React PWA with Vite, Workbox, Leaflet
- `docker-compose.yml` - Orchestrates PostgreSQL, Redis, backend, frontend
- `prisma/` - Database schema and migrations

## ⚠️ Gotchas

- Build artifacts: `node_modules/` directories are volume-mounted in Docker
- Uploads directory: Configured via `UPLOAD_DIR`/env var
- Exports directory: Used for PDF/EPUB generation (Phase 3)
- CORS is strict - must match frontend origin exactly
- Socket.io uses same CORS config as Express

## 🔄 Command Order

When setting up fresh:
1. Start DB/cache: `docker compose up postgres redis`
2. Run migrations: `npx prisma migrate dev`
3. Generate Prisma client: `npx prisma generate`
4. Seed data: `npm run seed`
5. Start backend: `npm run dev`
6. Start frontend: `npm run dev` (separate terminal)