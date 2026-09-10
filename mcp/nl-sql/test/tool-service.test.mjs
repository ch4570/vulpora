import assert from 'node:assert/strict';
import test from 'node:test';

import { getDialect } from '../dist/dialect.js';
import { SchemaPolicyError } from '../dist/schema-policy.js';
import { ResultLimitError } from '../dist/drivers/result-budget.js';
import { sanitizeToolCall, ToolService } from '../dist/tool-service.js';

const SECRET = 'postgresql://admin:super-secret@internal-db:5432/private';

function config() {
  return {
    dialect: 'postgres', ssl: false, sslMode: 'disable', maxRows: 2,
    statementTimeoutMs: 5_000, allowedSchemas: ['public'], maxCellChars: 2_000,
  };
}

function throwingIntrospector(error) {
  return {
    async listSchemas() { throw error; },
    async listTables() { throw error; },
    async describeTable() { throw error; },
    async search() { throw error; },
  };
}

class FakeDriver {
  calls = [];
  error = null;

  async ping() { return 'fake'; }
  async close() {}
  async runReadOnly(sql, params) {
    this.calls.push({ sql, params });
    if (this.error) throw this.error;
    return { fields: ['id'], rows: [{ id: 1 }], rowCount: 1, elapsedMs: 2 };
  }
}

function body(result) {
  return result.content[0].text;
}

test('collection overflow fails query, EXPLAIN and introspection with one stable code', async () => {
  const db = new FakeDriver();
  db.error = new ResultLimitError();
  const codes = [];
  const service = new ToolService(db, throwingIntrospector(db.error), config(), getDialect('postgres'), code => codes.push(code));
  for (const result of [
    await service.runSelect('SELECT id FROM public.users'),
    await service.explainSelect('SELECT id FROM public.users'),
    await service.listSchemas(),
    await service.listTables('public'),
    await service.describeTable('public', 'users'),
    await service.searchObjects('users'),
  ]) {
    assert.equal(result.isError, true);
    assert.match(body(result), /\[NLSQL_RESULT_LIMIT_EXCEEDED\]/);
    assert.doesNotMatch(body(result), /Database result|SELECT|super-secret/);
  }
  assert.deepEqual(codes, Array(6).fill('NLSQL_RESULT_LIMIT_EXCEEDED'));
});

test('raw introspection errors and connection details are never returned or logged', async () => {
  const codes = [];
  const db = new FakeDriver();
  const service = new ToolService(
    db,
    throwingIntrospector(new Error(`connection refused: ${SECRET}`)),
    config(),
    getDialect('postgres'),
    (value) => codes.push(value),
  );

  const result = await service.listSchemas();
  assert.equal(result.isError, true);
  assert.match(body(result), /\[NLSQL_DB_INTROSPECTION_FAILED\]/);
  assert.doesNotMatch(body(result), /super-secret|internal-db|connection refused/);
  assert.deepEqual(codes, ['NLSQL_DB_INTROSPECTION_FAILED']);
  assert.doesNotMatch(codes.join(' '), /super-secret|internal-db/);
});

test('raw run_select and explain errors are mapped to stable error codes', async () => {
  const codes = [];
  const db = new FakeDriver();
  db.error = new Error(`password authentication failed for ${SECRET}`);
  const service = new ToolService(db, throwingIntrospector(new Error('unused')), config(), getDialect('postgres'), (c) => codes.push(c));

  const query = await service.runSelect('SELECT * FROM public.users');
  const explain = await service.explainSelect('SELECT * FROM public.users');

  assert.match(body(query), /\[NLSQL_DB_QUERY_FAILED\]/);
  assert.match(body(explain), /\[NLSQL_DB_EXPLAIN_FAILED\]/);
  assert.doesNotMatch(body(query) + body(explain), /super-secret|internal-db|password authentication/);
  assert.deepEqual(codes, ['NLSQL_DB_QUERY_FAILED', 'NLSQL_DB_EXPLAIN_FAILED']);
});

test('run_select enforces schema policy before calling the driver', async () => {
  const db = new FakeDriver();
  const service = new ToolService(db, throwingIntrospector(new Error('unused')), config(), getDialect('postgres'));

  const denied = await service.runSelect('SELECT * FROM private.users');
  const unqualified = await service.runSelect('SELECT * FROM users');
  const write = await service.runSelect('DELETE FROM public.users');

  assert.match(body(denied), /\[NLSQL_SCHEMA_DENIED\]/);
  assert.match(body(unqualified), /\[NLSQL_SCHEMA_QUALIFICATION_REQUIRED\]/);
  assert.match(body(write), /\[NLSQL_SQL_REJECTED\]/);
  assert.equal(db.calls.length, 0);
});

test('run_select and explain_select reject out-of-scope CTE aliases before any driver call', async () => {
  const db = new FakeDriver();
  const service = new ToolService(db, throwingIntrospector(new Error('unused')), config(), getDialect('postgres'));
  for (const sql of [
    'WITH pg_settings AS (SELECT * FROM pg_settings) SELECT * FROM pg_settings',
    'WITH first_cte AS (SELECT * FROM pg_settings), pg_settings AS (SELECT 1) SELECT * FROM first_cte',
    'SELECT * FROM (WITH hidden AS (SELECT 1) SELECT * FROM hidden) nested JOIN hidden ON true',
  ]) for (const method of ['runSelect', 'explainSelect']) {
    const result = await service[method](sql);
    assert.equal(result.isError, true, `${method}: ${sql}`);
    assert.match(body(result), /\[NLSQL_SCHEMA_QUALIFICATION_REQUIRED\]/);
    assert.equal(db.calls.length, 0, 'unsafe aliases must never reach the database driver');
  }
});

