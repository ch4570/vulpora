import assert from 'node:assert/strict';
import test from 'node:test';

import { getDialect } from '../dist/dialect.js';
import { Introspector } from '../dist/introspect.js';
import { SchemaPolicyError } from '../dist/schema-policy.js';

function config(allowedSchemas = ['public']) {
  return {
    dialect: 'postgres', ssl: false, sslMode: 'disable', maxRows: 100,
    statementTimeoutMs: 5_000, allowedSchemas, maxCellChars: 2_000,
  };
}

class FakeDriver {
  calls = [];
  responses = [];

  async ping() { return 'fake'; }
  async close() {}
  async runReadOnly(sql, params) {
    this.calls.push({ sql, params });
    return this.responses.shift() ?? { fields: [], rows: [], rowCount: 0, elapsedMs: 1 };
  }
}

test('listTables rejects denied/invalid schema names before touching the driver', async () => {
  const db = new FakeDriver();
  const introspector = new Introspector(db, config(), getDialect('postgres'));

  await assert.rejects(() => introspector.listTables('private'), (error) => {
    assert.ok(error instanceof SchemaPolicyError);
    return error.code === 'NLSQL_SCHEMA_DENIED';
  });
  await assert.rejects(() => introspector.listTables('public;drop'), (error) => {
    assert.ok(error instanceof SchemaPolicyError);
    return error.code === 'NLSQL_INVALID_IDENTIFIER';
  });
  assert.equal(db.calls.length, 0);
});

test('listSchemas and listTables carry the allowlist into parameterized SQL', async () => {
  const db = new FakeDriver();
  const introspector = new Introspector(db, config(['public', 'analytics']), getDialect('postgres'));

  await introspector.listSchemas();
  await introspector.listTables('public');

  assert.match(db.calls[0].sql, /table_schema IN \(\$1, \$2\)/);
  assert.deepEqual(db.calls[0].params, ['public', 'analytics']);
  assert.match(db.calls[1].sql, /table_schema = \$1 AND table_schema IN \(\$2, \$3\)/);
  assert.deepEqual(db.calls[1].params, ['public', 'public', 'analytics']);
});

test('metadata rows are exact-filtered after DB collation matching', async () => {
  const db = new FakeDriver();
  db.responses.push(
    {
      fields: [],
      rows: [
        { schema_name: 'public', tbls: 2 },
        { schema_name: 'PUBLIC', tbls: 99 },
      ],
      rowCount: 2,
      elapsedMs: 1,
    },
    {
      fields: [],
      rows: [
        { sch: 'public', table_name: 'users', table_type: 'BASE TABLE' },
        { sch: 'PUBLIC', table_name: 'secrets', table_type: 'BASE TABLE' },
      ],
      rowCount: 2,
      elapsedMs: 1,
    },
  );
  const introspector = new Introspector(db, config(), getDialect('postgres'));

  assert.deepEqual(await introspector.listSchemas(), [{ schema: 'public', tables: 2 }]);
  assert.deepEqual(await introspector.listTables('public'), [{ table: 'users', kind: 'BASE TABLE' }]);
});

test('describeTable filters source and referenced FK schemas', async () => {
  const db = new FakeDriver();
  db.responses.push(
    {
      fields: [],
      rows: [{ sch: 'public', tbl: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null }],
      rowCount: 1,
      elapsedMs: 1,
    },
    { fields: [], rows: [{ sch: 'public', tbl: 'users', col: 'id' }], rowCount: 1, elapsedMs: 1 },
    {
      fields: [],
      rows: [{
        source_schema: 'public', source_table: 'users', cn: 'hidden_fk', col: 'id',
        ref_schema: 'private', ref_table: 'accounts', ref_col: 'id',
      }],
      rowCount: 1,
      elapsedMs: 1,
    },
  );
  const introspector = new Introspector(db, config(), getDialect('postgres'));

  const info = await introspector.describeTable('public', 'users');

  assert.equal(info?.columns[0]?.column, 'id');
  assert.deepEqual(info?.foreignKeys, []);
  assert.equal(db.calls.length, 3);
  assert.match(db.calls[0].sql, /table_schema IN \(\$3\)/);
  assert.match(db.calls[1].sql, /tc\.table_schema IN \(\$3\)/);
  assert.match(db.calls[2].sql, /tc\.table_schema IN \(\$3\)/);
  assert.match(db.calls[2].sql, /ccu\.table_schema IN \(\$4\)/);
  assert.deepEqual(db.calls[2].params, ['public', 'users', 'public', 'public']);
});

test('an empty allowlist fails closed before introspection', async () => {
  const db = new FakeDriver();
  const introspector = new Introspector(db, config([]), getDialect('postgres'));
  await assert.rejects(() => introspector.listSchemas(), (error) => {
    assert.ok(error instanceof SchemaPolicyError);
    return error.code === 'NLSQL_SCHEMA_NOT_CONFIGURED';
  });
  assert.equal(db.calls.length, 0);
});
