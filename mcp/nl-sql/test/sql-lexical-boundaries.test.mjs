import assert from 'node:assert/strict';
import net from 'node:net';
import test, { after, mock } from 'node:test';

import { getDialect } from '../dist/dialect.js';
import { assertReadOnlySelect, maskLiterals, SqlGuardError } from '../dist/guard.js';
import { assertSqlSchemaAccess, SchemaPolicyError } from '../dist/schema-policy.js';
import { ToolService } from '../dist/tool-service.js';

const connect = mock.method(net.Socket.prototype, 'connect', () => { throw new Error('Network prohibited'); });
after(() => assert.equal(connect.mock.callCount(), 0));

function fixture(name) {
  const dialect = getDialect(name);
  const calls = [];
  const db = {
    async runReadOnly(sql, params) {
      calls.push({ sql, params });
      return { fields: ['value'], rows: [{ value: 1 }], rowCount: 1, elapsedMs: 0 };
    },
  };
  const service = new ToolService(db, {}, {
    dialect: name, ssl: false, sslMode: 'disable', allowedSchemas: ['public'],
    maxRows: 7, maxCellChars: 2000, statementTimeoutMs: 5000,
  }, dialect);
  return { dialect, calls, service };
}

// PostgreSQL scan.l defines newline as [\n\r]. SQL Server's documented --
// terminators are CR, LF, or their combination. MySQL's lexer instead scans
// MY_LEX_COMMENT through the next LF; a bare CR remains inside the comment.
for (const name of ['postgres', 'mssql']) {
  for (const ending of ['\n', '\r\n', '\r']) {
    test(`${name}: ${JSON.stringify(ending)} ends a line comment before schema and statement checks`, async () => {
      const { dialect, calls, service } = fixture(name);
      for (const sql of [
        `SELECT 1 -- comment${ending}FROM private.orders`,
        `SELECT * FROM public.orders -- comment${ending}JOIN private.orders hidden ON 1 = 1`,
      ]) {
        assert.throws(() => assertSqlSchemaAccess(sql, ['public'], dialect), SchemaPolicyError);
        const result = await service.runSelect(sql);
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, /NLSQL_SCHEMA_DENIED/);
      }
      const write = `SELECT 1 -- comment${ending}; DELETE FROM public.orders`;
      assert.throws(() => assertReadOnlySelect(write, dialect), SqlGuardError);
      assert.equal((await service.runSelect(write)).isError, true);
      assert.equal(calls.length, 0);

      const limited = `SELECT * FROM public.orders -- comment${ending}`
        + (name === 'postgres' ? 'LIMIT 5' : 'ORDER BY value OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY');
      assert.equal(assertReadOnlySelect(limited, dialect).hasLimit, true);
      assert.equal((await service.runSelect(limited)).isError, false);
      assert.equal(calls[0].sql, limited);
    });
  }
}

for (const prefix of ['-- ', '#']) {
  test(`mysql: ${prefix} comments retain bare CR but end at LF and CRLF`, async () => {
    const { dialect, calls, service } = fixture('mysql');
    const bareCr = `SELECT 1 ${prefix}comment\rFROM private.orders LIMIT 1000`;
    assert.equal(assertReadOnlySelect(bareCr, dialect).hasLimit, false);
    assert.equal((await service.runSelect(bareCr)).isError, false);
    assert.equal(calls[0].sql, `${bareCr}\nLIMIT 7`);
    for (const ending of ['\n', '\r\n']) {
      const sql = `SELECT 1 ${prefix}comment${ending}FROM private.orders`;
      assert.throws(() => assertSqlSchemaAccess(sql, ['public'], dialect), SchemaPolicyError);
      assert.equal((await service.runSelect(sql)).isError, true);
    }
    assert.equal(calls.length, 1);
  });
}

// scan.l's dolq_start/dolq_cont include non-ASCII bytes, not only ASCII letters.
// This covers non-ASCII starts, mixed continuations, and UTF-16 surrogate pairs.
for (const tag of ['', 'tag', '_tag2', 'é', '한글', 'tagé', 'é_tag2', '𐐀']) {
  test(`postgres: dollar tag ${JSON.stringify(tag)} keeps literal SQL opaque to both guards`, async () => {
    const { dialect, calls, service } = fixture('postgres');
    const delimiter = `$${tag}$`;
    for (const text of ['LIMIT 1', 'FROM private.orders', 'DROP TABLE private.orders; --\r\n']) {
      const sql = `SELECT ${delimiter} ${text} ${delimiter} FROM public.orders`;
      assert.equal(assertReadOnlySelect(sql, dialect).hasLimit, false);
      assertSqlSchemaAccess(sql, ['public'], dialect);
      assert.equal((await service.runSelect(sql)).isError, false);
      assert.equal(calls.at(-1).sql, `${sql}\nLIMIT 7`);
    }
    const before = calls.length;
    const denied = `SELECT ${delimiter} FROM public.orders LIMIT 1 ${delimiter} FROM private.orders`;
    assert.equal((await service.runSelect(denied)).isError, true);
    assert.equal(calls.length, before);
  });
}

