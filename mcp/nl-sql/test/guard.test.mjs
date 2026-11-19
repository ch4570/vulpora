import assert from 'node:assert/strict';
import test from 'node:test';

import { getDialect } from '../dist/dialect.js';
import { applyLimit, assertReadOnlySelect, maskLiterals, SqlGuardError } from '../dist/guard.js';

for (const name of ['postgres', 'mysql', 'mssql']) {
  const dialect = getDialect(name);

  test(`${name}: accepts a single read-only SELECT`, () => {
    const result = assertReadOnlySelect("SELECT id FROM app.users WHERE email = 'drop table nope'", dialect);
    assert.equal(result.hasLimit, false);
  });

  test(`${name}: rejects writes, multiple statements, and row locks`, () => {
    assert.throws(() => assertReadOnlySelect('UPDATE app.users SET admin = true', dialect), SqlGuardError);
    assert.throws(() => assertReadOnlySelect('SELECT 1; SELECT 2', dialect), SqlGuardError);
    assert.throws(() => assertReadOnlySelect('SELECT * FROM app.users FOR UPDATE', dialect), SqlGuardError);
    assert.throws(() => assertReadOnlySelect('WITH x AS (DELETE FROM app.users RETURNING *) SELECT * FROM x', dialect), SqlGuardError);
  });

  test(`${name}: rejects ambiguous or unterminated lexical constructs`, () => {
    assert.throws(() => assertReadOnlySelect("SELECT 'unterminated", dialect), SqlGuardError);
    assert.throws(() => assertReadOnlySelect('SELECT 1 /* unterminated', dialect), SqlGuardError);
    assert.throws(() => assertReadOnlySelect('SELECT 1 /* outer /* nested */', dialect), SqlGuardError);
    assert.throws(() => assertReadOnlySelect('SELECT 1 /*+ optimizer hint */', dialect), SqlGuardError);
  });
}

test('mysql: rejects executable version comments instead of masking them', () => {
  const mysql = getDialect('mysql');
  assert.throws(
    () => assertReadOnlySelect("SELECT 1 /*!50000 INTO OUTFILE '/tmp/result' */", mysql),
    SqlGuardError,
  );
  assert.throws(() => assertReadOnlySelect('SELECT 1 /*M!100100 SELECT 2 */', mysql), SqlGuardError);
  assert.throws(() => assertReadOnlySelect("SELECT 'ambiguous\\'quote'", mysql), SqlGuardError);
});

test('postgres: rejects an unterminated dollar quote', () => {
  assert.throws(() => assertReadOnlySelect('SELECT $tag$secret', getDialect('postgres')), SqlGuardError);
  assert.throws(() => assertReadOnlySelect('SELECT $1$not-a-valid-dollar-tag$1$', getDialect('postgres')), SqlGuardError);
});

test('dialect-specific side effects remain blocked', () => {
  assert.throws(
    () => assertReadOnlySelect("SELECT query_to_xml('SELECT * FROM private.users', true, false, '')", getDialect('postgres')),
    SqlGuardError,
  );
  assert.throws(
    () => assertReadOnlySelect('SELECT NEXT VALUE FOR public.order_seq', getDialect('mssql')),
    SqlGuardError,
  );
  assert.throws(
    () => assertReadOnlySelect('SELECT * FROM dbo.users WITH (UPDLOCK)', getDialect('mssql')),
    SqlGuardError,
  );
});

for (const command of [
  'COMMIT', 'COMMIT TRANSACTION', 'COMMIT WORK', 'ROLLBACK', 'ROLLBACK TRANSACTION',
  'ROLLBACK WORK', 'BEGIN TRANSACTION', 'SAVE TRANSACTION savepoint',
  'SET ROWCOUNT 0', 'SET IMPLICIT_TRANSACTIONS ON', 'USE other_database',
  'DECLARE @value int', 'DBCC CHECKDB', 'BACKUP DATABASE synthetic TO DISK = \'synthetic\'',
  'RESTORE DATABASE synthetic', 'KILL 1', 'SHUTDOWN', 'CHECKPOINT', 'RECONFIGURE',
  'RETURN', 'THROW 50000, \'synthetic\', 1', 'RAISERROR (\'synthetic\', 16, 1)',
  'GOTO target', 'IF 1 = 1 SELECT 2', 'WHILE 1 = 1 SELECT 2', 'PRINT \'synthetic\'',
  'DENY SELECT TO public', 'WAITFOR DELAY \'00:00:01\'',
]) {
  test(`mssql: rejects semicolon-free control statement ${command}`, () => {
    for (const separator of [' ', '\n', '\u00a0', ' /* gap */ ']) {
      assert.throws(
        () => assertReadOnlySelect(`SELECT 1${separator}${command}`, getDialect('mssql')),
        SqlGuardError,
      );
    }
  });
}

