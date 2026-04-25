const Redis = require('ioredis');
const { logger } = require('./logger');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const opts = {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 10) return null; // stop retrying
    return Math.min(times * 200, 5000);
  },
};

const redisClient = new Redis(REDIS_URL, opts);
const redisPub = new Redis(REDIS_URL, opts);
const redisSub = new Redis(REDIS_URL, opts);

redisClient.on('connect', () => logger.info('Redis connected'));
redisClient.on('error', (err) => logger.error({ err }, 'Redis client error'));
redisPub.on('error', (err) => logger.error({ err }, 'Redis pub error'));
redisSub.on('error', (err) => logger.error({ err }, 'Redis sub error'));

module.exports = { redisClient, redisPub, redisSub };