test('postgres: dollar tags match exactly and unterminated/invalid tags fail closed', async () => {
  const { dialect, calls, service } = fixture('postgres');
  for (const sql of [
    'SELECT $é$ missing closing tag',
    'SELECT $한글$ unfinished $다른태그$',
    'SELECT $É$ mismatched case $é$',
    'SELECT $1$ invalid numeric start $1$',
    'SELECT $1é$ invalid numeric start $1é$',
  ]) {
    assert.throws(() => assertReadOnlySelect(sql, dialect), SqlGuardError, sql);
    assert.throws(() => assertSqlSchemaAccess(sql, ['public'], dialect), SchemaPolicyError, sql);
    assert.equal((await service.runSelect(sql)).isError, true);
  }
  assert.equal(calls.length, 0);
  const sql = 'SELECT $É$ other $é$ and $한글$ tags are literal $É$ FROM public.orders';
  assert.equal((await service.runSelect(sql)).isError, false);
  assert.equal(calls[0].sql, `${sql}\nLIMIT 7`);
});

test('postgres: positional parameters and identifier suffixes never start dollar quotes', async () => {
  const { dialect, calls, service } = fixture('postgres');
  const params = Array.from({ length: 12 }, (_, i) => i);
  const bound = 'SELECT $1, $12 FROM public.orders';
  assert.equal(maskLiterals(bound, dialect, true), bound);
  assert.equal((await service.runSelect(bound, params)).isError, false);
  assert.deepEqual(calls[0], { sql: `${bound}\nLIMIT 7`, params });
  for (const identifier of ['prefix$tag$', 'é$tag$', 'prefix$é$', '한$한글$']) {
    const sql = `SELECT ${identifier} FROM public.orders`;
    assert.equal(maskLiterals(sql, dialect, true), sql);
    assert.equal((await service.runSelect(sql)).isError, false);
    const before = calls.length;
    assert.equal((await service.runSelect(`SELECT ${identifier} FROM private.orders`)).isError, true);
    assert.equal(calls.length, before);
  }
});

test('masking preserves offsets and quote sentinels around CR and Unicode dollar literals', () => {
  const dialect = getDialect('postgres');
  const sql = 'SELECT $𐐀_tag$ FROM private.orders\rLIMIT 1 $𐐀_tag$ -- hide LIMIT 9\rFROM public.orders LIMIT 5';
  const delimiter = '$𐐀_tag$';
  const start = sql.indexOf(delimiter);
  const end = sql.indexOf(delimiter, start + delimiter.length) + delimiter.length;
  const comment = sql.indexOf('-- hide');
  const commentEnd = sql.indexOf('\r', comment);
  for (const atoms of [false, true]) {
    const masked = maskLiterals(sql, dialect, atoms);
    assert.equal(masked.length, sql.length);
    assert.equal(masked.slice(start, end), (atoms ? '?' : ' ') + ' '.repeat(end - start - 1));
    assert.equal(masked.slice(comment, commentEnd), ' '.repeat(commentEnd - comment));
    assert.equal(masked.slice(commentEnd), sql.slice(commentEnd));
  }
  assert.equal(assertReadOnlySelect(sql, dialect).hasLimit, true);
});

test('CR characters inside ordinary literals and block comments do not expose their contents', async () => {
  for (const name of ['postgres', 'mysql', 'mssql']) {
    const { service, calls } = fixture(name);
    for (const sql of [
      "SELECT '-- comment\rFROM private.orders LIMIT 9' FROM public.orders",
      'SELECT 1 /* comment\rFROM private.orders LIMIT 9 */ FROM public.orders',
    ]) {
      assert.equal((await service.runSelect(sql)).isError, false);
      assert.equal(calls.at(-1).sql, name === 'mssql' ? sql : `${sql}\nLIMIT 7`);
    }
  }
});

test('dollar quoting remains PostgreSQL-only', () => {
  for (const name of ['mysql', 'mssql']) {
    const dialect = getDialect(name);
    const sql = 'SELECT $한글$ FROM private.orders $한글$';
    assert.equal(maskLiterals(sql, dialect, true), sql);
    assert.throws(() => assertSqlSchemaAccess(sql, ['public'], dialect), SchemaPolicyError);
  }
});
