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
