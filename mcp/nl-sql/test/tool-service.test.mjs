import assert from 'node:assert/strict';
import test from 'node:test';

import { getDialect } from '../dist/dialect.js';
import { SchemaPolicyError } from '../dist/schema-policy.js';
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
