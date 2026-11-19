import assert from 'node:assert/strict';
import test from 'node:test';

import { getDialect } from '../dist/dialect.js';
import { ToolService } from '../dist/tool-service.js';

for (const dialect of ['postgres', 'mysql']) {
  test(`${dialect}: run_select caps the outer query before the driver and preserves bindings`, async () => {
    const calls = [];
    const db = {
      async runReadOnly(sql, params) {
        calls.push({ sql, params });
        return { fields: ['id'], rows: [{ id: 1 }], rowCount: 1, elapsedMs: 0 };
      },
    };
    const service = new ToolService(db, {}, {
      dialect, ssl: false, sslMode: 'disable', maxRows: 7,
      statementTimeoutMs: 5000, allowedSchemas: ['public'], maxCellChars: 2000,
    }, getDialect(dialect));
    const placeholder = dialect === 'postgres' ? '$1' : '?';
    const params = [19];
    for (const sql of [
      `WITH small AS (SELECT id FROM public.users LIMIT 1) SELECT * FROM public.orders WHERE id = ${placeholder}`,
      `SELECT * FROM public.orders WHERE id = ${placeholder} AND EXISTS (SELECT id FROM public.users LIMIT 1)`,
      `SELECT order$limit FROM public.orders WHERE id = ${placeholder}`,
      `SELECT top(5) FROM public.orders WHERE id = ${placeholder}`,
      ...(dialect === 'mysql' ? [`SELECT $limit, 123limit, @limit FROM public.orders WHERE id = ${placeholder}`] : []),
    ]) {
      const result = await service.runSelect(sql, params);
      assert.equal(result.isError, false, result.content[0].text);
      assert.deepEqual(calls.at(-1), { sql: `${sql}\nLIMIT 7`, params });
    }
    const explicit = `SELECT * FROM public.orders WHERE id = ${placeholder} LIMIT 1000`;
    assert.equal((await service.runSelect(explicit, params)).isError, false);
    assert.deepEqual(calls.at(-1), { sql: explicit, params });
    const wrapped = `((${explicit}))`;
    assert.equal((await service.runSelect(wrapped, params)).isError, false);
    assert.deepEqual(calls.at(-1), { sql: wrapped, params });

    const before = calls.length;
    const denied = await service.runSelect('SELECT * FROM public.orders WHERE EXISTS (SELECT id FROM private.users LIMIT 1)');
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].text, /\[NLSQL_SCHEMA_DENIED\]/);
    assert.equal(calls.length, before);
  });
}
