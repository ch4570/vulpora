import assert from 'node:assert/strict';
import test from 'node:test';

import { getDialect } from '../dist/dialect.js';
import {
  assertAllowedSchemasConfigured,
  assertIdentifier,
  assertSchemaAllowed,
  assertSqlSchemaAccess,
  SchemaPolicyError,
} from '../dist/schema-policy.js';

const pg = getDialect('postgres');

function code(error) {
  assert.ok(error instanceof SchemaPolicyError);
  return error.code;
}

test('allowlist is mandatory and identifiers are conservative', () => {
  assert.throws(() => assertAllowedSchemasConfigured([]), (error) => code(error) === 'NLSQL_SCHEMA_NOT_CONFIGURED');
  assert.throws(() => assertAllowedSchemasConfigured(['public', 'public']), (error) => code(error) === 'NLSQL_INVALID_IDENTIFIER');
  assert.equal(assertIdentifier('tenant_42$archive'), 'tenant_42$archive');
  assert.throws(() => assertIdentifier('public; DROP SCHEMA public'), (error) => code(error) === 'NLSQL_INVALID_IDENTIFIER');
  assert.throws(() => assertSchemaAllowed('private', ['public']), (error) => code(error) === 'NLSQL_SCHEMA_DENIED');
});

test('qualified relations are allowed only inside the configured schemas', () => {
  assert.doesNotThrow(() => assertSqlSchemaAccess('SELECT * FROM public.users', ['public'], pg));
  assert.doesNotThrow(() => assertSqlSchemaAccess('SELECT * FROM "public"."users"', ['public'], pg));
  assert.doesNotThrow(() => assertSqlSchemaAccess('SELECT 1', ['public'], pg));
  assert.throws(
    () => assertSqlSchemaAccess('SELECT * FROM private.users', ['public'], pg),
    (error) => code(error) === 'NLSQL_SCHEMA_DENIED',
  );
});

test('known SQL-standard function FROM separators are not physical relations', () => {
  for (const dialect of [pg, getDialect('mysql')]) {
    for (const sql of [
      'SELECT EXTRACT(YEAR FROM created_at) FROM public.orders',
      'SELECT extract(YEAR FROM o.created_at) FROM public.orders o',
      'SELECT EXTRACT(YEAR FROM (created_at)) FROM public.orders',
      'SELECT substring(code FROM 1 FOR 3) FROM public.orders',
      "SELECT TRIM(BOTH 'x' FROM code) FROM public.orders",
      "SELECT substring(trim(BOTH 'x' FROM o.code) FROM 1 FOR 3) FROM public.orders o",
      'SELECT EXTRACT(YEAR FROM (SELECT created_at FROM public.orders LIMIT 1))',
      'SELECT substring((SELECT code FROM public.orders LIMIT 1) FROM 1 FOR 3)',
      "SELECT trim(BOTH 'x' FROM (SELECT code FROM public.orders LIMIT 1))",
      'WITH seed AS (SELECT code FROM public.orders) SELECT substring((SELECT code FROM seed LIMIT 1) FROM 1 FOR 3)',
    ]) assert.doesNotThrow(() => assertSqlSchemaAccess(sql, ['public'], dialect), sql);
  }
  // PostgreSQL also documents this non-standard, comma-separated TRIM form.
  assert.doesNotThrow(() => assertSqlSchemaAccess("SELECT trim(BOTH FROM code, 'x') FROM public.orders", ['public'], pg));
});

