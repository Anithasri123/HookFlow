const { RedisMemoryServer } = require('redis-memory-server');

/**
 * Local Redis Server Launcher Helper
 * Starts an in-memory Redis process listening on 127.0.0.1:6379 for local Windows development and testing.
 */
async function main() {
  console.log('Starting Local Redis Server Instance...');
  const redisServer = new RedisMemoryServer({
    instance: {
      port: 6379,
    },
  });

  const host = await redisServer.getHost();
  const port = await redisServer.getPort();

  console.log(`====================================================`);
  console.log(`   REDIS SERVER ACTIVE ON ${host}:${port}   `);
  console.log(`====================================================`);
  console.log('Press Ctrl+C to stop Redis server.\n');

  process.on('SIGINT', async () => {
    console.log('\nStopping Redis Server...');
    await redisServer.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start local Redis server:', err.message);
  process.exit(1);
});
