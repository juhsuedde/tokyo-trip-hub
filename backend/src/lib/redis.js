const Redis = require('ioredis');

const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redisClient.on('connect', () => console.log('[redis] connected'));
redisClient.on('error', (err) => console.error('[redis] error:', err.message));

module.exports = { redisClient };