test('valid sibling, nested, and recursive CTEs still reach the guarded driver', async () => {
  const db = new FakeDriver();
  const service = new ToolService(db, throwingIntrospector(new Error('unused')), config(), getDialect('postgres'));
  for (const sql of [
    'WITH seed AS (SELECT id FROM public.users), recent AS (SELECT id FROM seed) SELECT * FROM recent',
    'SELECT * FROM (WITH recent AS (SELECT id FROM public.users) SELECT * FROM recent) nested',
    'WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 3) SELECT * FROM seq',
  ]) for (const method of ['runSelect', 'explainSelect']) {
    const previousCalls = db.calls.length;
    const result = await service[method](sql);
    assert.equal(result.isError, false, `${method}: ${body(result)}`);
    assert.equal(db.calls.length, previousCalls + 1);
  }
});

test('SQL-standard function separators reach the driver through SELECT, CTE, and EXISTS scopes', async () => {
  for (const dialect of ['postgres', 'mysql']) {
    const db = new FakeDriver();
    const service = new ToolService(db, throwingIntrospector(new Error('unused')), { ...config(), dialect }, getDialect(dialect));
    for (const expression of ['EXTRACT(YEAR FROM created_at)', 'substring(code FROM 1 FOR 3)', "trim(BOTH 'x' FROM code)"]) {
      const select = `SELECT ${expression} AS value FROM public.orders`;
      for (const sql of [select, `WITH projected AS (${select}) SELECT * FROM projected`, `SELECT 1 WHERE EXISTS (${select})`]) {
        for (const method of ['runSelect', 'explainSelect']) {
          const previousCalls = db.calls.length;
          const result = await service[method](sql);
          assert.equal(result.isError, false, `${dialect} ${method}: ${body(result)}`);
          assert.equal(db.calls.length, previousCalls + 1);
        }
      }
    }
  }
});

test('function separators never hide denied relations, unknown functions, or nested CTE names from the driver guard', async () => {
  for (const dialect of ['postgres', 'mysql']) {
    const db = new FakeDriver();
    const service = new ToolService(db, throwingIntrospector(new Error('unused')), { ...config(), dialect }, getDialect(dialect));
    const dangerous = dialect === 'postgres' ? '"pg_read_file"' : '`load_file`';
    for (const sql of [
      'SELECT EXTRACT(YEAR FROM (SELECT created_at FROM private.orders LIMIT 1))',
      'SELECT substring((SELECT code FROM private.orders LIMIT 1) FROM 1 FOR 3)',
      "SELECT trim(BOTH 'x' FROM (SELECT code FROM private.orders LIMIT 1))",
      "SELECT trim(BOTH 'x' FROM private.clean(code)) FROM public.orders",
      'SELECT custom_extract(YEAR FROM private.orders)',
      'SELECT public.extract(YEAR FROM private.orders)',
      'WITH hidden AS (SELECT substring((SELECT code FROM hidden LIMIT 1) FROM 1 FOR 3)) SELECT * FROM hidden',
      'SELECT substring((WITH hidden AS (SELECT code FROM public.orders) SELECT code FROM hidden LIMIT 1) FROM 1 FOR 3), (SELECT code FROM hidden)',
      `SELECT trim(BOTH FROM ${dangerous}('synthetic'))`,
    ]) for (const method of ['runSelect', 'explainSelect']) {
      const result = await service[method](sql);
      assert.equal(result.isError, true, `${dialect} ${method}: ${sql}`);
      assert.equal(db.calls.length, 0, 'rejected function arguments must never reach the database driver');
    }
  }
});

test('known policy failures keep only their stable code at the log boundary', async () => {
  const codes = [];
  const db = new FakeDriver();
  const policy = new SchemaPolicyError('NLSQL_SCHEMA_DENIED', `denied ${SECRET}`);
  const service = new ToolService(db, throwingIntrospector(policy), config(), getDialect('postgres'), (c) => codes.push(c));
  const result = await service.listTables('private');

  assert.match(body(result), /\[NLSQL_SCHEMA_DENIED\]/);
  assert.doesNotMatch(body(result), /super-secret|internal-db|denied/);
  assert.deepEqual(codes, ['NLSQL_SCHEMA_DENIED']);
});

test('last-resort MCP boundary sanitizes unexpected exceptions', async () => {
  const codes = [];
  const result = await sanitizeToolCall(
    async () => { throw new Error(`unexpected ${SECRET}`); },
    (c) => codes.push(c),
  );
  assert.match(body(result), /\[NLSQL_INTERNAL_ERROR\]/);
  assert.doesNotMatch(body(result), /super-secret|internal-db|unexpected/);
  assert.deepEqual(codes, ['NLSQL_INTERNAL_ERROR']);
});