test('function FROM separators do not exempt nested relations, functions, or CTE scope checks', () => {
  for (const dialect of [pg, getDialect('mysql')]) {
    for (const sql of [
      'SELECT EXTRACT(YEAR FROM (SELECT created_at FROM private.orders LIMIT 1))',
      'SELECT substring((SELECT code FROM private.orders LIMIT 1) FROM 1 FOR 3)',
      "SELECT trim(BOTH 'x' FROM (SELECT code FROM private.orders LIMIT 1))",
      'SELECT EXTRACT(YEAR FROM private.created_at()) FROM public.orders',
      'SELECT substring(code FROM private.start_at() FOR 3) FROM public.orders',
      "SELECT trim(BOTH 'x' FROM private.clean(code)) FROM public.orders",
    ]) assert.throws(
      () => assertSqlSchemaAccess(sql, ['public'], dialect),
      (error) => code(error) === 'NLSQL_SCHEMA_DENIED', sql,
    );
    for (const sql of [
      'SELECT substring((SELECT code FROM orders LIMIT 1) FROM 1 FOR 3)',
      'WITH hidden AS (SELECT substring((SELECT code FROM hidden LIMIT 1) FROM 1 FOR 3)) SELECT * FROM hidden',
      'WITH first_cte AS (SELECT substring((SELECT code FROM later_cte LIMIT 1) FROM 1 FOR 3)), later_cte AS (SELECT code FROM public.orders) SELECT * FROM first_cte',
      'SELECT substring((WITH hidden AS (SELECT code FROM public.orders) SELECT code FROM hidden LIMIT 1) FROM 1 FOR 3), (SELECT code FROM hidden)',
    ]) assert.throws(
      () => assertSqlSchemaAccess(sql, ['public'], dialect),
      (error) => code(error) === 'NLSQL_SCHEMA_QUALIFICATION_REQUIRED', sql,
    );
    assert.throws(
      () => assertSqlSchemaAccess('SELECT substring((SELECT code FROM public.orders, private.orders LIMIT 1) FROM 1 FOR 3)', ['public'], dialect),
      (error) => code(error) === 'NLSQL_SCHEMA_QUERY_UNSUPPORTED',
    );
    const dangerous = dialect.name === 'postgres' ? '"pg_read_file"' : '`load_file`';
    assert.throws(
      () => assertSqlSchemaAccess(`SELECT trim(BOTH FROM ${dangerous}('synthetic'))`, ['public'], dialect),
      (error) => code(error) === 'NLSQL_SCHEMA_QUERY_UNSUPPORTED',
    );
  }
  assert.throws(
    () => assertSqlSchemaAccess('SELECT substring((TABLE private.orders LIMIT 1) FROM 1 FOR 3)', ['public'], pg),
    (error) => code(error) === 'NLSQL_SCHEMA_DENIED',
  );
});

test('function separator exemptions are limited to unqualified unquoted known dialect syntax', () => {
  for (const dialect of [pg, getDialect('mysql')]) {
    const quoted = dialect.name === 'postgres' ? '"extract"' : '`extract`';
    for (const name of ['custom_extract', 'public.extract', quoted]) assert.throws(
      () => assertSqlSchemaAccess(`SELECT ${name}(YEAR FROM private.orders)`, ['public'], dialect),
      (error) => code(error) === 'NLSQL_SCHEMA_DENIED', name,
    );
    assert.throws(
      () => assertSqlSchemaAccess('SELECT * FROM extract(YEAR FROM created_at)', ['public'], dialect),
      (error) => code(error) === 'NLSQL_SCHEMA_QUERY_UNSUPPORTED',
    );
  }
  assert.throws(
    () => assertSqlSchemaAccess('SELECT EXTRACT(YEAR FROM private.orders)', ['public'], getDialect('mssql')),
    (error) => code(error) === 'NLSQL_SCHEMA_DENIED',
  );
});

test('unqualified relations cannot inherit an unsafe search path', () => {
  assert.throws(
    () => assertSqlSchemaAccess('SELECT * FROM users', ['public'], pg),
    (error) => code(error) === 'NLSQL_SCHEMA_QUALIFICATION_REQUIRED',
  );
  assert.throws(
    () => assertSqlSchemaAccess('TABLE users', ['public'], pg),
    (error) => code(error) === 'NLSQL_SCHEMA_QUALIFICATION_REQUIRED',
  );
});

test('CTEs and nested SELECTs are inspected without treating CTE names as tables', () => {
  assert.doesNotThrow(() => assertSqlSchemaAccess(
    'WITH recent AS (SELECT id FROM public.users) SELECT * FROM recent',
    ['public'],
    pg,
  ));
  assert.throws(
    () => assertSqlSchemaAccess(
      'WITH recent AS (SELECT id FROM private.users) SELECT * FROM recent',
      ['public'],
      pg,
    ),
    (error) => code(error) === 'NLSQL_SCHEMA_DENIED',
  );
  assert.throws(
    () => assertSqlSchemaAccess(
      'SELECT * FROM (SELECT * FROM private.users) AS hidden',
      ['public'],
      pg,
    ),
    (error) => code(error) === 'NLSQL_SCHEMA_DENIED',
  );
});

