import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('result byte configuration uses the example default and validates overrides', () => {
  const example = fileURLToPath(new URL('../nl-sql.config.example.json', import.meta.url));
  const module = new URL('../dist/config.js', import.meta.url).href;
  for (const [value, expected] of [[undefined, 1048576], ['2048', 2048], ['1023', null], ['67108865', null]]) {
    const env = { NLSQL_CONFIG: example, PGHOST: 'synthetic.invalid', NLSQL_ALLOWED_SCHEMAS: 'public' };
    if (value !== undefined) env.NLSQL_MAX_RESULT_BYTES = value;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { loadConfig } from ${JSON.stringify(module)}; try { console.log(loadConfig().maxResultBytes); } catch { process.exitCode = 1; }`,
    ], { env, encoding: 'utf8' });
    assert.equal(result.status, expected === null ? 1 : 0);
    if (expected !== null) assert.equal(result.stdout.trim(), String(expected));
  }
});

test('inbound byte configuration is independently finite and bounded', () => {
  const example = fileURLToPath(new URL('../nl-sql.config.example.json', import.meta.url));
  const module = new URL('../dist/config.js', import.meta.url).href;
  for (const [value, expected] of [[undefined, 4194304], ['2048', 2048], ['0', null], ['33554433', null], ['Infinity', null]]) {
    const env = { NLSQL_CONFIG: example, PGHOST: 'synthetic.invalid', NLSQL_ALLOWED_SCHEMAS: 'public' };
    if (value !== undefined) env.NLSQL_MAX_INBOUND_BYTES = value;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { loadConfig } from ${JSON.stringify(module)}; try { console.log(loadConfig().maxInboundBytes); } catch { process.exitCode = 1; }`,
    ], { env, encoding: 'utf8' });
    assert.equal(result.status, expected === null ? 1 : 0);
    if (expected !== null) assert.equal(result.stdout.trim(), String(expected));
  }
});
