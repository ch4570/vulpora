'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveRoute, checkAgentSettings, verifyObservedRoute, readAgentSettings } = require('./model-router.js');
const policySource = require('../skills/start-task/scripts/model-routing-policy.json');
const { regularFile } = require('../skills/start-task/scripts/model-routing-io.js');
function fixture(runtime = 'codex') {
  const policy = structuredClone(policySource);
  const catalog = { schema: 'vulpora.runtime-model-catalog/v1', runtime, source: 'synthetic:test',
    observedAt: new Date().toISOString(), models: Object.values(policy.runtimes[runtime]).flat()
      .map(id => ({ id, reasoningEfforts: ['low', 'medium', 'high'] })) };
  const request = { runtime, profile: 'standard', risk: 'low', kind: 'native-subagent',
    maxRelativeUnits: 30, estimatedTokens: 2000, remainingTokens: 6000 };
  return { policy, catalog, request };
}
const resolve = f => resolveRoute(f.request, f.catalog, f.policy);
function tempConfig(t, text, extension = 'toml') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-router-config-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, `agent.${extension}`);
  fs.writeFileSync(file, text);
  return file;
}
function codexConfig(metadata = [], body = ['Follow the scoped task.'], after = []) {
  // Installed adapters use literal multiline strings; source adapters use
  // basic multiline strings. Neither body's examples are configuration.
  return ['name = "synthetic-reviewer"', 'description = "Synthetic routing fixture"', ...metadata,
    'approval_policy = "never"', 'sandbox_mode = "read-only"', 'developer_instructions = ' + "'''",
    ...body, "'''", ...after, ''].join('\n');
}
function claudeConfig(metadata = [], body = ['Follow the scoped task.']) {
  return ['---', 'name: synthetic-reviewer', 'description: Synthetic routing fixture', ...metadata,
    '---', ...body, ''].join('\n');
}
function routeCli(t, runtime, extra = [], envOverrides = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-router-cli-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const catalog = path.join(dir, 'catalog.json');
  fs.writeFileSync(catalog, JSON.stringify(fixture(runtime).catalog));
  const env = { ...process.env };
  delete env.CLAUDE_CODE_SUBAGENT_MODEL; delete env.CLAUDE_CODE_EFFORT_LEVEL;
  return spawnSync(process.execPath, [path.join(__dirname, 'model-router.js'),
    '--runtime', runtime, '--profile', 'standard', '--catalog', catalog, ...extra],
  { encoding: 'utf8', env: { ...env, ...envOverrides } });
}
for (const runtime of ['codex', 'claude-code']) for (const [profile, index] of ['frugal', 'standard', 'frontier'].map((p, i) => [p, i])) {
  test(`${runtime}/${profile} selects exact exposed route and effort`, () => {
    const f = fixture(runtime); f.request.profile = profile;
    const route = resolve(f);
    assert.equal(route.model, f.policy.runtimes[runtime][profile][0]);
    assert.equal(route.reasoning_effort, ['low', 'medium', 'high'][index]);
    assert.equal(route.inheritanceUsed, false); assert.equal(route.execution, 'NOT_RUN');
    if (runtime === 'codex') assert.equal(route.nativeArguments.fork_turns, 'none');
    else assert.deepEqual(Object.keys(route.nativeArguments), ['model']);
  });
}
test('high risk has a frontier floor, while insufficient budget blocks it', () => {
  const f = fixture(); f.request.profile = 'frugal'; f.request.risk = 'high';
  assert.equal(resolve(f).profile, 'frontier');
  f.request.maxRelativeUnits = 1; assert.throws(() => resolve(f), /BUDGET_EXCEEDED/);
});
test('deterministic checks need no catalog and allocate no model', () => {
  const f = fixture(); f.request.kind = 'deterministic'; f.catalog = null;
  const route = resolve(f); assert.equal(route.status, 'NO_MODEL'); assert.equal(route.relativeUnits, 0);
});
const failures = [
  ['no more expensive fallback', f => { f.catalog.models = f.catalog.models.filter(m => !m.id.includes('terra')); }, /ROUTE_UNAVAILABLE/],
  ['effort mismatch', f => { f.catalog.models.forEach(m => { m.reasoningEfforts = ['low']; }); }, /ROUTE_UNAVAILABLE/],
  ['stale catalog', f => { f.catalog.observedAt = '2020-01-01T00:00:00.000Z'; }, /STALE_CATALOG/],
  ['future catalog', f => { f.catalog.observedAt = '2999-01-01T00:00:00.000Z'; }, /STALE_CATALOG/],
  ['provider copy', f => { f.catalog.runtime = 'claude-code'; }, /CATALOG_RUNTIME_MISMATCH/],
  ['empty catalog', f => { f.catalog.models = []; }, /EMPTY_CATALOG/],
  ['duplicate model', f => { f.catalog.models.push(f.catalog.models[0]); }, /DUPLICATE_MODEL/],
  ['unsupported tier', f => { f.request.profile = 'cheapest'; }, /INVALID_REQUEST/],
  ['token exhaustion', f => { f.request.remainingTokens = 10; }, /BUDGET_EXCEEDED/],
  ['negative estimate', f => { f.request.estimatedTokens = -1; }, /INVALID_BUDGET/],
  ['missing estimate', f => { delete f.request.estimatedTokens; }, /INVALID_FIELDS/],
  ['NaN budget', f => { f.request.maxRelativeUnits = NaN; }, /INVALID_BUDGET/],
  ['unknown policy key', f => { f.policy.ignoreBudgets = true; }, /INVALID_FIELDS/],
  ['inherited model', f => { f.policy.runtimes.codex.standard = ['inherit']; }, /INVALID_IDENTIFIER/],
  ['unsafe model id', f => { f.policy.runtimes.codex.standard = ['model"; echo injected']; }, /INVALID_IDENTIFIER/]
];
for (const [name, mutate, expected] of failures) test('rejects ' + name, () => {
  const f = fixture(); mutate(f); assert.throws(() => resolve(f), expected);
});
test('operator-defined model policy works without guessing a provider/model alias', () => {
  const f = fixture(); f.policy.runtimes.codex.standard = ['deployment/review-v2'];
  f.catalog.models.push({ id: 'deployment/review-v2', reasoningEfforts: ['medium'] });
  assert.equal(resolve(f).model, 'deployment/review-v2');
});
test('conflicting Codex file model or effort blocks dispatch', () => {
  const route = resolve(fixture());
  assert.throws(() => checkAgentSettings(route, { model: 'gpt-5.4-mini' }), /AGENT_CONFIG_OVERRIDES_ROUTE/);
  assert.throws(() => checkAgentSettings(route, { model_reasoning_effort: 'high' }), /AGENT_CONFIG_OVERRIDES_ROUTE/);
  assert.equal(checkAgentSettings(route, route.agentFileSettings), true);
});
test('observations must be independent of spawn arguments and exactly match', () => {
  const route = resolve(fixture());
  const observed = { runtime: route.runtime, model: route.model, reasoning_effort: route.reasoning_effort, source: 'runtime-event' };
  assert.equal(verifyObservedRoute(route, observed).status, 'MATCHED');
  assert.throws(() => verifyObservedRoute(route, { ...observed, source: 'spawn-arguments' }), /UNOBSERVED_ROUTE/);
  assert.throws(() => verifyObservedRoute(route, { ...observed, model: 'other-backend-model' }), /RUNTIME_ROUTE_MISMATCH/);
  assert.throws(() => verifyObservedRoute(route, { ...observed, reasoning_effort: null }), /RUNTIME_ROUTE_MISMATCH/);
});
test('CLI connects exact route through public entrypoint and fails absent catalog', t => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-router-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const catalog = path.join(dir, 'catalog.json'); fs.writeFileSync(catalog, JSON.stringify(fixture().catalog));
  const cli = path.join(__dirname, '..', 'vulpora');
  const run = spawnSync('bash', [cli, 'route', '--runtime', 'codex', '--profile', 'standard', '--catalog', catalog], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).model, 'gpt-5.6-terra');
  const missing = spawnSync('bash', [cli, 'route', '--runtime', 'codex', '--profile', 'standard'], { encoding: 'utf8' });
  assert.equal(missing.status, 2); assert.match(missing.stderr, /CATALOG_REQUIRED/);
});

