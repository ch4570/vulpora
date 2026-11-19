// Static lifecycle specimen; do not run or install these illustrative dependencies.
import { GenericContainer, Wait } from 'testcontainers';
import { createClient } from 'redis';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';

export async function isolatedCleanupExample() {
  const ownedRedis = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379).withWaitStrategy(Wait.forLogMessage('Ready to accept connections')).start();
  let ownedPostgres;
  let redis;
  let db;
  try {
    const databasePassword = randomBytes(32).toString('hex');
    ownedPostgres = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({ POSTGRES_PASSWORD: databasePassword, POSTGRES_DB: 'fixture' })
      .withExposedPorts(5432).withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
      .start();
    redis = createClient({ socket: { host: ownedRedis.getHost(), port: ownedRedis.getMappedPort(6379) } });
    db = new Client({ host: ownedPostgres.getHost(), port: ownedPostgres.getMappedPort(5432),
      user: 'postgres', database: 'fixture', password: databasePassword });
    await redis.connect();
    await db.connect();
    await db.query('CREATE TABLE member (id integer PRIMARY KEY)');
    await db.query('INSERT INTO member (id) VALUES ($1)', [1]);
    await redis.set('fixture:member:1', 'synthetic');
    // These clients have no caller/env endpoint override and refer only to this run's containers.
    await db.query('DELETE FROM member');
    await redis.sendCommand(['FLUSHDB']);
  } finally {
    // Promise.allSettled prevents one teardown failure from skipping the others.
    await Promise.allSettled([redis?.isOpen ? redis.quit() : Promise.resolve(), db?.end()]);
    await Promise.allSettled([ownedRedis.stop(), ownedPostgres?.stop()]);
  }
}
