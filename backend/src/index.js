/**
 * backend/src/index.js  (Phase 3 — adds export routes + queue)
 */
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is required. Set it in .env');
  process.exit(1);
}

const { logger, expressMiddleware } = require('./lib/logger');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map(s => s.trim());

const { prisma } = require('./lib/prisma');
const { redisClient, redisSub } = require('./lib/redis');
const { optionalAuth } = require('./middleware/session');
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
      if (!origin && process.env.NODE_ENV !== 'development') {
        return callback(new Error('Origin required'));
      }
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, origin);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
});

// Make io available to Bull queue workers
global.__io = io;
app.set('io', io);

const CHANNEL = 'tokyotrip:notifications';
redisSub.subscribe(CHANNEL);
redisSub.on('message', (channel, message) => {
  if (channel !== CHANNEL) return;
  try {
    const { tripId, event, payload } = JSON.parse(message);
    io.to(`trip:${tripId}`).emit(event, payload);
  } catch {}
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
  if (!token) return next(new Error('Authentication required'));
  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = payload;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  socket.on('join-trip', (tripId) => socket.join(`trip:${tripId}`));
  socket.on('leave-trip', (tripId) => socket.leave(`trip:${tripId}`));
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin && process.env.NODE_ENV !== 'development') {
      return callback(new Error('Origin required'));
    }
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(expressMiddleware);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const tmpDir = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const exportsDir = process.env.EXPORTS_DIR || path.join(__dirname, '..', 'exports');
if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 },
  useTempFiles: true,
  tempFileDir: path.join(__dirname, '..', 'tmp'),
  abortOnLimit: true,
  responseOnLimit: 'File too large (max 50MB)',
}));

function serveUploadsWithAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.use('/uploads', serveUploadsWithAuth, uploadLimiter, express.static(uploadDir, {
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'private, max-age=3600');
  },
}));

// Token auth middleware
app.use(optionalAuth);

// API Routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter);
app.use('/api/auth', authRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/users', usersRouter);
app.use('/api/export', enforceExportFormat, exportRouter);

const apikeysRouter = require('./routes/apikeys');
const adminRouter = require('./routes/admin');

app.use('/api/apikeys', apikeysRouter.router);
app.use('/api/admin', adminRouter);

app.get('/api/health', async (req, res) => {
  const checks = {
    postgres: { status: 'unknown' },
    redis: { status: 'unknown' },
    queue: { status: 'unknown' },
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres.status = 'ok';
  } catch (err) {
    checks.postgres.status = 'error';
    checks.postgres.error = err.message;
  }

  try {
    await redisClient.ping();
    checks.redis.status = 'ok';
  } catch (err) {
    checks.redis.status = 'error';
    checks.redis.error = err.message;
  }

  try {
    const { aiQueue } = require('./queues/aiQueue');
    const counts = await aiQueue.getJobCounts();
    checks.queue.status = 'ok';
    checks.queue.jobs = counts;
  } catch (err) {
    checks.queue.status = 'error';
    checks.queue.error = err.message;
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

app.use((err, req, res, next) => {
  logger.error({ err, correlationId: req.correlationId }, err.message || 'Internal server error');
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'TokyoTrip API running');
  
  if (process.env.NODE_ENV !== 'test') {
    const { startDataRetentionJobs } = require('./lib/dataRetention');
    startDataRetentionJobs();
  }
});

async function gracefulShutdown(signal) {
  logger.info({ signal }, 'Shutting down gracefully');
  
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      const { aiQueue } = require('./queues/aiQueue');
      const counts = await aiQueue.getJobCounts();
      logger.info({ activeJobs: counts.active }, 'Active jobs count');
      
      if (counts.active > 0) {
        logger.info({ activeJobs: counts.active }, 'Waiting for active jobs to complete');
        await aiQueue.close();
      }
      
      await prisma.$disconnect();
      redisClient.quit();
      redisSub.quit();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Shutdown error');
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));