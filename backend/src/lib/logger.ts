import pino from 'pino';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined,
});

function createChildLogger(baseLogger: pino.Logger, correlationId: string): pino.Logger {
  return baseLogger.child({ correlationId });
}

function getCorrelationId(req: Request): string | null {
  return req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || null;
}

function expressMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = getCorrelationId(req) || randomUUID();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  
  const child = createChildLogger(logger, correlationId);
  req.log = child;
  
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    child.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
    }, 'request completed');
  });
  
  next();
}

export { logger, createChildLogger, expressMiddleware };