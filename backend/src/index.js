require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');

// Allowed CORS origins
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://192.168.0.245:5173',
  'http://127.0.0.1:5173',
];

const { prisma } = require('./lib/prisma');
const { redisClient } = require('./lib/redis');
const { sessionMiddleware, attachUser } = require('./middleware/session');

const tripsRouter = require('./routes/trips');
const entriesRouter = require('./routes/entries');
const usersRouter = require('./routes/users');

const app = express();
const server = http.createServer(app);

// ── Socket.io ──────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
        return callback(null, origin);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
});

// Attach io to app so routes can emit
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`[WS] client connected: ${socket.id}`);

  socket.on('join-trip', (tripId) => {
    socket.join(`trip:${tripId}`);
    console.log(`[WS] ${socket.id} joined trip:${tripId}`);
  });

  socket.on('leave-trip', (tripId) => {
    socket.leave(`trip:${tripId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[WS] client disconnected: ${socket.id}`);
  });
});

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      return callback(null, origin);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  useTempFiles: true,
  tempFileDir: '/tmp/',
}));

// Serve uploaded files statically
app.use('/uploads', express.static(uploadDir));

// Session: reads X-Session-Token header, attaches req.sessionToken
app.use(sessionMiddleware);

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/trips', tripsRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/users', usersRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error handler ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] TokyoTrip API running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  redisClient.quit();
  process.exit(0);
});