test('mssql: control words in quoted atoms, comments and complete identifiers remain data', () => {
  const dialect = getDialect('mssql');
  for (const sql of [
    `SELECT 'COMMIT TRANSACTION; SET ROWCOUNT 0' AS [rollback]`,
    'SELECT [commit], "rollback", [set] FROM [dbo].[begin]',
    'SELECT commit_count, commit$label, @commit, @@rowcount FROM dbo.control_log',
    'SELECT commité FROM dbo.control_log',
    'SELECT 1 /* COMMIT TRANSACTION */ -- ROLLBACK TRANSACTION',
    'WITH [commit] AS (SELECT 1 AS [rollback]) SELECT [rollback] FROM [commit] UNION ALL SELECT 2',
    'SELECT CASE WHEN id = 1 THEN 1 ELSE 0 END FROM dbo.users',
  ]) assert.doesNotThrow(() => assertReadOnlySelect(sql, dialect), sql);
});

test('mssql: numeric boundaries cannot hide a following transaction command', () => {
  for (const value of ['1', '1.0', '1.e2', '1e+2', '$1', '£1']) {
    for (const command of ['COMMIT', 'ROLLBACK']) {
      assert.throws(
        () => assertReadOnlySelect(`SELECT ${value}${command} TRANSACTION`, getDialect('mssql')),
        SqlGuardError,
      );
    }
  }
  assert.throws(
    () => assertReadOnlySelect('SELECT 0x01ROLLBACK TRANSACTION', getDialect('mssql')),
    SqlGuardError,
  );
});

test('mssql: numeric boundaries also retain existing write and side-effect denials', () => {
  for (const command of [
    'UPDATE dbo.users SET active = 1', 'DELETE FROM dbo.users',
    'INSERT INTO dbo.users VALUES (1)', 'EXEC dbo.synthetic',
    "WAITFOR DELAY '00:00:01'",
  ]) assert.throws(() => assertReadOnlySelect(`SELECT 1${command}`, getDialect('mssql')), SqlGuardError);
});

for (const name of ['postgres', 'mysql']) {
  const dialect = getDialect(name);
  test(`${name}: nested limits do not suppress the outer row limit`, () => {
    for (const sql of [
      'WITH small AS (SELECT id FROM public.users LIMIT 1) SELECT * FROM public.orders',
      'SELECT * FROM public.orders WHERE EXISTS (SELECT id FROM public.users LIMIT 1)',
      'SELECT * FROM (SELECT id FROM public.users LIMIT 1) small JOIN public.orders ON true',
      'SELECT (SELECT id FROM public.users LIMIT 1) FROM public.orders',
      'SELECT id FROM public.orders UNION ALL (SELECT id FROM public.users LIMIT 1)',
      '(SELECT id FROM public.users LIMIT 1) UNION ALL SELECT id FROM public.orders',
    ]) {
      const guard = assertReadOnlySelect(sql, dialect);
      assert.equal(guard.hasLimit, false, sql);
      assert.equal(applyLimit(guard, 7, dialect), `${sql}\nLIMIT 7`, sql);
    }
  });

  test(`${name}: genuine outer limits are preserved without changing caller intent`, () => {
    for (const sql of [
      'SELECT * FROM public.orders LIMIT 1000',
      'SELECT * FROM public.orders limit /* count */ 1',
      'SELECT 1 AS "x" LIMIT 5',
      'SELECT o."x" LIMIT 5',
      'SELECT * FROM public.orders LIMIT 1 OFFSET 2',
      'WITH small AS (SELECT id FROM public.users LIMIT 1) SELECT * FROM public.orders LIMIT 2',
      'SELECT id FROM public.orders UNION ALL (SELECT id FROM public.users LIMIT 1) LIMIT 2',
      '(SELECT * FROM public.orders LIMIT 1000)',
      '((SELECT * FROM public.orders LIMIT 1000)) /* outer comment */',
      '(SELECT * FROM public.orders LIMIT 1000) LIMIT 2',
    ]) {
      const guard = assertReadOnlySelect(sql, dialect);
      assert.equal(guard.hasLimit, true, sql);
      assert.equal(applyLimit(guard, 7, dialect), sql);
    }
  });

  test(`${name}: keyword-like identifiers and TOP functions are not row limits`, () => {
    for (const sql of [
      'SELECT order$limit FROM public.orders',
      'SELECT limit$label FROM public.orders',
      'SELECT o.limit FROM public.orders o',
      'SELECT id AS limit FROM public.orders',
      'SELECT top(5) FROM public.orders',
      "SELECT 'LIMIT 1 ( FETCH FIRST 1 ROW ONLY )', id FROM public.orders -- LIMIT 1",
      'SELECT id FROM public.orders /* ( LIMIT 1 ) */',
    ]) {
      const guard = assertReadOnlySelect(sql, dialect);
      assert.equal(guard.hasLimit, false, sql);
      assert.equal(applyLimit(guard, 7, dialect), `${sql}\nLIMIT 7`);
    }
  });
}

