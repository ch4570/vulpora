import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import net from 'node:net';
import { dirname, join } from 'node:path';
import test from 'node:test';

import pg from 'pg';
import mysql from 'mysql2/promise';

import { PostgresDriver } from '../dist/drivers/postgres.js';
import { MysqlDriver } from '../dist/drivers/mysql.js';

const require = createRequire(import.meta.url);
// Use the installed pool's real release/destroy implementation without invoking
// the PoolConnection constructor, which would open a network transport.
const MysqlPoolConnection = require(join(dirname(require.resolve('mysql2')), 'lib/pool_connection.js'));
const config = {
  host: 'synthetic.invalid', port: 1, database: 'synthetic',
  user: 'synthetic', password: 'synthetic', allowedSchemas: ['public'],
  statementTimeoutMs: 1234, ssl: false, sslMode: 'disable',
};
const statement = 'SELECT value FROM public.synthetic WHERE value = $1';
const parameters = ['synthetic value'];

async function fixture(t, dialect, options = {}) {
  const statement = `SELECT value FROM public.synthetic WHERE value = ${dialect === 'postgres' ? '$1' : '?'}`;
  const socketConnect = t.mock.method(net.Socket.prototype, 'connect', () => {
    throw new Error('Real network transports are prohibited in this fixture');
  });
  t.after(() => assert.equal(socketConnect.mock.callCount(), 0));
  const primaryError = new Error('synthetic primary failure');
  const rollbackError = new Error('synthetic rollback failure');
  const cleanupError = new Error('synthetic release/discard failure');
  const commands = [];
  const actions = [];
  const connections = [];
  const ownedReleases = new Set();
  let pool;

  function execute(connection, command) {
    commands.push(command);
    const phase = command === 'ROLLBACK' ? 'rollback'
      : /^(BEGIN|START) TRANSACTION/.test(command) ? 'begin'
      : command === statement ? 'query' : 'setup';
    if (phase === 'rollback' && options.rollbackFails) throw rollbackError;
    if (phase === options.failPhase && (!options.failCommand || command === options.failCommand)) throw primaryError;
    if (phase === 'begin') connection.transactionActive = true;
    if (phase === 'rollback') connection.transactionActive = false;
  }

  function connection() {
    const client = new EventEmitter();
    client.transactionActive = false;
    client.closed = false;
    connections.push(client);
    return client;
  }

  function addMysqlConnection() {
    const client = connection();
    Object.setPrototypeOf(client, MysqlPoolConnection.prototype);
    client._pool = pool.pool;
    client._released = false;
    client.config = { trace: false };
    client.query = (command, callback) => {
      try { execute(client, command); queueMicrotask(() => callback(null, [], [])); }
      catch (error) { queueMicrotask(() => callback(error)); }
    };
    client.execute = (command, callback) => {
      try {
        assert.equal(command.sql, statement);
        assert.deepEqual(command.values, parameters);
        execute(client, command.sql);
        queueMicrotask(() => callback(null, [{ value: 1 }], [{ name: 'value' }]));
      } catch (error) { queueMicrotask(() => callback(error)); }
    };
    client.release = () => {
      actions.push('release');
      if (options.cleanupFails) throw cleanupError;
      MysqlPoolConnection.prototype.release.call(client);
    };
    client.destroy = () => {
      actions.push('destroy');
      if (options.cleanupFails) throw cleanupError;
      MysqlPoolConnection.prototype.destroy.call(client);
    };
    client.stream = { end() { client.closed = true; } };
    client._realEnd = callback => { client.closed = true; callback(null); };
    client.once('end', () => client._removeFromPool());
    client.once('error', () => client._removeFromPool());
    pool.pool._allConnections.push(client);
    pool.pool._freeConnections.push(client);
    return client;
  }

  if (dialect === 'postgres') {
    pool = new pg.Pool({
      max: 1, idleTimeoutMillis: 0,
      Client: function () {
        const client = connection();
        client._queryable = true;
        client._ending = false;
        client.connect = callback => queueMicrotask(() => callback(null));
        client.query = async command => {
          if (typeof command === 'string') { execute(client, command); return {}; }
          assert.equal(command.text, statement);
          assert.deepEqual(command.values, parameters);
          execute(client, command.text);
          return { fields: [{ name: 'value' }], rows: [{ value: 1 }], rowCount: 1 };
        };
        client.end = callback => {
          client._ending = true;
          client.closed = true;
          client.emit('end');
          callback?.();
        };
        return client;
      },
    });
    const connect = pool.connect.bind(pool);
    pool.connect = async () => {
      if (options.acquireFails) throw primaryError;
      const client = await connect();
      const release = client.release;
      ownedReleases.add(release);
      client.release = destroy => {
        actions.push(destroy === true ? 'discard' : 'release');
        if (options.cleanupFails) throw cleanupError;
        ownedReleases.delete(release);
        release(destroy);
      };
      return client;
    };
    t.after(async () => {
      // A synthetic cleanup exception intentionally leaves an owned client.
      // Use the saved real callback to clean up the fixture, without retrying
      // cleanup in the production code under test.
      for (const release of ownedReleases) release(true);
      await pool.end();
    });
  } else {
    pool = mysql.createPool({ host: 'synthetic.invalid', connectionLimit: 1, maxIdle: 1 });
    assert.equal(pool.pool.config.resetOnRelease, false);
    addMysqlConnection();
    if (options.acquireFails) t.mock.method(pool, 'getConnection', async () => { throw primaryError; });
    t.after(() => pool.end());
  }

  const driver = dialect === 'postgres' ? new PostgresDriver(config) : new MysqlDriver(config);
  await driver.close(); // Both constructors create empty, lazy pools.
  driver.pool = pool;
  return {
    driver, commands, actions, connections, primaryError, cleanupError,
    run: () => driver.runReadOnly(statement, parameters),
    total: () => dialect === 'postgres' ? pool.totalCount : pool.pool._allConnections.length,
    idle: () => dialect === 'postgres' ? pool.idleCount : pool.pool._freeConnections.length,
    async checkout() {
      // MySQL's transport constructor is deliberately never used. After
      // discard, seed a fresh fake transport into the actual empty pool.
      if (dialect === 'mysql' && pool.pool._allConnections.length === 0) addMysqlConnection();
      const client = dialect === 'postgres' ? await pool.connect() : await pool.getConnection();
      const underlying = dialect === 'postgres' ? client : client.connection;
      client.release();
      return underlying;
    },
  };
}

