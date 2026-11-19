import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import sql from 'mssql';
import mysql from 'mysql2/promise';

import { MssqlDriver } from '../dist/drivers/mssql.js';
import { MysqlDriver } from '../dist/drivers/mysql.js';

const config = {
  dialect: 'mysql',
  host: 'localhost',
  database: 'app',
  user: 'readonly_user',
  ssl: true,
  sslMode: 'verify-full',
  allowedSchemas: ['app'],
  maxRows: 100,
  statementTimeoutMs: 1234,
  maxCellChars: 2000,
};

test('mysql keeps parameter values separate from SQL text and rolls back', async (t) => {
  const commands = [];
  let released = false;
  const statement = 'SELECT ? AS value';
  const params = ["' UNION SELECT secret FROM private.users -- "];
  const connection = {
    async query(command) {
      assert.equal(typeof command, 'string', 'text queries are only for fixed transaction setup');
      assert.ok(!command.includes(params[0]));
      commands.push(command);
      return [[], []];
    },
    connection: { config: { compress: false }, stream: new PassThrough(), execute(command) {
      const query = new EventEmitter();
      queueMicrotask(() => {
        assert.equal(command.sql, statement);
        assert.deepEqual(command.values, params);
        commands.push('bound SELECT');
        query.emit('fields', [{ name: 'value' }]);
        query.emit('result', { value: params[0] });
        query.emit('end');
      });
      return query;
    },
    },
    release() { released = true; },
  };
  const pool = Object.assign(new EventEmitter(), {
    pool: new EventEmitter(),
    async getConnection() { return connection; },
    async end() {},
  });
  t.mock.method(mysql, 'createPool', () => pool);

  const driver = new MysqlDriver(config);
  const result = await driver.runReadOnly(statement, params);
  assert.deepEqual(result.rows, [{ value: params[0] }]);
  assert.deepEqual(commands, [
    'USE `app`',
    'SET SESSION MAX_EXECUTION_TIME = 1234',
    'START TRANSACTION READ ONLY',
    'bound SELECT',
    'ROLLBACK',
  ]);
  assert.equal(released, true);
  await driver.close();
});

test('mysql connection strings retain configured TLS verification and pool limits', async (t) => {
  const createPool = mysql.createPool;
  let pool;
  t.mock.method(mysql, 'createPool', (...args) => {
    pool = createPool(...args);
    return pool;
  });
  const driver = new MysqlDriver({
    ...config,
    connectionString: 'mysql://readonly_user:example@localhost:3307/app?compress=true',
  });
  t.after(() => driver.close());

  assert.equal(pool.pool.config.connectionConfig.port, 3307);
  assert.equal(pool.pool.config.connectionConfig.ssl.rejectUnauthorized, true);
  assert.equal(pool.pool.config.connectionLimit, 4);
  assert.equal(pool.pool.config.connectionConfig.compress, false);
});

test('mysql preserves URI certificate options while enforcing configured verification', async (t) => {
  const createPool = mysql.createPool;
  let pool;
  t.mock.method(mysql, 'createPool', (...args) => {
    pool = createPool(...args);
    return pool;
  });
  const uri = new URL('mysql://readonly_user:example@localhost/app');
  const certificates = { ca: 'example CA', cert: 'example certificate', key: 'example key' };
  uri.searchParams.set('ssl', JSON.stringify({ ...certificates, rejectUnauthorized: false }));
  const driver = new MysqlDriver({ ...config, connectionString: uri.href });
  t.after(() => driver.close());

  assert.deepEqual(pool.pool.config.connectionConfig.ssl, {
    ...certificates,
    rejectUnauthorized: true,
  });
});

test('mysql preserves a URI SSL profile and its certificate verification', async (t) => {
  const createPool = mysql.createPool;
  let pool;
  t.mock.method(mysql, 'createPool', (...args) => {
    pool = createPool(...args);
    return pool;
  });
  const uri = new URL('mysql://readonly_user:example@localhost/app');
  uri.searchParams.set('ssl', 'Amazon RDS');
  const driver = new MysqlDriver({ ...config, connectionString: uri.href });
  t.after(() => driver.close());

  assert.ok(pool.pool.config.connectionConfig.ssl.ca.length > 0);
  assert.equal(pool.pool.config.connectionConfig.ssl.rejectUnauthorized, true);
});

test('mysql require mode preserves verification enabled by URI TLS options', async (t) => {
  const createPool = mysql.createPool;
  let pool;
  t.mock.method(mysql, 'createPool', (...args) => {
    pool = createPool(...args);
    return pool;
  });
  const uri = new URL('mysql://readonly_user:example@localhost/app');
  uri.searchParams.set('ssl', JSON.stringify({ ca: 'example CA', rejectUnauthorized: true }));
  const driver = new MysqlDriver({ ...config, sslMode: 'require', connectionString: uri.href });
  t.after(() => driver.close());

  assert.equal(pool.pool.config.connectionConfig.ssl.ca, 'example CA');
  assert.equal(pool.pool.config.connectionConfig.ssl.rejectUnauthorized, true);
});

test('mssql parses connection strings and applies the configured statement timeout', async (t) => {
  const driver = new MssqlDriver({
    ...config,
    dialect: 'mssql',
    allowedSchemas: ['dbo'],
    connectionString: 'Server=localhost,1434;Database=app;User Id=readonly_user;Password=example;Encrypt=true;TrustServerCertificate=false',
  });
  t.after(() => driver.close());
  const poolConfig = driver.poolConfig;

  assert.equal(poolConfig.server, 'localhost');
  assert.equal(poolConfig.port, 1434);
  assert.equal(poolConfig.database, 'app');
  assert.equal(poolConfig.user, 'readonly_user');
  assert.equal(poolConfig.options.encrypt, true);
  assert.equal(poolConfig.options.trustServerCertificate, false);
  assert.equal(poolConfig.requestTimeout, 1234);
  assert.equal(poolConfig.pool.max, 1);
});
