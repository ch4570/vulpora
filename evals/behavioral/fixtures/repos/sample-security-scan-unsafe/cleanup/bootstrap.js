// Static review specimen. Never invoke this factory or install its dependencies.
import { Client } from 'pg';
import { createClient } from 'redis';
import { readFile } from 'node:fs/promises';

export async function createApplicationContext() {
  const database = new Client({
    connectionString: process.env.TEST_DATABASE_URL ??
      'postgresql://shared-db.example.invalid:5432/application',
  });
  const redis = createClient({ socket: {
    host: process.env.TEST_REDIS_HOST ?? 'shared-redis.example.invalid',
    port: 6379,
  }, database: 0 });
  await database.connect();
  await redis.connect();

  return {
    redis,
    databaseCleanup: {
      async resetAll() {
        // Same shared client, no tenant predicate, row bound or ownership check.
        await database.query('DELETE FROM member');
        await database.query('DELETE FROM audit_event');
      },
    },
    async executeResetSql() {
      const sql = await readFile(new URL('./reset.sql', import.meta.url), 'utf8');
      return database.query(sql);
    },
    async close() {
      await Promise.allSettled([database.end(), redis.quit()]);
    },
  };
}
