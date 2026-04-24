const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined,
});

function createChildLogger(baseLogger, correlationId) {
  return baseLogger.child({ correlationId });
}

function getCorrelationId(req) {
  return req.headers['x-correlation-id'] || req.headers['x-request-id'] || null;
}

function expressMiddleware(req, res, next) {
  const correlationId = getCorrelationId(req) || require('crypto').randomUUID();
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

module.exports = { logger, createChildLogger, expressMiddleware };