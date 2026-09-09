import assert from 'node:assert/strict';
import net from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
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
  const service = new ToolService({ async runReadOnly(sql, params) {
    calls.push({ sql, params });
    return { fields: ['value'], rows: [{ value: 1 }], rowCount: 1, elapsedMs: 0 };
  } }, {}, {
    dialect: name, ssl: false, sslMode: 'disable', allowedSchemas: ['public'],
    maxRows: 7, maxCellChars: 2000, statementTimeoutMs: 5000,
  }, dialect);
  return { dialect, calls, service };
}

// MySQL sql_lex.cc tests my_isspace/my_iscntrl on the next byte, not Unicode
// whitespace. UTF-8's non-ASCII leading bytes have neither classification.
for (const code of [0x00a0, 0x1680, 0x2003, 0x2028, 0x2029, 0x3000, 0xfeff]) {
  test(`mysql: U+${code.toString(16)} after -- cannot conceal a relation`, async () => {
    const ch = String.fromCharCode(code);
    const { dialect, calls, service } = fixture('mysql');
    const denied = `SELECT 1--${ch}x FROM private.orders`;
    assert.equal(maskLiterals(denied, dialect), denied);
    assert.throws(() => assertSqlSchemaAccess(denied, ['public'], dialect), SchemaPolicyError);
    assert.equal((await service.runSelect(denied)).isError, true);
    assert.equal(calls.length, 0);

    // Once no longer hidden as a comment, this non-ASCII identifier is outside
    // the schema policy's supported identifier subset even in a public query.
    assert.equal((await service.runSelect(`SELECT 1--${ch}x FROM public.orders`)).isError, true);
    assert.equal(calls.length, 0);
    const allowed = `SELECT '${ch}' FROM public.orders`;
    assert.equal((await service.runSelect(allowed)).isError, false);
    assert.equal(calls[0].sql, `${allowed}\nLIMIT 7`);
  });
}

test('mysql: ASCII control/space starts -- comments; comment LIMIT never suppresses the cap', async () => {
  const { dialect, calls, service } = fixture('mysql');
  const codes = [...Array.from({ length: 32 }, (_, i) => i + 1), 0x7f];
  for (const code of codes) {
    const ch = String.fromCharCode(code);
    // LF itself ends the comment, so put an ordinary character before the LF
    // control case below rather than treating its following text as a comment.
    if (ch === '\n') continue;
    const harmless = `SELECT 1--${ch} FROM private.orders`;
    assert.equal((await service.runSelect(harmless)).isError, false, `control ${code}`);
    assert.equal(calls.at(-1).sql, `${harmless}\nLIMIT 7`);
    const sql = `SELECT * FROM public.orders--${ch} LIMIT 900`;
    assert.equal(assertReadOnlySelect(sql, dialect).hasLimit, false, `control ${code}`);
    assert.equal((await service.runSelect(sql)).isError, false);
    assert.equal(calls.at(-1).sql, `${sql}\nLIMIT 7`);
  }
});

test('mysql: LF/CRLF end control comments while bare CR remains inside', async () => {
  const { calls, service } = fixture('mysql');
  for (const ch of ['\x01', '\x1f', '\x7f', ' ']) {
    for (const end of ['\n', '\r\n']) {
      const sql = `SELECT 1--${ch} hidden${end}FROM private.orders`;
      assert.equal((await service.runSelect(sql)).isError, true);
    }
    const sql = `SELECT 1--${ch} hidden\rFROM private.orders`;
    assert.equal((await service.runSelect(sql)).isError, false);
    assert.equal(calls.at(-1).sql, `${sql}\nLIMIT 7`);
  }
  const before = calls.length;
  assert.equal((await service.runSelect('SELECT 1--\nFROM private.orders')).isError, true);
  assert.equal(calls.length, before);
});