test('postgres: only an outer FETCH clause suppresses LIMIT injection', () => {
  const dialect = getDialect('postgres');
  for (const sql of [
    'SELECT * FROM public.orders FETCH FIRST 1 ROW ONLY',
    'SELECT * FROM public.orders OFFSET 1 ROW FETCH NEXT 2 ROWS ONLY',
    '((SELECT * FROM public.orders FETCH FIRST 1000 ROWS ONLY))',
  ]) assert.equal(applyLimit(assertReadOnlySelect(sql, dialect), 7, dialect), sql);
  const nested = 'WITH small AS (SELECT id FROM public.users FETCH FIRST 1 ROW ONLY) SELECT * FROM public.orders';
  assert.equal(applyLimit(assertReadOnlySelect(nested, dialect), 7, dialect), `${nested}\nLIMIT 7`);
});

test('mysql: leading-dollar and digit-prefixed identifiers do not become LIMIT keywords', () => {
  const dialect = getDialect('mysql');
  for (const name of ['$limit', '123limit', '123limit$label', '限limit']) {
    const sql = `SELECT ${name} FROM public.orders`;
    const guard = assertReadOnlySelect(sql, dialect);
    assert.equal(guard.hasLimit, false, sql);
    assert.equal(applyLimit(guard, 7, dialect), `${sql}\nLIMIT 7`);
  }
});

test('mysql: user variables do not suppress a cap, while LIMIT placeholders remain explicit', () => {
  const dialect = getDialect('mysql');
  for (const name of ['@limit', '@limit.value', '@@limit', "@'limit'", '@`limit`']) {
    const sql = `SELECT ${name} FROM public.orders`;
    assert.equal(applyLimit(assertReadOnlySelect(sql, dialect), 7, dialect), `${sql}\nLIMIT 7`);
  }
  for (const sql of ['SELECT id FROM public.orders LIMIT?', 'SELECT id FROM public.orders LIMIT 1']) {
    assert.equal(applyLimit(assertReadOnlySelect(sql, dialect), 7, dialect), sql);
  }
});

test('deep whole-query wrappers and nested expressions do not recurse or lose scope', () => {
  const dialect = getDialect('postgres');
  const wrap = sql => '('.repeat(15000) + sql + ')'.repeat(15000);
  const explicit = wrap('SELECT 1 LIMIT 1000');
  assert.equal(applyLimit(assertReadOnlySelect(explicit, dialect), 7, dialect), explicit);
  const nested = `SELECT ${wrap('SELECT 1 LIMIT 1')} FROM public.orders`;
  assert.equal(applyLimit(assertReadOnlySelect(nested, dialect), 7, dialect), `${nested}\nLIMIT 7`);
});

test('mssql: outer TOP/FETCH detection remains dialect-specific without SQL rewriting', () => {
  const dialect = getDialect('mssql');
  for (const sql of [
    'SELECT TOP (2) * FROM public.orders',
    'SELECT DISTINCT TOP 2 id FROM public.orders',
    'SELECT * FROM public.orders ORDER BY id OFFSET 0 ROWS FETCH NEXT 2 ROWS ONLY',
  ]) {
    const guard = assertReadOnlySelect(sql, dialect);
    assert.equal(guard.hasLimit, true, sql);
    assert.equal(applyLimit(guard, 7, dialect), sql);
  }
  for (const sql of [
    'WITH small AS (SELECT TOP (1) id FROM public.users) SELECT * FROM public.orders',
    'SELECT * FROM public.orders WHERE EXISTS (SELECT TOP 1 id FROM public.users)',
      'SELECT public.top(5) FROM public.orders',
      'SELECT TOP (1) id FROM public.orders UNION ALL SELECT id FROM public.users',
  ]) {
    const guard = assertReadOnlySelect(sql, dialect);
    assert.equal(guard.hasLimit, false, sql);
    assert.equal(applyLimit(guard, 7, dialect), sql);
  }
});

test('quoted atoms retain boundaries for clause detection without exposing their content', () => {
  const dialect = getDialect('postgres');
  const sql = `SELECT 'LIMIT 9', "limit", $$FETCH FIRST 9 ROWS ONLY$$ /* LIMIT 9 */`;
  const spaces = maskLiterals(sql, dialect);
  const atoms = maskLiterals(sql, dialect, true);
  assert.equal(spaces.length, sql.length);
  assert.equal(atoms.length, sql.length);
  assert.doesNotMatch(spaces + atoms, /LIMIT|FETCH/);
  assert.doesNotMatch(spaces, /\?/);
  assert.equal(atoms.match(/\?/g).length, 3);
  for (const delimiter of ["'", '"', '$$']) assert.equal(atoms[sql.indexOf(delimiter)], '?');
  assert.equal(atoms[sql.indexOf('/*')], ' ');
  for (const query of [
    'SELECT 1 AS "x" FETCH FIRST 5 ROWS ONLY',
    'SELECT o."x" FETCH FIRST 5 ROWS ONLY',
    'SELECT 1 AS "x" /* comment */ LIMIT 5',
    'SELECT 1 AS "limit" LIMIT 5',
  ]) assert.equal(applyLimit(assertReadOnlySelect(query, dialect), 7, dialect), query);
  const mssql = getDialect('mssql');
  assert.equal(assertReadOnlySelect('SELECT /* gap */ TOP (2) id FROM public.orders', mssql).hasLimit, true);
});
