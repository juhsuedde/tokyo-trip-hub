/**
 * backend/src/index.js  (Phase 3 — adds export routes + queue)
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://192.168.0.245:5173',
  'http://127.0.0.1:5173',
];

const { prisma } = require('./lib/prisma');
const { redisClient } = require('./lib/redis');
const { sessionMiddleware } = require('./middleware/session');
const { optionalAuth } = require('./middleware/auth');
const { enforceExportFormat } = require('./middleware/subscription');
const tripsRouter = require('./routes/trips');
const entriesRouter = require('./routes/entries');
const usersRouter = require('./routes/users');
const exportRouter = require('./routes/export');
const authRouter = require('./routes/auth');

// Register Bull queue workers
require('./queues/aiQueue');
require('./queues/exportQueue');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, origin);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
});

// Make io available to Bull queue workers
global.__io = io;
app.set('io', io);

io.on('connection', (socket) => {
  socket.on('join-trip', (tripId) => socket.join(`trip:${tripId}`));
  socket.on('leave-trip', (tripId) => socket.leave(`trip:${tripId}`));
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const exportsDir = process.env.EXPORTS_DIR || path.join(__dirname, '..', 'exports');
if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 },
  useTempFiles: true,
  tempFileDir: '/tmp/',
}));

app.use('/uploads', express.static(uploadDir));

// Token auth middleware
app.use(optionalAuth);

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/users', usersRouter);
app.use('/api/export', enforceExportFormat, exportRouter);
// Export trigger also lives under trips namespace
app.use('/api', exportRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] TokyoTrip API running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  redisClient.quit();
  process.exit(0);
});