test('mysql: EOF after -- is a comment and ordinary dash arithmetic stays visible', async () => {
  const { dialect, calls, service } = fixture('mysql');
  const sql = 'SELECT * FROM public.orders--';
  assert.equal(maskLiterals(sql, dialect), 'SELECT * FROM public.orders  ');
  assert.equal((await service.runSelect(sql)).isError, false);
  assert.equal(calls[0].sql, `${sql}\nLIMIT 7`);
  for (const sql of ['SELECT 1--x FROM private.orders', 'SELECT 1--1 FROM private.orders']) {
    assert.equal(maskLiterals(sql, dialect), sql);
    assert.equal((await service.runSelect(sql)).isError, true);
  }
  assert.equal(calls.length, 1);
});

test('mysql: embedded NUL in SQL text is unsupported, including inside comments or literals', async () => {
  const { dialect, calls, service } = fixture('mysql');
  for (const sql of ['SELECT 1\0', 'SELECT 1--\0 FROM private.orders', "SELECT '\0'", 'SELECT `a\0b`']) {
    assert.throws(() => maskLiterals(sql, dialect), SqlGuardError);
    assert.throws(() => assertSqlSchemaAccess(sql, ['public'], dialect), SchemaPolicyError);
    assert.equal((await service.runSelect(sql)).isError, true);
  }
  assert.equal(calls.length, 0);
  assert.equal((await service.runSelect('SELECT ?', ['\0'])).isError, false);
  assert.deepEqual(calls[0].params, ['\0']);
});

for (const name of ['postgres', 'mysql', 'mssql']) {
  for (const suffix of ['é', '한']) {
    test(`${name}: an ASCII CTE prefix cannot exempt the physical schema seed${suffix}`, async () => {
      const { calls, service } = fixture(name);
      const sql = `WITH seed AS (SELECT 1) SELECT * FROM seed${suffix}.orders`;
      const response = await service.runSelect(sql);
      assert.equal(calls.length, 0);
      assert.equal(response.isError, true);
      for (const sql of [
        `SELECT ${suffix}public.safe_function() FROM public.orders`,
        `SELECT * FROM public.${suffix}orders`,
        `WITH seed${suffix} AS (SELECT 1) SELECT * FROM seed${suffix}`,
      ]) assert.equal((await service.runSelect(sql)).isError, true, sql);
      assert.equal(calls.length, 0);
      // Reading complete tokens is not a new ban on Unicode column expressions.
      assert.equal((await service.runSelect(`SELECT column${suffix} FROM public.orders`)).isError, false);
    });
  }
}

