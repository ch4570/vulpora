import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import sql from 'mssql';
import tds from 'tedious';
import { MssqlDriver } from '../dist/drivers/mssql.js';
const require = createRequire(import.meta.url);
const IncomingMessageStream = require(join(dirname(require.resolve('tedious')), 'incoming-message-stream.js'));

const config = {
  dialect: 'mssql', host: 'synthetic.invalid', database: 'synthetic', user: 'synthetic',
  ssl: false, sslMode: 'disable', allowedSchemas: ['dbo'], maxRows: 2,
  maxResultBytes: 1024, statementTimeoutMs: 100, maxCellChars: 2000,
};

function fixture(t, options = {}) {
  const network = t.mock.method(net.Socket.prototype, 'connect', () => { throw new Error('Network prohibited'); });
  t.after(() => assert.equal(network.mock.callCount(), 0));
  const events = [], connections = [], results = [];
  let produced = 0;
  t.mock.method(sql.ConnectionPool.prototype, '_poolCreate', async function () {
    let pending;
    const connection = new EventEmitter();
    connection.messageIo = { incomingMessageStream: new IncomingMessageStream({ packet() {}, data() {} }) };
    if (options.unsupportedTransport) connection.messageIo.incomingMessageStream = new PassThrough();
    connection.messageIo.incomingMessageStream.on('error', () => {});
    connections.push(connection);
    connection.closed = false;
    connection.beginTransaction = callback => {
      connection.used = true;
      events.push('begin'); callback(options.beginFails ? new Error('synthetic begin') : null);
    };
    connection.rollbackTransaction = callback => {
      events.push('rollback');
      assert.ok(!pending, 'rollback starts only after request terminal');
      if (options.rollbackStalls) return;
      callback(options.rollbackFails ? new Error('synthetic rollback') : null);
    };
    connection.close = () => {
      if (connection.closed) return;
      if (options.closeFails && connection.used) throw new Error('synthetic close');
      connection.closed = true;
      connection.messageIo.incomingMessageStream.destroy();
      events.push('close');
      if (pending && !options.neverTerminates) {
        const request = pending;
        pending = undefined;
        const terminal = () => { events.push('terminal'); request.callback(new Error('synthetic cancelled')); };
        if (options.synchronousCloseError) terminal();
        else queueMicrotask(terminal);
      }
    };
    connection.cancel = () => {
      events.push('cancel');
      if (options.cancelThrows) throw new Error('synthetic cancel');
    };
    connection.execSql = request => {
      pending = request;
      assert.equal(request.sqlTextOrProcedure, 'SELECT @p1 AS value');
      assert.equal(request.parameters[0].value, 7);
      const metadata = { colName: options.column ?? 'value', type: tds.TYPES.NVarChar, dataLength: 100, flags: 1 };
      queueMicrotask(() => {
        for (const chunk of options.inboundChunks ?? []) connection.messageIo.incomingMessageStream.write(chunk);
        if (connection.closed) return;
        request.emit('columnMetadata', [metadata]);
        if (options.hold) return;
        for (let i = 0; i < (options.rowTotal ?? 1) && !connection.closed; i++) {
          request.emit('row', [{ metadata, value: options.cell ?? 'ok' }]);
          produced++;
        }
        if (!pending) return;
        if (options.neverTerminates) return;
        pending = undefined;
        request.emit('doneInProc', produced, false);
        if (options.queryFails) connection.emit('errorMessage', { message: 'synthetic query error' });
        events.push('terminal');
        request.callback(null, produced);
      });
    };
    this.config.beforeConnect?.(connection);
    return connection;
  });
  t.mock.method(sql.ConnectionPool.prototype, '_poolValidate', () => true);
  t.mock.method(sql.ConnectionPool.prototype, '_poolDestroy', async connection => { connection.close(); });
  const query = sql.Request.prototype.query;
  t.mock.method(sql.Request.prototype, 'query', async function (...args) {
    assert.equal(this.stream, true);
    const result = await query.apply(this, args);
    results.push(result);
    return result;
  });
  const driver = new MssqlDriver({ ...config, ...options.config });
  t.after(() => driver.close());
  return { driver, events, connections, results, produced: () => produced, run: () => driver.runReadOnly('SELECT @p1 AS value', [7]) };
}

test('mssql real Request streams rows without recordset accumulation and closes its owned pool', async t => {
  const f = fixture(t);
  assert.deepEqual((await f.run()).rows, [{ value: 'ok' }]);
  assert.equal(f.results[0].recordset, null);
  assert.equal(f.results[0].recordsets, null);
  assert.ok(f.events.indexOf('terminal') < f.events.indexOf('rollback'));
  assert.ok(f.connections.every(connection => connection.closed));
});