for (const dialect of ['postgres', 'mysql']) {
  const discard = dialect === 'postgres' ? 'discard' : 'destroy';

  test(`${dialect}: successful rollback returns a clean connection to the real pool`, async t => {
    const f = await fixture(t, dialect);
    assert.deepEqual((await f.run()).rows, [{ value: 1 }]);
    assert.deepEqual(f.actions, ['release']);
    assert.equal(f.commands.at(-1), 'ROLLBACK');
    assert.equal(f.connections[0].transactionActive, false);
    assert.equal(f.total(), 1);
    assert.equal(f.idle(), 1);
    assert.equal(await f.checkout(), f.connections[0]);
  });

  test(`${dialect}: failed rollback preserves successful rows but prevents connection reuse`, async t => {
    const f = await fixture(t, dialect, { rollbackFails: true });
    assert.deepEqual((await f.run()).rows, [{ value: 1 }]);
    assert.deepEqual(f.actions, [discard]);
    assert.equal(f.total(), 0);
    assert.equal(f.idle(), 0);
    assert.equal(f.connections[0].closed, true);
    assert.notEqual(await f.checkout(), f.connections[0]);
  });

  for (const failPhase of ['begin', 'setup', 'query']) {
    for (const rollbackFails of [false, true]) {
      test(`${dialect}: ${failPhase} error survives ${rollbackFails ? 'failed' : 'successful'} rollback`, async t => {
        const f = await fixture(t, dialect, { failPhase, rollbackFails });
        await assert.rejects(f.run(), error => error === f.primaryError);
        assert.deepEqual(f.actions, [rollbackFails ? discard : 'release']);
        assert.equal(f.commands.filter(command => command === 'ROLLBACK').length, 1);
        assert.equal(f.idle(), rollbackFails ? 0 : 1);
        assert.equal(f.total(), rollbackFails ? 0 : 1);
      });
    }
  }

  test(`${dialect}: acquire failure never rolls back or releases an unowned connection`, async t => {
    const f = await fixture(t, dialect, { acquireFails: true });
    await assert.rejects(f.run(), error => error === f.primaryError);
    assert.deepEqual(f.commands, []);
    assert.deepEqual(f.actions, []);
    assert.equal(f.total(), dialect === 'postgres' ? 0 : 1);
    assert.equal(f.idle(), dialect === 'postgres' ? 0 : 1);
  });

  for (const rollbackFails of [false, true]) {
    for (const failPhase of [undefined, 'begin', 'setup', 'query']) {
      test(`${dialect}: ${rollbackFails ? 'discard' : 'release'} exception ${failPhase ? `preserves ${failPhase} error` : 'rejects otherwise successful query'}`, async t => {
        const f = await fixture(t, dialect, { failPhase, rollbackFails, cleanupFails: true });
        await assert.rejects(f.run(), error => error === (failPhase ? f.primaryError : f.cleanupError));
        assert.deepEqual(f.actions, [rollbackFails ? discard : 'release']);
      });
    }
  }
}

for (const command of [
  'SET LOCAL standard_conforming_strings = on',
  'SET LOCAL search_path = pg_catalog, "public"',
  'SET LOCAL statement_timeout = 1234',
  'SET LOCAL idle_in_transaction_session_timeout = 15000',
]) {
  test(`postgres: setup failure at ${command} still discards after failed rollback`, async t => {
    const f = await fixture(t, 'postgres', { failPhase: 'setup', failCommand: command, rollbackFails: true });
    await assert.rejects(f.run(), error => error === f.primaryError);
    assert.deepEqual(f.actions, ['discard']);
    assert.ok(!f.commands.includes(statement));
  });
}

test('mysql: unsupported optional timeout setup still runs and cleans up the query', async t => {
  const f = await fixture(t, 'mysql', {
    failPhase: 'setup', failCommand: 'SET SESSION MAX_EXECUTION_TIME = 1234',
  });
  assert.deepEqual((await f.run()).rows, [{ value: 1 }]);
  assert.deepEqual(f.actions, ['release']);
  assert.ok(f.commands.includes('START TRANSACTION READ ONLY'));
});