for (const name of ['postgres', 'mysql']) {
  test(`${name}: normalization never strips Unicode from query or relation boundaries`, async () => {
    const { calls, service } = fixture(name);
    for (const sql of [
      'SELECT * FROM public.orders\u00a0',
      '\u00a0SELECT * FROM public.orders',
      'SELECT * FROM public.orders\u00a0;',
      'SELECT * FROM public.orders;\u00a0',
      'SELECT * FROM public.orders;\u00a0; \t',
      ' \tSELECT * FROM public.orders\u00a0;\r\n',
    ]) {
      const response = await service.runSelect(sql);
      assert.equal(calls.length, 0, JSON.stringify(sql));
      assert.equal(response.isError, true);
    }
    const sql = ' \t\r\n\f\vSELECT * FROM public.orders \t; \r\n;\f\v';
    assert.equal((await service.runSelect(sql)).isError, false);
    assert.equal(calls[0].sql, 'SELECT * FROM public.orders\nLIMIT 7');
  });

  test(`${name}: Unicode whitespace must not shorten an unquoted schema name`, async () => {
    const { dialect, calls, service } = fixture(name);
    for (const ch of ['\u00a0', '\u1680', '\u2003', '\u2028', '\u3000', '\ufeff']) {
      for (const schema of [`public${ch}`, `${ch}public`, `public${ch}x`]) {
        const sql = `SELECT * FROM ${schema}.orders`;
        assert.throws(() => assertSqlSchemaAccess(sql, ['public'], dialect), SchemaPolicyError);
        assert.equal((await service.runSelect(sql)).isError, true);
      }
    }
    assert.equal(calls.length, 0);
    for (const ch of [' ', '\t', '\n', '\r', '\f', '\v']) {
      const sql = `SELECT * FROM public${ch}.${ch}orders`;
      assert.equal((await service.runSelect(sql)).isError, false);
      assert.equal(calls.at(-1).sql, `${sql}\nLIMIT 7`);
    }
  });

  test(`${name}: Unicode relation boundaries do not leak CTE names or function schemas`, async () => {
    const { calls, service } = fixture(name);
    for (const sql of [
      'WITH seed AS (SELECT * FROM public.orders) SELECT * FROM \u00a0seed',
      'WITH seed AS (SELECT * FROM public.orders) SELECT * FROM seed\u00a0.orders',
      'SELECT public\u00a0.safe_function() FROM public.orders',
      'SELECT * FROM public.\u00a0orders',
    ]) assert.equal((await service.runSelect(sql)).isError, true, sql);
    assert.equal(calls.length, 0);
  });

  test(`${name}: Unicode in literals/comments stays opaque and mask offsets are preserved`, async () => {
    const { dialect, calls, service } = fixture(name);
    const sql = "SELECT '\u00a0 FROM private.orders LIMIT 100' /*\u3000 FROM private.orders */ FROM public.orders";
    const masked = maskLiterals(sql, dialect);
    assert.equal(masked.length, sql.length);
    assert.equal(masked.indexOf('FROM public.orders'), sql.indexOf('FROM public.orders'));
    assert.equal(masked.includes('private'), false);
    assert.equal((await service.runSelect(sql)).isError, false);
    assert.equal(calls[0].sql, `${sql}\nLIMIT 7`);
    if (name === 'postgres') {
      const dollar = 'SELECT $한\u00a0글$ FROM private.orders LIMIT 100 $한\u00a0글$ FROM public.orders';
      assert.equal((await service.runSelect(dollar)).isError, false);
      assert.equal(calls.at(-1).sql, `${dollar}\nLIMIT 7`);
    }
  });
}

test('MSSQL whitespace and PostgreSQL/SQL Server unconditional -- behavior remain unchanged', async () => {
  for (const name of ['postgres', 'mssql']) {
    const { calls, service } = fixture(name);
    for (const ch of ['\u00a0', '\x01', '\x7f']) {
      const sql = `SELECT 1--${ch} FROM private.orders`;
      assert.equal((await service.runSelect(sql)).isError, false);
      assert.equal(calls.at(-1).sql, name === 'mssql' ? sql : `${sql}\nLIMIT 7`);
    }
  }
  const { service, calls } = fixture('mssql');
  assert.equal((await service.runSelect('SELECT * FROM public\u00a0.orders')).isError, false);
  assert.equal((await service.runSelect('\u00a0SELECT * FROM public.orders;\u00a0')).isError, false);
  assert.equal(calls.at(-1).sql, 'SELECT * FROM public.orders');
});

test('mysql2 defaults to UTF-8 and transmits NBSP/control/NUL query bytes without dropping them', async () => {
  const require = createRequire(import.meta.url);
  const mysql = require('mysql2/promise');
  const packageRoot = new URL('../node_modules/mysql2/', import.meta.url);
  const PrepareStatement = require(fileURLToPath(new URL('lib/packets/prepare_statement.js', packageRoot)));
  const encodings = require(fileURLToPath(new URL('lib/constants/charset_encodings.js', packageRoot)));
  const pool = mysql.createPool({ host: 'synthetic.invalid', user: 'synthetic', database: 'public' });
  try {
    const charset = pool.pool.config.connectionConfig.charsetNumber;
    assert.equal(charset, 224);
    assert.equal(encodings[charset], 'utf8');
    for (const ch of ['\u00a0', '\u3000', '\x01', '\x7f', '\0']) {
      const sql = `SELECT 1--${ch} FROM public.orders`;
      const packet = new PrepareStatement(sql, charset).toPacket();
      assert.equal(packet.buffer.subarray(5, packet.end).toString('utf8'), sql);
    }
  } finally { await pool.end(); }
});
