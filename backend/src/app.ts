/**
 * Express app factory — separated from server.listen for testing.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';

import { logger, expressMiddleware } from './lib/logger';
import { prisma } from './lib/prisma';
import { optionalAuth } from './middleware/auth';
import { enforceExportFormat } from './middleware/subscription';
import authRouter from './routes/auth';
import tripsRouter from './routes/trips';
import entriesRouter from './routes/entries';
import usersRouter from './routes/users';
import exportRouter from './routes/export';
import { router as apikeysRouter } from './routes/apikeys';
import adminRouter from './routes/admin';
import { redisClient } from './lib/redis';

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is required. Set it in .env');
  process.exit(1);
}

function createApp(allowedOrigins?: string[]) {
  const app = express();

  const origins = allowedOrigins || [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  const corsOrigin = process.env.NODE_ENV === 'production'
    ? (origin: string | undefined, callback: (err: Error | null, origin?: string) => void) => {
        if (!origin) return callback(new Error('Origin required'));
        if (origins.includes(origin)) return callback(null, origin);
        return callback(new Error('Not allowed by CORS'));
      }
    : true;

  app.use(cors({
    origin: corsOrigin,
    credentials: true,
  }));

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(expressMiddleware);

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? Infinity : 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req): string => {
      return req.user?.id || req.ip || 'unknown';
    },
  });

  app.use('/api', limiter);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  });
  app.use(upload.any());

  app.use('/uploads', uploadLimiter, express.static(uploadDir, {
    setHeaders: (res, _path) => {
      res.set('Cache-Control', 'private, max-age=3600');
    },
  }));

  app.use(optionalAuth);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? Infinity : 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/auth', authLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/trips', tripsRouter);
  app.use('/api/entries', entriesRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/export', enforceExportFormat, exportRouter);

  app.use('/api/apikeys', apikeysRouter);
  app.use('/api/admin', adminRouter);

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await redisClient.ping();
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
      logger.error({ err }, 'Health check failed');
      res.status(503).json({ status: 'unhealthy', error: (err as Error).message });
    }
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err, correlationId: _req.correlationId }, err.message || 'Internal server error');
    res.status((err as any).status || 500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

export { createApp };
