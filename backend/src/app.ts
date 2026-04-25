/**
 * backend/src/app.js
 * Express app factory — separated from server.listen for testing.
 */
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is required. Set it in .env');
  process.exit(1);
}

const { logger, expressMiddleware } = require('./lib/logger');
const { prisma } = require('./lib/prisma');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const { optionalAuth } = require('./middleware/auth');
const { enforceExportFormat } = require('./middleware/subscription');
const tripsRouter = require('./routes/trips');
const entriesRouter = require('./routes/entries');
const usersRouter = require('./routes/users');
const exportRouter = require('./routes/export');
const authRouter = require('./routes/auth');

function createApp(allowedOrigins) {
  const app = express();
  
  const origins = allowedOrigins || [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  // In development, allow any origin for easier mobile testing
  // In production, use strict origin allowlist
  const corsOrigin = process.env.NODE_ENV === 'production'
    ? (origin, callback) => {
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
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise fall back to IP
      return req.user?.id || req.ip;
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

  const apikeysRouter = require('./routes/apikeys');
  const adminRouter = require('./routes/admin');

  app.use('/api/apikeys', apikeysRouter.router);
  app.use('/api/admin', adminRouter);

  app.get('/api/health', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const { redisClient } = require('./lib/redis');
      await redisClient.ping();
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
      logger.error({ err }, 'Health check failed');
      res.status(503).json({ status: 'unhealthy', error: err.message });
    }
  });

  app.use((err, req, res, next) => {
    logger.error({ err, correlationId: req.correlationId }, err.message || 'Internal server error');
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
