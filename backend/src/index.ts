/**
 * backend/src/index.ts
 * Entry point — creates HTTP server, Socket.io, Bull workers.
 */
import 'dotenv/config';
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from './lib/logger';
import { createApp } from './app';
import { redisSub, redisClient } from './lib/redis';
import { ALLOWED_ORIGINS } from './config';
import { aiQueue } from './queues/aiQueue';
import './queues/exportQueue';
import { prisma } from './lib/prisma';
import { startDataRetentionJobs } from './lib/dataRetention';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const app = createApp(ALLOWED_ORIGINS);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: IS_PRODUCTION
      ? (origin: string | undefined, callback: (err: Error | null, origin?: string) => void) => {
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
redisSub.on('message', (channel: string, message: string) => {
  if (channel !== CHANNEL) return;
  try {
    const { tripId, event, payload } = JSON.parse(message) as { tripId: string; event: string; payload: unknown };
    io.to(`trip:${tripId}`).emit(event, payload);
  } catch (err) {
    logger.error({ err, message }, 'Failed to process Redis notification');
  }
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!);
    socket.data.user = payload;
    next();
  } catch (err) {
    const message = (err as Error).name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    next(new Error(message));
  }
});

io.on('connection', (socket) => {
  socket.on('join-trip', (tripId: string) => socket.join(`trip:${tripId}`));
  socket.on('leave-trip', (tripId: string) => socket.leave(`trip:${tripId}`));
});

const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'TokyoTrip API running');

  if (process.env.NODE_ENV !== 'test') {
    startDataRetentionJobs();
  }
});

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully');

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
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