test('nonrecursive CTE bodies cannot borrow their own or a later CTE name', () => {
  for (const dialect of [pg, getDialect('mysql')]) {
    for (const sql of [
      'WITH pg_settings AS (SELECT * FROM pg_settings) SELECT * FROM pg_settings',
      'WITH first_cte AS (SELECT * FROM later_cte), later_cte AS (SELECT 1) SELECT * FROM first_cte',
      'WITH first_cte AS (SELECT * FROM (SELECT * FROM later_cte) nested), later_cte AS (SELECT 1) SELECT * FROM first_cte',
    ]) assert.throws(
      () => assertSqlSchemaAccess(sql, ['public'], dialect),
      (error) => code(error) === 'NLSQL_SCHEMA_QUALIFICATION_REQUIRED',
      sql,
    );
  }
  assert.throws(
    () => assertSqlSchemaAccess('WITH "PgSettings" AS (SELECT * FROM "PgSettings") SELECT * FROM "PgSettings"', ['public'], pg),
    (error) => code(error) === 'NLSQL_SCHEMA_QUALIFICATION_REQUIRED',
  );
});

test('CTE scopes preserve earlier siblings, outer references, and nested shadowing', () => {
  for (const [name, schema] of [['postgres', 'public'], ['mysql', 'app'], ['mssql', 'dbo']]) {
    assert.doesNotThrow(() => assertSqlSchemaAccess(
      `WITH seed AS (SELECT id FROM ${schema}.users), recent AS (SELECT id FROM seed) SELECT * FROM recent`,
      [schema], getDialect(name),
    ));
  }
  for (const dialect of [pg, getDialect('mysql')]) {
    for (const sql of [
      'SELECT * FROM (WITH recent AS (SELECT id FROM public.users) SELECT * FROM recent) nested',
      'WITH seed AS (SELECT id FROM public.users) SELECT * FROM (WITH recent AS (SELECT id FROM seed) SELECT * FROM recent) nested',
      'WITH seed AS (SELECT id FROM public.users) SELECT * FROM (WITH seed AS (SELECT id FROM seed) SELECT * FROM seed) nested',
      'WITH seed AS (WITH recent AS (SELECT id FROM public.users) SELECT * FROM recent) SELECT * FROM seed',
      'WITH seed AS (SELECT id FROM public.users) SELECT * FROM (WITH RECURSIVE seq(n) AS (SELECT id FROM seed UNION ALL SELECT n + 1 FROM seq WHERE n < 3) SELECT * FROM seq) nested',
    ]) assert.doesNotThrow(() => assertSqlSchemaAccess(sql, ['public'], dialect), sql);
  }
  assert.doesNotThrow(() => assertSqlSchemaAccess(
    'WITH "Recent"(id) AS NOT MATERIALIZED (SELECT id FROM public.users) SELECT * FROM "Recent"', ['public'], pg,
  ));
  assert.doesNotThrow(() => assertSqlSchemaAccess(
    'WITH recursive AS (SELECT id FROM dbo.users) SELECT * FROM recursive', ['dbo'], getDialect('mssql'),
  ));
});

test('nested CTE names never leak to their parent or sibling query', () => {
  for (const sql of [
    'SELECT * FROM (WITH hidden AS (SELECT 1) SELECT * FROM hidden) nested JOIN hidden ON true',
    'WITH first_cte AS (WITH hidden AS (SELECT 1) SELECT * FROM hidden), second_cte AS (SELECT * FROM hidden) SELECT * FROM second_cte',
    'WITH seed AS (SELECT 1) SELECT * FROM (WITH hidden AS (SELECT 1) SELECT * FROM hidden) nested JOIN hidden ON true',
  ]) assert.throws(
    () => assertSqlSchemaAccess(sql, ['public'], pg),
    (error) => code(error) === 'NLSQL_SCHEMA_QUALIFICATION_REQUIRED',
    sql,
  );
  assert.throws(
    () => assertSqlSchemaAccess('SELECT * FROM (WITH hidden AS (SELECT * FROM private.users) SELECT * FROM hidden) nested', ['public'], pg),
    (error) => code(error) === 'NLSQL_SCHEMA_DENIED',
  );
  assert.throws(
    () => assertSqlSchemaAccess('WITH seed AS (WITH inner_cte AS (SELECT 1) SELECT * FROM inner_cte) SELECT * FROM seed', ['dbo'], getDialect('mssql')),
    (error) => code(error) === 'NLSQL_SCHEMA_QUERY_UNSUPPORTED',
  );
});