test('unrelated exposed models without reasoning do not poison a supported route', () => {
  const f = fixture();
  // model/list explicitly permits this shape; discovery already has a passing
  // no-reasoning fixture. The selected model still advertises medium effort.
  f.catalog.models.push({ id: 'unrelated-non-reasoning-model', reasoningEfforts: [] });
  assert.equal(resolve(f).model, f.policy.runtimes.codex.standard[0]);
});
test('unrelated runtime effort capabilities do not invalidate a known exact match', () => {
  const f = fixture();
  f.catalog.models.push({ id: 'unrelated-runtime-capability', reasoningEfforts: ['none'] });
  assert.equal(resolve(f).model, f.policy.runtimes.codex.standard[0]);
});
test('invalid injected clocks cannot bypass catalog freshness checks', () => {
  const f = fixture(); f.catalog.observedAt = '2020-01-01T00:00:00.000Z';
  for (const now of [NaN, Infinity, -Infinity, 'not-a-clock', null]) {
    assert.throws(() => resolveRoute(f.request, f.catalog, f.policy, now),
      /INVALID_|STALE_CATALOG/, `invalid now=${String(now)} must fail closed`);
  }
});
test('deterministic verification remains available after model budget is exhausted', () => {
  const f = fixture();
  Object.assign(f.request, { kind: 'deterministic', maxRelativeUnits: 0, estimatedTokens: 0, remainingTokens: 0 });
  const route = resolveRoute(f.request, null, f.policy);
  assert.equal(route.status, 'NO_MODEL');
  assert.equal(route.relativeUnits, 0); assert.equal(route.estimatedTokens, 0);
});
test('null model identities cannot become observed runtime evidence', () => {
  const route = resolve(fixture());
  const malformed = { ...route, model: null, reasoning_effort: null };
  assert.throws(() => verifyObservedRoute(malformed, {
    runtime: route.runtime, model: null, reasoning_effort: null, source: 'runtime-event'
  }), /INVALID_|UNOBSERVED_|MISMATCH/);
});
test('config compatibility checks reject missing and NO_MODEL route contracts', () => {
  assert.throws(() => checkAgentSettings({}, {}), /INVALID_/);
  const route = { schema: 'vulpora.model-route/v1', status: 'NO_MODEL', runtime: 'codex', model: null, reasoning_effort: null };
  assert.throws(() => checkAgentSettings(route, {}), /INVALID_/);
});
test('CLI rejects duplicate JSON budget declarations instead of last-write-wins', t => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-router-duplicate-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = fixture();
  const catalog = path.join(dir, 'catalog.json');
  const policy = path.join(dir, 'policy.json');
  fs.writeFileSync(catalog, JSON.stringify(f.catalog));
  // The last value is valid, so schema validation after ordinary JSON.parse
  // would silently hide the contradictory budget visible to a reviewer.
  fs.writeFileSync(policy, JSON.stringify(f.policy).replace('"relativeUnits":10', '"relativeUnits":999,"relativeUnits":10'));
  const result = spawnSync(process.execPath, [path.join(__dirname, 'model-router.js'),
    '--runtime', 'codex', '--profile', 'standard', '--catalog', catalog, '--policy', policy], { encoding: 'utf8' });
  assert.equal(result.status, 2, result.stdout);
  assert.equal(result.stdout, ''); assert.match(result.stderr, /BLOCKED/);
});
test('CLI rejects duplicate catalog identities instead of silently choosing the last', t => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-router-catalog-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const catalog = path.join(dir, 'catalog.json');
  fs.writeFileSync(catalog, JSON.stringify(fixture().catalog).replace('"runtime":"codex"', '"runtime":"claude-code","runtime":"codex"'));
  const result = spawnSync(process.execPath, [path.join(__dirname, 'model-router.js'),
    '--runtime', 'codex', '--profile', 'standard', '--catalog', catalog], { encoding: 'utf8' });
  assert.equal(result.status, 2, result.stdout);
  assert.equal(result.stdout, ''); assert.match(result.stderr, /BLOCKED/);
});

