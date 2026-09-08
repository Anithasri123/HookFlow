const Redis = require('ioredis');

/**
 * Redis Connection Configuration
 * Reads REDIS_URL from environment variables and parses connection options
 * suitable for BullMQ Queue and Worker instances.
 */
const getRedisOptions = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

  try {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname || '127.0.0.1',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
    };
  } catch (error) {
    console.error('Failed to parse REDIS_URL, falling back to 127.0.0.1:6379');
    return {
      host: '127.0.0.1',
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
};

const redisOptions = getRedisOptions();

/**
 * Create a standalone ioredis client instance with logging
 */
const createRedisClient = () => {
  const client = new Redis(redisOptions);

  client.on('connect', () => {
    console.log(`Redis Connected: ${redisOptions.host}:${redisOptions.port}`);
  });

  client.on('error', (err) => {
    console.error(`Redis Error: ${err.message}`);
  });

  return client;
};

module.exports = {
  redisOptions,
  createRedisClient,
};