test('recursive CTE visibility follows each dialect without exempting physical sources', () => {
  for (const name of ['postgres', 'mysql', 'mssql']) {
    const prefix = name === 'mssql' ? 'WITH' : 'WITH RECURSIVE';
    const dialect = getDialect(name);
    assert.doesNotThrow(() => assertSqlSchemaAccess(
      `${prefix} seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 3) SELECT * FROM seq`, ['public'], dialect,
    ));
    assert.throws(
      () => assertSqlSchemaAccess(`${prefix} seq(n) AS (SELECT id FROM private.users UNION ALL SELECT n + 1 FROM seq WHERE n < 3) SELECT * FROM seq`, ['public'], dialect),
      (error) => code(error) === 'NLSQL_SCHEMA_DENIED',
    );
  }
  const forward = 'WITH RECURSIVE first_cte AS (SELECT * FROM later_cte), later_cte AS (SELECT 1) SELECT * FROM first_cte';
  assert.doesNotThrow(() => assertSqlSchemaAccess(forward, ['public'], pg));
  assert.throws(
    () => assertSqlSchemaAccess(forward, ['public'], getDialect('mysql')),
    (error) => code(error) === 'NLSQL_SCHEMA_QUALIFICATION_REQUIRED',
  );
  assert.throws(
    () => assertSqlSchemaAccess(forward.replace('WITH RECURSIVE', 'WITH'), ['public'], getDialect('mssql')),
    (error) => code(error) === 'NLSQL_SCHEMA_QUALIFICATION_REQUIRED',
  );
});

test('ambiguous CTE headers fail closed instead of publishing guessed names', () => {
  for (const sql of [
    'WITH repeated AS (SELECT 1), repeated AS (SELECT 2) SELECT * FROM repeated',
    'WITH missing_as (SELECT * FROM public.users) SELECT * FROM missing_as',
    'WITH malformed(id SELECT * FROM private.users) AS (SELECT 1) SELECT * FROM malformed',
  ]) assert.throws(
    () => assertSqlSchemaAccess(sql, ['public'], pg),
    (error) => code(error) === 'NLSQL_SCHEMA_QUERY_UNSUPPORTED',
  );
});

test('every explicit JOIN is checked and ambiguous relation forms fail closed', () => {
  assert.throws(
    () => assertSqlSchemaAccess(
      'SELECT * FROM public.users u JOIN private.orders o ON o.user_id = u.id',
      ['public'],
      pg,
    ),
    (error) => code(error) === 'NLSQL_SCHEMA_DENIED',
  );
  assert.throws(
    () => assertSqlSchemaAccess('SELECT * FROM public.users, private.orders', ['public'], pg),
    (error) => code(error) === 'NLSQL_SCHEMA_QUERY_UNSUPPORTED',
  );
  assert.throws(
    () => assertSqlSchemaAccess('SELECT * FROM public.read_users()', ['public'], pg),
    (error) => code(error) === 'NLSQL_SCHEMA_QUERY_UNSUPPORTED',
  );
  assert.throws(
    () => assertSqlSchemaAccess('SELECT * FROM ONLY (private.users)', ['public'], pg),
    (error) => code(error) === 'NLSQL_SCHEMA_QUERY_UNSUPPORTED',
  );
  assert.throws(
    () => assertSqlSchemaAccess('SELECT * FROM app.public.users', ['public'], getDialect('mssql')),
    (error) => code(error) === 'NLSQL_SCHEMA_QUERY_UNSUPPORTED',
  );
});

test('quoted spellings cannot bypass the forbidden function list', () => {
  assert.throws(
    () => assertSqlSchemaAccess('SELECT "pg_read_file"(\'/etc/passwd\')', ['public'], pg),
    (error) => code(error) === 'NLSQL_SCHEMA_QUERY_UNSUPPORTED',
  );
  assert.throws(
    () => assertSqlSchemaAccess('SELECT `load_file`(\'/etc/passwd\')', ['app'], getDialect('mysql')),
    (error) => code(error) === 'NLSQL_SCHEMA_QUERY_UNSUPPORTED',
  );
  assert.throws(
    () => assertSqlSchemaAccess('SELECT private.read_secret()', ['public'], pg),
    (error) => code(error) === 'NLSQL_SCHEMA_DENIED',
  );
  assert.doesNotThrow(() => assertSqlSchemaAccess('SELECT public.safe_summary()', ['public'], pg));
});

test('dialect-specific quoted identifiers are checked', () => {
  assert.doesNotThrow(() => assertSqlSchemaAccess('SELECT * FROM `app`.`users`', ['app'], getDialect('mysql')));
  assert.doesNotThrow(() => assertSqlSchemaAccess('SELECT * FROM [dbo].[users]', ['dbo'], getDialect('mssql')));
  assert.throws(
    () => assertSqlSchemaAccess('SELECT * FROM [secret].[users]', ['dbo'], getDialect('mssql')),
    (error) => code(error) === 'NLSQL_SCHEMA_DENIED',
  );
});