for (const options of [
  { rowTotal: 100000 }, { cell: '界'.repeat(1000) },
  { column: 'JSON_F52E2B61-18A1-11d1-B105-00805F49916B' },
  { column: 'XML_F52E2B61-18A1-11d1-B105-00805F49916B' },
]) test(`mssql cancels oversized/chunked results before accumulation ${JSON.stringify(options).slice(0, 90)}`, async t => {
  const f = fixture(t, options);
  await assert.rejects(f.run(), error => error.code === 'NLSQL_RESULT_LIMIT_EXCEEDED');
  assert.ok(f.events.includes('cancel'));
  assert.ok(f.produced() <= 3);
  assert.ok(f.connections.every(connection => connection.closed));
  assert.equal(f.driver.activePools.size, 0);
});

for (const option of ['queryFails', 'rollbackFails', 'beginFails']) {
  test(`mssql ${option} rejects and closes the query-owned pool`, async t => {
    const f = fixture(t, { [option]: true });
    await assert.rejects(f.run());
    assert.ok(f.connections.every(connection => connection.closed));
    assert.equal(f.driver.activePools.size, 0);
  });
}

test('mssql aggregate capacity is four and overflow never creates another pool', async t => {
  const f = fixture(t, { hold: true });
  const running = Array.from({ length: 4 }, () => f.run().catch(error => error));
  await assert.rejects(f.run(), /capacity/);
  assert.equal(f.driver.activePools.size, 4);
  await Promise.all(running);
  assert.equal(f.driver.activePools.size, 0);
});

test('mssql missing terminal callback is bounded and frees its capacity', async t => {
  const f = fixture(t, { rowTotal: 100000, neverTerminates: true, config: { statementTimeoutMs: 20 } });
  await assert.rejects(f.run(), error => error.code === 'NLSQL_RESULT_LIMIT_EXCEEDED');
  assert.equal(f.driver.activePools.size, 0);
  assert.ok(f.connections.every(connection => connection.closed));
});

test('mssql stalled rollback is bounded and destroys owned transports', async t => {
  const f = fixture(t, { rollbackStalls: true, config: { statementTimeoutMs: 20 } });
  await assert.rejects(f.run(), /cleanup/);
  assert.equal(f.driver.activePools.size, 0);
  assert.ok(f.connections.every(connection => connection.closed));
});

test('mssql unknown transport closure disables future work instead of reusing capacity', async t => {
  const f = fixture(t, { closeFails: true, config: { statementTimeoutMs: 20 } });
  await assert.rejects(f.run());
  const count = f.connections.length;
  await assert.rejects(f.run(), /closed/);
  assert.equal(f.connections.length, count);
});

test('mssql throwing cancellation preserves the overflow error and closes transport', async t => {
  const f = fixture(t, { rowTotal: 100000, cancelThrows: true });
  await assert.rejects(f.run(), error => error.code === 'NLSQL_RESULT_LIMIT_EXCEEDED');
  assert.ok(f.connections.every(connection => connection.closed));
  assert.equal(f.driver.activePools.size, 0);
});

test('mssql __proto__ column cannot retain a large inherited value outside the byte budget', async t => {
  const f = fixture(t, { column: '__proto__', cell: 'x'.repeat(10000) });
  await assert.rejects(f.run(), error => error.code === 'NLSQL_RESULT_LIMIT_EXCEEDED');
  assert.ok(f.connections.every(connection => connection.closed));
  assert.equal(f.driver.activePools.size, 0);
});

test('mssql inbound excess closes transport before TDS row delivery', async t => {
  const f = fixture(t, { config: { maxInboundBytes: 16 }, inboundChunks: [
    Buffer.from([4, 1, 16, 0, 0, 0, 1, 0]), Buffer.alloc(32),
  ] });
  await assert.rejects(f.run(), error => error.code === 'NLSQL_RESULT_LIMIT_EXCEEDED');
  assert.equal(f.produced(), 0);
  assert.ok(f.connections.every(connection => connection.closed));
});

test('mssql inbound error wins over synchronous terminal cancellation errors', async t => {
  const f = fixture(t, { synchronousCloseError: true, config: { maxInboundBytes: 16 }, inboundChunks: [
    Buffer.from([4, 1, 16, 0, 0, 0, 1, 0]), Buffer.alloc(32),
  ] });
  await assert.rejects(f.run(), error => error.code === 'NLSQL_RESULT_LIMIT_EXCEEDED');
  assert.equal(f.produced(), 0);
  assert.equal(f.events.filter(event => event === 'cancel').length, 1);
});

test('mssql unsupported inbound transport fails before executing user SQL', async t => {
  const f = fixture(t, { unsupportedTransport: true });
  await assert.rejects(f.run(), error => error.code === 'NLSQL_DRIVER_UNSUPPORTED');
  assert.equal(f.results.length, 0);
  assert.equal(f.produced(), 0);
  assert.ok(f.connections.every(connection => connection.closed));
});