test('policy/catalog file IO refuses symlinks and oversized data', t => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-router-file-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'policy.json'); fs.writeFileSync(file, '{}');
  assert.equal(regularFile(file, 2).toString(), '{}');
  assert.throws(() => regularFile(file, 1), /INVALID_FILE/);
  const link = path.join(dir, 'linked.json'); fs.symlinkSync(file, link);
  assert.throws(() => regularFile(link, 2), /SYMLINK_INPUT/);
  const parent = path.join(dir, 'linked-parent'); fs.symlinkSync(dir, parent, 'dir');
  assert.throws(() => regularFile(path.join(parent, 'policy.json'), 2), /SYMLINK_INPUT/);
});
test('ancestor replacement between preflight and open cannot redirect a policy read', t => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-router-race-')));
  const parent = path.join(dir, 'operator-policy');
  const displaced = path.join(dir, 'original-policy');
  const other = path.join(dir, 'untrusted-policy');
  fs.mkdirSync(parent); fs.mkdirSync(other);
  const target = path.join(parent, 'policy.json');
  fs.writeFileSync(target, '{"source":"operator"}');
  fs.writeFileSync(path.join(other, 'policy.json'), '{"source":"untrusted"}');
  const originalOpen = fs.openSync;
  t.after(() => { fs.openSync = originalOpen; fs.rmSync(dir, { recursive: true, force: true }); });
  let swapped = false;
  // Inject a deterministic filesystem race, confined to this temporary tree.
  // O_NOFOLLOW protects the final filename but not a changed ancestor.
  fs.openSync = function(filename, ...args) {
    if (!swapped && filename === target) {
      swapped = true;
      fs.renameSync(parent, displaced); fs.symlinkSync(other, parent, 'dir');
    }
    return originalOpen.call(fs, filename, ...args);
  };
  assert.throws(() => regularFile(target, 1024), /SYMLINK_|FILE_CHANGED|UNSAFE_|INVALID_/);
  assert.equal(swapped, true, 'the test must reach the vulnerable open boundary');
});

