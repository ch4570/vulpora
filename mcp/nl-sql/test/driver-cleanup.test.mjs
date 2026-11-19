import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import net from 'node:net';
import { PassThrough } from 'node:stream';
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
const MysqlExecute = require(join(dirname(require.resolve('mysql2')), 'lib/commands/execute.js'));
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
  const streamedQueries = [];
  let produced = 0;
  let pool;

  function execute(connection, command) {
    commands.push(command);
    const phase = command === 'ROLLBACK' ? 'rollback'
      : /^(BEGIN|START) TRANSACTION/.test(command) ? 'begin'
      : command === statement ? 'query' : 'setup';
    if (phase === options.stallPhase) return false;
    if (phase === 'rollback' && options.rollbackFails) throw rollbackError;
    if (phase === options.failPhase && (!options.failCommand || command === options.failCommand)) throw primaryError;
    if (phase === 'begin') connection.transactionActive = true;
    if (phase === 'rollback') connection.transactionActive = false;
  }

  function connection() {
    const client = new EventEmitter();
    client.transactionActive = false;
    client.closed = false;
    const stream = new PassThrough();
    if (options.transportLocked) Object.defineProperty(stream, 'emit', { value: stream.emit, configurable: false });
    client.connection = { stream };
    const end = stream.end.bind(stream);
    stream.end = (...args) => { client.closed = true; return end(...args); };
    client.stream = stream;
    connections.push(client);
    return client;
  }

  function addMysqlConnection() {
    const client = connection();
    Object.setPrototypeOf(client, MysqlPoolConnection.prototype);
    client._pool = pool.pool;
    client._released = false;
    client.config = { trace: false, compress: options.compress ?? false };
    client.query = (command, callback) => {
      try {
        if (execute(client, command) === false) return;
        queueMicrotask(() => callback(null, [], []));
      }
      catch (error) { queueMicrotask(() => callback(error)); }
    };
    client.execute = command => {
      const query = new MysqlExecute(command);
      query._currentRows = [];
      streamedQueries.push(query);
      queueMicrotask(() => {
        try {
          assert.equal(command.sql, statement);
          assert.deepEqual(command.values, parameters);
          if (execute(client, command.sql) === false) return;
          for (const chunk of options.inboundChunks ?? []) client.stream.emit('data', chunk);
          if (client.closed) return;
          query.emit('fields', [{ name: 'value' }], 0);
          for (let i = 0; i < (options.rowTotal ?? 1) && !client.closed; i++) {
            query._rowParser = { next: () => ({ value: options.cell ?? 1 }) };
            query.row({ isEOF: () => false }, client);
            produced++;
          }
          query.emit('end');
        } catch (error) { query.emit('error', error); }
      });
      return query;
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
      if (options.synchronousCloseError) streamedQueries.at(-1)?.emit('error', new Error('synthetic close error'));
    };
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
        client.query = command => {
          if (typeof command === 'string') {
            try {
              if (execute(client, command) === false) return new Promise(() => {});
              return Promise.resolve({});
            }
            catch (error) { return Promise.reject(error); }
          }
          streamedQueries.push(command);
          queueMicrotask(() => {
            try {
              assert.equal(command.text, statement);
              assert.deepEqual(command.values, parameters);
              if (execute(client, command.text) === false) return;
              for (const chunk of options.inboundChunks ?? []) client.connection.stream.emit('data', chunk);
              if (client.closed) return;
              command.handleRowDescription({ fields: [{ name: 'value', dataTypeID: options.cell ? 25 : 23, format: 'text' }] });
              for (let i = 0; i < (options.rowTotal ?? 1) && !client.closed; i++) {
                command.handleDataRow({ fields: [String(options.cell ?? 1)] });
                produced++;
              }
              command.handleReadyForQuery({});
            } catch (error) { command.emit('error', error); }
          });
          return command;
        };
        client.end = callback => {
          client._ending = true;
          client.closed = true;
          client.connection.stream.destroy();
          if (options.synchronousCloseError) streamedQueries.at(-1)?.emit('error', new Error('synthetic close error'));
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

  const limits = { ...config, statementTimeoutMs: options.timeoutMs ?? config.statementTimeoutMs,
    maxRows: options.maxRows ?? 100, maxResultBytes: options.maxResultBytes ?? 1048576,
    maxInboundBytes: options.maxInboundBytes ?? 4194304 };
  const driver = dialect === 'postgres' ? new PostgresDriver(limits) : new MysqlDriver(limits);
  await driver.close(); // Both constructors create empty, lazy pools.
  driver.pool = pool;
  return {
    driver, commands, actions, connections, primaryError, cleanupError,
    streamedQueries, produced: () => produced,
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
    const query = f.streamedQueries[0];
    assert.equal(dialect === 'postgres' ? query._result.rows.length : query._currentRows.length, 0);
    assert.equal(Object.hasOwn(f.connections[0].stream, 'emit'), false, 'clean rollback restores inherited emit before pooling');
  });

  test(`${dialect}: inbound excess cancels before a row is decoded and never restores the interrupted stream`, async t => {
    const f = await fixture(t, dialect, { maxInboundBytes: 16, inboundChunks: [Buffer.alloc(8), Buffer.alloc(16)] });
    await assert.rejects(f.run(), error => error.code === 'NLSQL_RESULT_LIMIT_EXCEEDED');
    assert.deepEqual(f.actions, [discard]);
    assert.equal(f.produced(), 0);
    assert.equal(f.total(), 0);
    assert.equal(Object.hasOwn(f.connections[0].stream, 'emit'), true);
  });

  for (const limits of [
    { maxInboundBytes: 16, inboundChunks: [Buffer.alloc(8), Buffer.alloc(16)] },
    { maxRows: 1, rowTotal: 2 },
  ]) test(`${dialect}: budget error wins over synchronous connection termination errors (${limits.maxInboundBytes ? 'inbound' : 'decoded'})`, async t => {
    const f = await fixture(t, dialect, { ...limits, synchronousCloseError: true });
    await assert.rejects(f.run(), error => error.code === 'NLSQL_RESULT_LIMIT_EXCEEDED');
    assert.deepEqual(f.actions, [discard]);
  });

  test(`${dialect}: unsupported transport shape is rejected before any SQL`, async t => {
    const f = await fixture(t, dialect, { transportLocked: true });
    await assert.rejects(f.run(), error => error.code === 'NLSQL_DRIVER_UNSUPPORTED');
    assert.deepEqual(f.commands, []);
    assert.deepEqual(f.actions, [discard]);
  });

  for (const limits of [
    { rowTotal: 100000, maxRows: 2 },
    { rowTotal: 100000, cell: '界'.repeat(100), maxResultBytes: 128 },
  ]) test(`${dialect}: streaming collection overflow cancels and discards before accumulating results ${JSON.stringify(limits.maxRows ?? 'bytes')}`, async t => {
    const f = await fixture(t, dialect, limits);
    await assert.rejects(f.run(), error => error.code === 'NLSQL_RESULT_LIMIT_EXCEEDED');
    assert.deepEqual(f.actions, [discard]);
    assert.equal(f.commands.includes('ROLLBACK'), false);
    assert.ok(f.produced() <= 3);
    assert.equal(f.total(), 0);
    const query = f.streamedQueries[0];
    assert.equal(dialect === 'postgres' ? query._result.rows.length : query._currentRows.length, 0);
  });

  for (const stallPhase of ['begin', 'setup', 'query', 'rollback']) {
    test(`${dialect}: client deadline discards a silent ${stallPhase} transport`, async t => {
      const f = await fixture(t, dialect, { stallPhase, timeoutMs: 20 });
      if (stallPhase === 'rollback') assert.deepEqual((await f.run()).rows, [{ value: 1 }]);
      else await assert.rejects(f.run(), /client deadline/);
      assert.deepEqual(f.actions, [discard]);
      assert.equal(f.total(), 0);
      assert.equal(f.connections[0].closed, true);
      if (stallPhase !== 'rollback') assert.equal(f.commands.includes('ROLLBACK'), false);
    });
  }

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
        assert.deepEqual(f.actions, [discard]);
        assert.equal(f.commands.filter(command => command === 'ROLLBACK').length, 1);
        assert.equal(f.idle(), 0);
        assert.equal(f.total(), 0);
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
      test(`${dialect}: ${rollbackFails || failPhase ? 'discard' : 'release'} exception ${failPhase ? `preserves ${failPhase} error` : 'rejects otherwise successful query'}`, async t => {
        const f = await fixture(t, dialect, { failPhase, rollbackFails, cleanupFails: true });
        await assert.rejects(f.run(), error => error === (failPhase ? f.primaryError : f.cleanupError));
        assert.deepEqual(f.actions, [rollbackFails || failPhase ? discard : 'release']);
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

for (const rollbackFails of [false, true]) {
  test(`mysql: timeout setup failure prevents execution and discards after ${rollbackFails ? 'failed' : 'successful'} rollback`, async t => {
    const f = await fixture(t, 'mysql', {
      failPhase: 'setup', failCommand: 'SET SESSION MAX_EXECUTION_TIME = 1234', rollbackFails,
    });
    await assert.rejects(f.run(), error => error === f.primaryError);
    assert.deepEqual(f.commands, [
      'USE `public`', 'SET SESSION MAX_EXECUTION_TIME = 1234', 'ROLLBACK',
    ]);
    assert.deepEqual(f.actions, ['destroy']);
    assert.equal(f.total(), 0);
    assert.equal(f.idle(), 0);
  });
}

test('mysql: unexpected effective compression is rejected before any SQL', async t => {
  const f = await fixture(t, 'mysql', { compress: true });
  await assert.rejects(f.run(), error => error.code === 'NLSQL_DRIVER_UNSUPPORTED');
  assert.deepEqual(f.commands, []);
  assert.deepEqual(f.actions, ['destroy']);
});
