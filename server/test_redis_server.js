const { RedisMemoryServer } = require('redis-memory-server');

async function testRedisServer() {
  try {
    console.log('Initializing Redis Memory Server...');
    const redisServer = new RedisMemoryServer();

    const host = await redisServer.getHost();
    const port = await redisServer.getPort();
    console.log(`Redis Memory Server running at ${host}:${port}`);
    await redisServer.stop();
    console.log('Redis Memory Server stopped cleanly.');
  } catch (err) {
    console.error('Redis Memory Server Error:', err);
  }
}

testRedisServer();
