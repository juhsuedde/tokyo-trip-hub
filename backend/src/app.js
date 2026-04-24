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
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://192.168.0.245:5173')
  .split(',').map(s => s.trim());

const { optionalAuth } = require('./middleware/session');
const { enforceExportFormat } = require('./middleware/subscription');
const tripsRouter = require('./routes/trips');
const entriesRouter = require('./routes/entries');
const usersRouter = require('./routes/users');
const exportRouter = require('./routes/export');
const authRouter = require('./routes/auth');

function createApp(io) {
  const app = express();

  if (io) app.set('io', io);

  app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
      ? (origin, callback) => {
          if (!origin) return callback(new Error('Origin required'));
          if (ALLOWED_ORIGINS.includes(origin)) return callback(null, origin);
          return callback(new Error('Not allowed by CORS'));
        }
      : true,
    credentials: true,
  }));

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(expressMiddleware);

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? Infinity : 200,
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
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use((err, req, res, next) => {
    logger.error({ err, correlationId: req.correlationId }, err.message || 'Internal server error');
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
