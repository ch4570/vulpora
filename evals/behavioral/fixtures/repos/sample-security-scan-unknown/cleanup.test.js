import { database, redis } from '@fixture/connection-factory';

export async function resetFixture() {
  // The filename, localhost default, database 7 and key prefix do not prove ownership.
  const endpoint = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/7';
  const cache = redis(endpoint);
  await database().members.deleteAll();
  for await (const key of cache.scanIterator({ MATCH: 'test:*' })) {
    await cache.del(key);
  }
}
