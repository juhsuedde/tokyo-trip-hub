// backend/src/index.js  (Phase 4 — diff from Phase 3)
// Changes:
//   1. Mount /api/auth router
//   2. Add cookie-parser (for httpOnly cookie fallback)
//   3. Apply optionalAuth globally so req.user is available everywhere
//   4. Update /api/trips and /api/entries to require auth via their own routers
//
// Everything below the "── UNCHANGED FROM PHASE 3 ──" marker is identical
// to the existing index.js — only the additions are shown. Merge carefully.

import express from 'express';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';            // NEW Phase 4

// Existing routers
import tripsRouter from './routes/trips.js';         // REPLACED in Phase 4
import entriesRouter from './routes/entries.js';     // UNCHANGED
import exportRouter from './routes/export.js';       // UNCHANGED

// New Phase 4 router
import authRouter from './routes/auth.js';           // NEW Phase 4

// Middleware
import { optionalAuth } from './middleware/auth.js'; // NEW Phase 4
import { enforceExportFormat } from './middleware/subscription.js'; // NEW Phase 4

const app = express();
const server = http.createServer(app);

// ── CORS — same as Phase 3, add cookie credentials support ───────────────────
app.use(cors({
  origin: [
    'http://localhost:5173',
    /^http:\/\/192\.168\.\d+\.\d+:5173$/,
  ],
  credentials: true,              // needed for httpOnly cookie auth
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());          // NEW Phase 4 — must be before auth middleware

// Soft auth globally: attaches req.user if token present, never rejects
app.use(optionalAuth);            // NEW Phase 4

// ── Static file serving (uploads) — unchanged ────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';
app.use('/uploads', express.static(UPLOAD_DIR));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);                         // NEW Phase 4
app.use('/api/trips', tripsRouter);                       // REPLACED (auth inside)
app.use('/api/entries', entriesRouter);                   // UNCHANGED
app.use('/api/export', enforceExportFormat, exportRouter); // Phase 4: tier check added

// ── Health check — unchanged ──────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, phase: 4 }));

// ── Socket.io — unchanged from Phase 3 ───────────────────────────────────────
const io = new SocketIO(server, {
  cors: { origin: '*' },          // tighten in production
});

io.on('connection', (socket) => {
  socket.on('join-trip', (tripId) => socket.join(tripId));
  socket.on('leave-trip', (tripId) => socket.leave(tripId));
});

// Make io available to route handlers via app.locals
app.locals.io = io;

// ── Error handler — unchanged ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3001;
server.listen(PORT, () => {
  console.log(`🚀 TokyoTrip Hub backend listening on :${PORT} (Phase 4)`);
});
