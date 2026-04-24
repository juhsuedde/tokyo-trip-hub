/**
 * backend/src/index.js
 */
const http = require('http');
const { Server } = require('socket.io');
const { logger } = require('./lib/logger');
const { createApp } = require('./app');
const { redisSub } = require('./lib/redis');

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://192.168.0.245:5173')
  .split(',').map(s => s.trim());

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? (origin, callback) => {
          if (!origin) return callback(new Error('Origin required'));
          if (ALLOWED_ORIGINS.includes(origin)) return callback(null, origin);
          return callback(new Error('Not allowed by CORS'));
        }
      : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
});

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

// Register Bull queue workers
require('./queues/aiQueue');
require('./queues/exportQueue');

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

      const { prisma } = require('./lib/prisma');
      const { redisClient } = require('./lib/redis');
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