test('installed neutral Codex adapters ignore instruction examples and table-scoped model keys', t => {
  const file = tempConfig(t, codexConfig([], [
    'Example configuration, not agent settings:', 'model = "untrusted-example"',
    'model_reasoning_effort = "ultra"'
  ], ['[history]', 'persistence = "none"', 'model = "table-scoped-example"']));
  const parsed = readAgentSettings(file, 'codex');
  assert.deepEqual(parsed.settings, {});
  assert.match(parsed.sha256, /^[a-f0-9]{64}$/);
  assert.equal(checkAgentSettings(resolve(fixture()), parsed.settings), true);
});
test('installed matching Codex model and effort pass the supplied-file preflight', t => {
  const route = resolve(fixture());
  const file = tempConfig(t, codexConfig([
    `model = "${route.model}"`, `model_reasoning_effort = "${route.reasoning_effort}"`
  ]));
  const parsed = readAgentSettings(file, 'codex');
  assert.deepEqual(parsed.settings, route.agentFileSettings);
  assert.equal(checkAgentSettings(route, parsed.settings), true);
});
for (const [key, value] of [['model', 'untrusted-override'], ['model_reasoning_effort', 'high']]) {
  test(`Codex top-level ${key} after instructions cannot evade preflight`, t => {
    const file = tempConfig(t, codexConfig([], ['Instructions.'], [`${key} = "${value}"`]));
    const parsed = readAgentSettings(file, 'codex');
    assert.equal(parsed.settings[key], value);
    assert.throws(() => checkAgentSettings(resolve(fixture()), parsed.settings), /AGENT_CONFIG_OVERRIDES_ROUTE/);
  });
  test(`duplicate Codex ${key} across the instruction body fails closed`, t => {
    const file = tempConfig(t, codexConfig([`${key} = "${value}"`], ['Instructions.'], [`${key} = "${value}"`]));
    assert.throws(() => readAgentSettings(file, 'codex'), /UNSUPPORTED_AGENT_CONFIG/);
  });
  test(`quoted Codex ${key} is rejected rather than silently omitted`, t => {
    const file = tempConfig(t, codexConfig([], ['Instructions.'], [`"${key}" = "${value}"`]));
    assert.throws(() => readAgentSettings(file, 'codex'), /UNSUPPORTED_AGENT_CONFIG/);
  });
}
test('source-style Codex multiline instructions are parsed without reading embedded overrides', t => {
  const file = tempConfig(t, codexConfig([], ['model = "example-only"']).replaceAll("'''", '"""'));
  assert.deepEqual(readAgentSettings(file, 'codex').settings, {});
});
test('unterminated or duplicate Codex instruction strings fail closed', t => {
  for (const contents of [codexConfig().replace(/'''\n$/, ''), codexConfig() + "developer_instructions = '''\nagain\n'''\n"]) {
    assert.throws(() => readAgentSettings(tempConfig(t, contents), 'codex'), /UNSUPPORTED_AGENT_CONFIG/);
  }
});
test('Claude frontmatter parses model/effort scalars and ignores Markdown examples', t => {
  const route = resolve(fixture('claude-code'));
  for (const quote of ['', '"', "'"]) {
    const file = tempConfig(t, claudeConfig([
      `model: ${quote}${route.model}${quote}`, `effort: ${quote}${route.reasoning_effort}${quote}`
    ], ['effort: ultra', 'model: example-only']), 'md');
    const parsed = readAgentSettings(file, 'claude-code');
    assert.deepEqual(parsed.settings, { model: route.model, effort: route.reasoning_effort });
    assert.equal(checkAgentSettings(route, parsed.settings), true);
  }
});
test('Claude frontmatter supports generated folded descriptions without parsing nested example keys', t => {
  const file = tempConfig(t, ['---', 'name: synthetic-reviewer', 'description: >',
    '  Review the scoped task.', '  model: description-only', 'model: sonnet', 'effort: medium',
    'metadata:', '  effort: nested-example', '---', 'effort: body-example', ''].join('\n'), 'md');
  assert.deepEqual(readAgentSettings(file, 'claude-code').settings, { model: 'sonnet', effort: 'medium' });
});
for (const [key, value] of [['model', 'sonnet'], ['effort', 'medium']]) {
  test(`duplicate or quoted Claude ${key} declarations fail closed`, t => {
    for (const metadata of [[`${key}: ${value}`, `${key}: ${value}`], [`"${key}": ${value}`]]) {
      const file = tempConfig(t, claudeConfig(metadata), 'md');
      assert.throws(() => readAgentSettings(file, 'claude-code'), /UNSUPPORTED_AGENT_CONFIG/);
    }
  });
}
test('malformed or unterminated Claude frontmatter cannot count as checked', t => {
  for (const contents of ['effort: medium\n', '---\neffort: medium\n', claudeConfig(['effort: [medium]'])]) {
    assert.throws(() => readAgentSettings(tempConfig(t, contents, 'md'), 'claude-code'), /UNSUPPORTED_AGENT_CONFIG/);
  }
});
test('Claude explicit native model overrides frontmatter but effort must be configured', () => {
  const route = resolve(fixture('claude-code'));
  assert.equal(checkAgentSettings(route, { model: 'opus', effort: 'medium' }), true);
  assert.throws(() => checkAgentSettings(route, { model: route.model }), /AGENT_EFFORT_NOT_CONFIGURED/);
  assert.throws(() => checkAgentSettings(route, { effort: 'high' }), /AGENT_EFFORT_NOT_CONFIGURED/);
});
test('Claude environment model or effort conflicts block even with matching file settings', () => {
  const route = resolve(fixture('claude-code'));
  const settings = { model: route.model, effort: route.reasoning_effort };
  for (const env of [{ CLAUDE_CODE_SUBAGENT_MODEL: 'opus' }, { CLAUDE_CODE_EFFORT_LEVEL: 'high' },
    { CLAUDE_CODE_SUBAGENT_MODEL: 'inherit' }, { CLAUDE_CODE_EFFORT_LEVEL: 'auto' }]) {
    assert.throws(() => checkAgentSettings(route, settings, env), /ENV_OVERRIDES_ROUTE/);
  }
});
test('matching Claude environment effort can supply missing or overridden file effort', () => {
  const route = resolve(fixture('claude-code'));
  const env = { CLAUDE_CODE_SUBAGENT_MODEL: route.model, CLAUDE_CODE_EFFORT_LEVEL: route.reasoning_effort };
  assert.equal(checkAgentSettings(route, {}, env), true);
  assert.equal(checkAgentSettings(route, { effort: 'high' }, env), true);
  assert.throws(() => checkAgentSettings(route, {}, { CLAUDE_CODE_SUBAGENT_MODEL: route.model }), /AGENT_EFFORT_NOT_CONFIGURED/);
});
test('CLI absent agent config remains NOT_CHECKED and never claims execution', t => {
  const result = routeCli(t, 'codex');
  assert.equal(result.status, 0, result.stderr);
  const route = JSON.parse(result.stdout);
  assert.deepEqual(route.preflight, { status: 'NOT_CHECKED' });
  assert.equal(route.execution, 'NOT_RUN');
});
test('CLI explicit neutral agent config records its digest without claiming host attestation', t => {
  const file = tempConfig(t, codexConfig());
  const result = routeCli(t, 'codex', ['--agent-config', file]);
  assert.equal(result.status, 0, result.stderr);
  const route = JSON.parse(result.stdout);
  assert.equal(route.preflight.status, 'CONFIG_CHECKED');
  assert.equal(route.preflight.agentConfigSha256, readAgentSettings(file, 'codex').sha256);
  assert.match(route.preflight.scope, /not-live-host-attestation/);
  assert.equal(route.execution, 'NOT_RUN');
});
test('CLI explicit no-custom-config differs from an unchecked Codex config', t => {
  const result = routeCli(t, 'codex', ['--agent-config', 'none']);
  assert.equal(result.status, 0, result.stderr);
  const route = JSON.parse(result.stdout);
  assert.equal(route.preflight.status, 'CONFIG_CHECKED');
  assert.equal(route.preflight.agentConfigSha256, null);
  assert.equal(route.execution, 'NOT_RUN');
});
test('CLI config conflicts fail without emitting a successful route', t => {
  const file = tempConfig(t, codexConfig(['model = "untrusted-override"']));
  const result = routeCli(t, 'codex', ['--agent-config', file]);
  assert.equal(result.status, 2, result.stdout); assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).reason, 'AGENT_CONFIG_OVERRIDES_ROUTE');
});
test('CLI Claude checks actual process overrides as well as supplied frontmatter', t => {
  const file = tempConfig(t, claudeConfig(['model: sonnet', 'effort: medium']), 'md');
  const checked = routeCli(t, 'claude-code', ['--agent-config', file]);
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).preflight.status, 'CONFIG_CHECKED');
  for (const overrides of [{ CLAUDE_CODE_SUBAGENT_MODEL: 'opus' }, { CLAUDE_CODE_EFFORT_LEVEL: 'high' }]) {
    const blocked = routeCli(t, 'claude-code', ['--agent-config', file], overrides);
    assert.equal(blocked.status, 2, blocked.stdout); assert.equal(blocked.stdout, '');
    assert.equal(JSON.parse(blocked.stderr).reason, 'ENV_OVERRIDES_ROUTE');
  }
});
test('CLI Claude no-custom-config needs a matching explicit effort environment', t => {
  const missing = routeCli(t, 'claude-code', ['--agent-config', 'none']);
  assert.equal(missing.status, 2, missing.stdout); assert.equal(missing.stdout, '');
  assert.equal(JSON.parse(missing.stderr).reason, 'AGENT_EFFORT_NOT_CONFIGURED');
  const checked = routeCli(t, 'claude-code', ['--agent-config', 'none'], { CLAUDE_CODE_EFFORT_LEVEL: 'medium' });
  assert.equal(checked.status, 0, checked.stderr);
  const route = JSON.parse(checked.stdout);
  assert.equal(route.preflight.status, 'CONFIG_CHECKED');
  assert.equal(route.preflight.agentConfigSha256, null);
  assert.equal(route.execution, 'NOT_RUN');
});
