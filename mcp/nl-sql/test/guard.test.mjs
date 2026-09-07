import assert from 'node:assert/strict';
import test from 'node:test';

import { getDialect } from '../dist/dialect.js';
import { assertReadOnlySelect, SqlGuardError } from '../dist/guard.js';

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
