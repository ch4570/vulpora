'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { loadContext, prepareSecurityRuntime, probeIsolation } = require('../adapters/local-adapter-context.cjs');
const { parseUsage } = require('../adapters/provider-usage.cjs');
const { measure, projectMeasurements, retainedMeasurements } = require('../adapters/local-adapter-measurements.cjs');
const { validateResultMeasurements } = require('../adapters/validate-result-measurements.cjs');
const root = path.resolve(__dirname, '../../..');
const jsonl = (...events) => events.map(event => JSON.stringify(event)).join('\n');
const codexUsage = { input_tokens: 100, cached_input_tokens: 70, output_tokens: 20, reasoning_output_tokens: 8 };
const codex = usage => ({ type: 'turn.completed', usage });
const claudeUsage = { input_tokens: 80, cache_read_input_tokens: 10, cache_creation_input_tokens: 5, output_tokens: 20 };
const claude = usage => ({ type: 'result', subtype: 'success', is_error: false, usage, result: 'final response' });
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-adapter-contract-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function write(dir, relative, text) {
  const file = path.join(dir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}
function sourceFixture(t) {
  const dir = temporary(t);
  write(dir, 'install/manifest.txt', 'skill | long-skill | skills/long-skill | - | - | -\nagent | fixture-agent | agents/fixture-agent.md | agents/bundle | - | -\n');
  write(dir, 'skills/long-skill/SKILL.md', '# Long skill\n' + 'full content\n'.repeat(1300) + 'FINAL_SKILL_TAIL\n');
  write(dir, 'agents/fixture-agent.md', '# Agent\nAGENT_TAIL\n');
  write(dir, 'agents/bundle/SOUL.md', 'SOUL_TAIL\n');
  write(dir, 'agents/bundle/reference/principles.md', 'PRINCIPLES_TAIL\n');
  write(dir, 'memory/policies/fixture.md', 'MEMORY_TAIL\n');
  return dir;
}

test('every manifest skill injects its entire UTF-8 entry, including the final tail', () => {
  const rows = fs.readFileSync(path.join(root, 'install/manifest.txt'), 'utf8').split('\n')
    .map(line => line.split('|').map(value => value.trim())).filter(row => row[0] === 'skill');
  assert.ok(rows.length > 0);
  assert.ok(rows.some(row => row[1] === 'security-scan-workflow'));
  for (const [, asset, definition] of rows) {
    const context = loadContext({ root, asset, baseline: 'agent-only', kind: 'skill' });
    const original = fs.readFileSync(path.join(root, definition, 'SKILL.md'));
    assert.ok(original.length > 0, asset);
    assert.ok(context.text.includes(original.toString('utf8')), asset);
    assert.equal(context.metadata.source_kind, 'skill');
    assert.equal(context.metadata.loaded_files.length, 1);
    assert.equal(context.metadata.loaded_files[0].bytes, original.length);
    assert.equal(context.metadata.loaded_files[0].sha256, crypto.createHash('sha256').update(original).digest('hex'));
    assert.equal(context.metadata.runtime_discovery_measured, false);
    assert.match(context.text, /not staged or readable/);
  }
});

test('explicit security profile stages same-release references and canonical auditor for selective INDEX routing', t => {
  const stageRoot = temporary(t);
  const context = loadContext({ root, asset: 'security-scan-workflow', baseline: 'agent-only',
    kind: 'skill', profile: 'security-workflow', stageRoot });
  assert.equal(context.metadata.context_mode, 'staged_security_workflow');
  assert.equal(context.metadata.native_auditor_status, 'not_run_registration_unverified');
  assert.equal(context.metadata.runtime_discovery_measured, false);
  for (const relative of ['skills/security-scan-workflow/reference/principles.md',
    'skills/security-scan-workflow/reference/kb/INDEX.md',
    'skills/security-scan-workflow/reference/kb/reporting.md',
    'agents/security-auditor.md', 'agents/security-auditor/SOUL.md',
    'agents/security-auditor/reference/principles.md',
    'agents/security-auditor/reference/kb/INDEX.md',
    'agents/security-auditor/reference/kb/authentication-authorization.md']) {
    const original = fs.readFileSync(path.join(root, relative));
    assert.deepEqual(fs.readFileSync(path.join(stageRoot, relative)), original, relative);
    assert.ok(!context.text.includes(original.toString('utf8')), relative);
    const file = context.metadata.available_files.find(file => file.path === relative);
    assert.equal(file.sha256, crypto.createHash('sha256').update(original).digest('hex'));
  }
  assert.ok(!context.text.includes('AGENT_RUNTIME_REQUIRED:security-auditor'));
  assert.deepEqual(context.metadata.loaded_files, []);
  const measured = projectMeasurements(measure({ runtime: 'codex', stream: '', prompt: context.text,
    context: context.metadata, invocationFailed: true }));
  assert.deepEqual(measured.context.available_files, context.metadata.available_files);
  for (const change of [
    value => { value.context.native_auditor_status = 'executed'; },
    value => { value.context.available_files[0].path = 'skills/security-scan-workflow/../outside.md'; },
    value => { value.context.available_files.push(value.context.available_files[0]); }
  ]) {
    const invalid = structuredClone(measured); change(invalid);
    assert.throws(() => projectMeasurements(invalid));
  }
  const plain = loadContext({ root, asset: 'security-scan-workflow', baseline: 'plain-runtime', profile: 'security-workflow' });
  assert.equal(plain.text, '');
  assert.deepEqual(plain.metadata.loaded_files, []);
  assert.equal(plain.metadata.context_mode, 'none');
  assert.equal(plain.metadata.native_auditor_status, undefined);
  assert.throws(() => loadContext({ root, asset: 'e2e-scenario-author', baseline: 'agent-only', profile: 'security-workflow' }));
  assert.throws(() => loadContext({ root, asset: 'security-scan-workflow', baseline: 'agent-only', profile: 'typo' }));
});

test('security profile fails closed for incomplete, redirected or symlinked reference bundles', t => {
  const source = temporary(t);
  write(source, 'install/manifest.txt',
    'skill | security-scan-workflow | skills/security-scan-workflow | - | agent:security-auditor | -\n'
    + 'agent | security-auditor | agents/security-auditor.md | agents/security-auditor | - | -\n');
  fs.cpSync(path.join(root, 'skills/security-scan-workflow'), path.join(source, 'skills/security-scan-workflow'), { recursive: true });
  fs.cpSync(path.join(root, 'agents/security-auditor'), path.join(source, 'agents/security-auditor'), { recursive: true });
  write(source, 'agents/security-auditor.md', fs.readFileSync(path.join(root, 'agents/security-auditor.md'), 'utf8'));
  const options = { root: source, asset: 'security-scan-workflow', baseline: 'agent-only', profile: 'security-workflow', stageRoot: temporary(t) };
  const reference = path.join(source, 'agents/security-auditor/reference/kb/INDEX.md');
  fs.rmSync(reference);
  assert.throws(() => loadContext(options));
  fs.symlinkSync(path.join(root, 'agents/security-auditor/reference/kb/INDEX.md'), reference);
  assert.throws(() => loadContext(options), /symlink/);
  fs.rmSync(reference);
  fs.copyFileSync(path.join(root, 'agents/security-auditor/reference/kb/INDEX.md'), reference);
  fs.rmSync(path.join(source, 'agents/security-auditor/reference/kb/authentication-authorization.md'));
  assert.throws(() => loadContext(options), /missing_security_reference/);
  assert.deepEqual(fs.readdirSync(options.stageRoot), []);
});

test('native security configuration binds canonical auditor and restricts parent writes to exact files', t => {
  const stageRoot = fs.realpathSync(temporary(t)), fixtureRoot = fs.realpathSync(temporary(t));
  loadContext({ root, asset: 'security-scan-workflow', baseline: 'agent-only', profile: 'security-workflow', stageRoot });
  write(fixtureRoot, 'src/fix.cjs', 'module.exports = 1;\n');
  write(fixtureRoot, 'test/immutable.cjs', 'immutable test\n');
  const configured = prepareSecurityRuntime({ stageRoot, fixtureRoot, writePaths: ['src/fix.cjs'] });
  const role = fs.readFileSync(configured.roleFile, 'utf8');
  assert.ok(!role.includes('AGENT_RUNTIME_REQUIRED:security-auditor'));
  assert.ok(!role.includes('sandbox_mode'));
  assert.ok(!role.includes('model ='));
  assert.match(role, /default_permissions = "vulpora_security_child_read"/);
  assert.match(role, /name = "security-auditor"/);
  assert.ok(role.includes(path.join(stageRoot, 'agents/security-auditor/SOUL.md')));
  const body = fs.readFileSync(path.join(root, 'agents/security-auditor.md'), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .split('${CLAUDE_PLUGIN_ROOT}').join(stageRoot);
  assert.ok(role.includes(body));
  assert.equal(configured.parentFilesystem[path.join(fixtureRoot, 'src/fix.cjs')], 'write');
  assert.equal(configured.parentFilesystem[fixtureRoot], 'read');
  assert.equal(configured.childFilesystem[fixtureRoot], 'read');
  assert.equal(Object.values(configured.childFilesystem).includes('write'), false);
  assert.equal(configured.parentFilesystem[':root'], 'deny');
  assert.equal(configured.parentFilesystem[stageRoot], 'read');
  assert.ok(configured.args.includes('agents.enabled=true'));
  assert.ok(configured.args.some(arg => arg.startsWith('agents.security-auditor.config_file=')));
  for (const bad of ['../outside', 'test', 'missing.cjs', 'src/*.cjs']) {
    assert.throws(() => prepareSecurityRuntime({ stageRoot, fixtureRoot, writePaths: [bad] }));
  }
});

test('isolation preflight rejects commands that escape the declared profile and removes only its synthetic files', t => {
  const dir = temporary(t), fixtureRoot = path.join(dir, 'fixture'); fs.mkdirSync(fixtureRoot);
  write(fixtureRoot, 'keep.txt', 'user fixture');
  const cli = write(dir, 'bin/codex', `#!${process.execPath}\n`
    + `const {spawnSync}=require('child_process');const a=process.argv.slice(2);const i=a.indexOf('/bin/sh');`
    + `const r=spawnSync(a[i],a.slice(i+1),{encoding:'utf8'});process.stdout.write(r.stdout);process.exit(r.status);\n`);
  fs.chmodSync(cli, 0o755);
  const result = probeIsolation({ fixtureRoot, tempRoot: dir, profile: 'vulpora_eval_read', permissionArgs: [], codexBin: cli });
  assert.equal(result.verified, false);
  assert.equal(result.outside_read, 'allowed');
  assert.equal(result.outside_write, 'allowed');
  assert.equal(result.fixture_write, 'allowed');
  assert.deepEqual(fs.readdirSync(fixtureRoot), ['keep.txt']);
  assert.equal(fs.readFileSync(path.join(fixtureRoot, 'keep.txt'), 'utf8'), 'user fixture');
});

test('long skill, complete agent bundle, memory and plain-runtime load plans stay distinct', t => {
  const root = sourceFixture(t);
  const skill = loadContext({ root, asset: 'long-skill', baseline: 'agent-only' });
  assert.match(skill.text, /FINAL_SKILL_TAIL/);
  const agent = loadContext({ root, asset: 'fixture-agent', baseline: 'agent-only' });
  for (const tail of ['AGENT_TAIL', 'SOUL_TAIL', 'PRINCIPLES_TAIL']) assert.ok(agent.text.includes(tail));
  assert.ok(!agent.text.includes('MEMORY_TAIL'));
  const memory = loadContext({ root, asset: 'fixture-agent', baseline: 'agent-memory' });
  assert.ok(memory.text.includes('MEMORY_TAIL'));
  const plain = loadContext({ root, asset: 'unknown', baseline: 'plain-runtime' });
  assert.equal(plain.text, '');
  assert.deepEqual(plain.metadata.loaded_files, []);
});

test('missing entries, wrong kinds, empty files, path escapes and symlinks cannot silently omit context', t => {
  const root = sourceFixture(t);
  const options = { root, asset: 'long-skill', baseline: 'agent-only' };
  assert.throws(() => loadContext({ ...options, asset: 'missing' }));
  assert.throws(() => loadContext({ ...options, kind: 'agent' }));
  assert.throws(() => loadContext({ ...options, baseline: 'typo' }));
  const entry = path.join(root, 'skills/long-skill/SKILL.md');
  fs.writeFileSync(entry, '  \n');
  assert.throws(() => loadContext(options), /empty_or_binary/);
  fs.rmSync(entry);
  fs.symlinkSync(path.join(root, 'memory/policies/fixture.md'), entry);
  assert.throws(() => loadContext(options), /symlink/);
  fs.rmSync(entry);
  fs.rmSync(path.dirname(entry), { recursive: true });
  fs.symlinkSync(path.join(root, 'memory/policies'), path.dirname(entry));
  assert.throws(() => loadContext(options), /symlink/);
  for (const definition of ['../outside', '/outside', 'skills/../../outside', 'memory/policies', 'skills\\outside']) {
    fs.writeFileSync(path.join(root, 'install/manifest.txt'), `skill | long-skill | ${definition} | - | - | -\n`);
    assert.throws(() => loadContext(options), definition);
  }
});

test('Codex cache is an input subset and reasoning is separate from input+output', () => {
  const measured = parseUsage('codex', jsonl({ type: 'item.completed', item: { type: 'agent_message', text: 'input_tokens: 99999' } }, codex(codexUsage)));
  assert.equal(measured.measurement_kind, 'provider_observed');
  assert.equal(measured.input_tokens, 100);
  assert.equal(measured.uncached_input_tokens, 30);
  assert.equal(measured.cached_input_tokens, 70);
  assert.equal(measured.output_tokens, 20);
  assert.equal(measured.reasoning_tokens, 8);
  assert.equal(measured.input_output_tokens, 120);
  assert.equal(measured.billing_amount, null);
  assert.equal(measured.usage_scope, 'single_turn');
});

test('Claude uses one final main-loop aggregate, ignoring duplicate steps and whole-tree modelUsage', () => {
  const step = { type: 'assistant', message: { id: 'same-id', usage: claudeUsage } };
  const final = { ...claude(claudeUsage), modelUsage: { other: { inputTokens: 99999, outputTokens: 99999 } } };
  const measured = parseUsage('claude', jsonl(step, step, final));
  assert.equal(measured.input_tokens, 95);
  assert.equal(measured.uncached_input_tokens, 80);
  assert.equal(measured.cached_input_tokens, 10);
  assert.equal(measured.cache_creation_input_tokens, 5);
  assert.equal(measured.output_tokens, 20);
  assert.equal(measured.input_output_tokens, 115);
  assert.equal(measured.reasoning_tokens, null);
  assert.equal(measured.usage_scope, 'main_agent_loop');
});

test('absent usage/caches, failed calls, duplicates and malformed counters never turn into billed zero', () => {
  const cases = [
    ['codex', '', 'missing_final_usage'],
    ['codex', '{broken', 'malformed_event'],
    ['codex', jsonl(codex(codexUsage), codex(codexUsage)), 'duplicate_final_usage'],
    ['claude', jsonl(claude(claudeUsage), claude(claudeUsage)), 'duplicate_final_usage'],
    ['codex', '{"type":"turn.completed","usage":{"input_tokens":1,"input_tokens":2,"output_tokens":3}}', 'duplicate_json_key'],
    ['codex', jsonl(codex({ ...codexUsage, cached_input_tokens: 101 })), 'invalid_cache_subset'],
    ['codex', jsonl(codex({ ...codexUsage, input_tokens: -1 })), 'invalid_usage_field'],
    ['codex', jsonl(codex({ ...codexUsage, output_tokens: '20' })), 'invalid_usage_field'],
    ['codex', jsonl(codex({ ...codexUsage, output_tokens: 1.5 })), 'invalid_usage_field'],
    ['codex', jsonl(codex({ ...codexUsage, output_tokens: Number.MAX_SAFE_INTEGER })), 'usage_overflow'],
    ['codex', jsonl(codex({ input_tokens: 10 })), 'missing_usage_field'],
    ['claude', jsonl({ ...claude(claudeUsage), subtype: 'error_during_execution', is_error: true }), 'failed_invocation_usage_incomplete'],
  ];
  for (const [runtime, stream, reason] of cases) {
    const usage = parseUsage(runtime, stream);
    assert.equal(usage.measurement_kind, 'unknown', reason);
    assert.equal(usage.input_tokens, null, reason);
    assert.equal(usage.input_output_tokens, null, reason);
    assert.equal(usage.billing_amount, null, reason);
    assert.equal(usage.fallback_reason, reason);
  }
  assert.equal(parseUsage('codex', jsonl(codex(codexUsage)), { invocationFailed: true }).fallback_reason, 'failed_invocation_usage_incomplete');
  const partial = parseUsage('claude', jsonl(claude({ input_tokens: 10, output_tokens: 3 })));
  assert.equal(partial.usage_status, 'partial');
  assert.equal(partial.uncached_input_tokens, 10);
  assert.equal(partial.input_tokens, null);
  assert.equal(partial.cached_input_tokens, null);
});

test('prompt proxy is separate, and retained provenance strips arbitrary adapter content', t => {
  const context = loadContext({ root, asset: 'unknown', baseline: 'plain-runtime' }).metadata;
  const measured = measure({ runtime: 'codex', stream: '', prompt: '가나다abc', context });
  assert.equal(measured.prompt_proxy.bytes, 12);
  assert.equal(measured.prompt_proxy.estimated_tokens, 3);
  assert.equal(measured.usage.input_tokens, null);
  const safe = projectMeasurements({ ...measured, raw_trace: 'host-secret-sentinel' });
  assert.ok(!JSON.stringify(safe).includes('host-secret-sentinel'));
  const dir = temporary(t);
  const file = write(dir, 'bad.json', '{"raw_trace":"host-secret-sentinel"}');
  const retained = retainedMeasurements(file);
  assert.equal(retained.usage.fallback_reason, 'missing_or_invalid_measurements');
  assert.ok(!JSON.stringify(retained).includes('host-secret-sentinel'));
});

test('retained result schema accepts known and explicit unknown measurements, rejecting malformed provenance', () => {
  const context = loadContext({ root, asset: 'unknown', baseline: 'plain-runtime' }).metadata;
  const measured = measure({ runtime: 'codex', stream: jsonl(codex(codexUsage)), prompt: 'fixture', context });
  const fields = 'metrics:\n  estimated_tokens: 2\n  estimated_tokens_measurement_kind: byte_quarter_proxy\n  estimated_tokens_scope: adapter_prompt_only\n';
  const result = value => fields + 'measurements: ' + JSON.stringify(value) + '\n';
  assert.equal(validateResultMeasurements(result(measured)), true);
  assert.equal(validateResultMeasurements('metrics:\n  estimated_tokens: 2\n'), true);
  assert.equal(validateResultMeasurements('measurements: ' + JSON.stringify(retainedMeasurements('/missing/fixture')) + '\n'), true);
  const malformed = [
    value => { value.raw_trace = 'forbidden'; },
    value => { value.usage.extra = 'forbidden'; },
    value => { value.usage.input_tokens = '100'; },
    value => { value.usage.input_output_tokens = 999; },
    value => { value.schema_version = '1'; },
    value => { value.context.schema_version = 2; },
    value => { value.prompt_proxy.bytes = 999; }
  ];
  for (const mutate of malformed) {
    const value = structuredClone(measured); mutate(value);
    assert.throws(() => validateResultMeasurements(result(value)));
  }
  const valid = result(measured);
  for (const invalid of [
    valid + 'measurements: ' + JSON.stringify(measured) + '\n',
    valid.replace('"schema_version":1', '"schema_version":1,"schema_version":1'),
    valid.replace('byte_quarter_proxy\n', 'provider_observed\n'),
    valid.replace('  estimated_tokens_scope: adapter_prompt_only\n', ''),
    valid.replace('estimated_tokens: 2', 'estimated_tokens: 3'),
    valid.replace('measurements: {', 'measurements:\n  value: {')
  ]) assert.throws(() => validateResultMeasurements(invalid));
});

test('Codex adapter injects skills over stdin, persists usage, and keeps fixture boundaries', t => {
  const dir = temporary(t);
  const fixture = path.join(dir, 'fixture');
  fs.mkdirSync(fixture);
  const caseFile = write(dir, 'case.yaml', 'prompt: |\n' + '  fixture task line\n'.repeat(1300) + '  FINAL_TASK_TAIL\nexpected:\n  required_artifacts:\n    - file_existing:README.md\n');
  for (const runtime of ['codex']) {
    const cli = write(dir, `bin/${runtime}`, `#!${process.execPath}\n`
      + `const fs=require('fs'),path=require('path'); const dir=path.resolve(__dirname,'..'); const args=process.argv.slice(2);\n`
      + `if(args[0]==='--version'){console.log('codex-cli 0.153.2');process.exit(0)}\n`
      + `if(args[0]==='sandbox'){fs.writeFileSync(path.join(dir,'codex-sandbox-args.json'),JSON.stringify(args));const writable=args.includes('vulpora_eval_write');if(writable)fs.writeFileSync(args.at(-1),'modified');console.log(JSON.stringify({outside_read:'denied',outside_write:'denied',fixture_read:'allowed',fixture_write:writable?'allowed':'denied'}));process.exit(0)}\n`
      + `fs.writeFileSync(path.join(dir,'${runtime}-args.json'),JSON.stringify(args));\n`
      + `fs.writeFileSync(path.join(dir,'${runtime}-prompt.txt'),fs.readFileSync(0));\n`
      + `fs.writeFileSync(path.join(dir,'${runtime}-env.txt'),process.env.VULPORA_HOST_SECRET_SENTINEL||'unset');\n`
      + (runtime === 'codex' ? `fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'final response\\n');\n` : '')
      + `console.log(${JSON.stringify(jsonl(runtime === 'codex' ? codex(codexUsage) : claude(claudeUsage)))});\n`);
    fs.chmodSync(cli, 0o755);
    const metrics = path.join(dir, `${runtime}-metrics.yaml`);
    const env = { ...process.env, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
      VULPORA_PROMPT_FILE: caseFile, VULPORA_FIXTURE_REPO: fixture,
      VULPORA_ASSET: 'e2e-scenario-author', VULPORA_ASSET_KIND: 'skill',
      VULPORA_BASELINE_MODE: 'agent-only', VULPORA_METRICS_FILE: metrics };
    delete env.VULPORA_MEASUREMENTS_FILE;
    if (runtime === 'codex') env.VULPORA_HOST_SECRET_SENTINEL = 'host-secret-sentinel';
    const adapter = path.join(root, 'evals/behavioral/adapters', `${runtime === 'codex' ? 'codex' : 'claude-code'}-local-adapter.sh`);
    const run = spawnSync('bash', [adapter], { env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim(), 'final response');
    const prompt = fs.readFileSync(path.join(dir, `${runtime}-prompt.txt`), 'utf8');
    assert.match(prompt, /FINAL_TASK_TAIL/);
    assert.ok(prompt.includes(fs.readFileSync(path.join(root, 'skills/e2e-scenario-author/SKILL.md'), 'utf8')));
    assert.match(prompt, /not staged or readable/);
    const measured = JSON.parse(fs.readFileSync(`${metrics}.measurements.json`, 'utf8'));
    assert.equal(measured.usage.measurement_kind, 'provider_observed');
    assert.equal(measured.context.loaded_files[0].complete, true);
    assert.equal(measured.prompt_proxy.bytes, Buffer.byteLength(prompt));
    assert.match(fs.readFileSync(metrics, 'utf8'), /estimated_tokens_measurement_kind: byte_quarter_proxy/);
    const args = JSON.parse(fs.readFileSync(path.join(dir, `${runtime}-args.json`), 'utf8'));
    const sandboxArgs = JSON.parse(fs.readFileSync(path.join(dir, 'codex-sandbox-args.json'), 'utf8'));
    assert.ok(sandboxArgs.includes('permissions.vulpora_eval_read.network.enabled=false'));
    if (runtime === 'codex') {
      assert.ok(args.includes('default_permissions="vulpora_eval_read"'));
      assert.ok(args.includes('permissions.vulpora_eval_read.network.enabled=false'));
      assert.equal(fs.readFileSync(path.join(dir, 'codex-env.txt'), 'utf8'), 'unset');
    }
    assert.deepEqual(fs.readdirSync(fixture), []);
    const plainRun = spawnSync('bash', [adapter], { encoding: 'utf8', env: { ...env,
      VULPORA_CONTEXT_PROFILE: 'security-workflow', VULPORA_ASSET: 'security-scan-workflow',
      VULPORA_BASELINE_MODE: 'plain-runtime' } });
    assert.equal(plainRun.status, 0, plainRun.stderr);
    const plainPrompt = fs.readFileSync(path.join(dir, 'codex-prompt.txt'), 'utf8');
    assert.ok(!plainPrompt.includes('Prepared security workflow context'));
    assert.ok(!plainPrompt.includes('Explicit evaluation context'));
    const plainMeasured = JSON.parse(fs.readFileSync(`${metrics}.measurements.json`, 'utf8'));
    assert.equal(plainMeasured.context.context_mode, 'none');
    assert.deepEqual(plainMeasured.context.loaded_files, []);
    assert.equal(plainMeasured.context.available_files, undefined);
    assert.deepEqual(fs.readdirSync(fixture), []);
  }
});

test('security workflow preparation stops before Codex invocation and retains truthful provenance', t => {
  const dir = temporary(t);
  const fixture = path.join(dir, 'fixture'); fs.mkdirSync(fixture);
  const marker = path.join(dir, 'invoked');
  const cli = write(dir, 'bin/codex', `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(marker)},'invoked');\n`);
  fs.chmodSync(cli, 0o755);
  const caseFile = write(dir, 'case.yaml', 'prompt: |\n  Review this fixture.\nexpected:\n  required_artifacts:\n    - text:INCOMPLETE\n');
  const metrics = path.join(dir, 'metrics.yaml');
  const run = spawnSync('bash', [path.join(root, 'evals/behavioral/adapters/codex-local-adapter.sh')], {
    encoding: 'utf8', env: { ...process.env, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
      VULPORA_CONTEXT_PROFILE: 'security-workflow', VULPORA_PROMPT_FILE: caseFile,
      VULPORA_FIXTURE_REPO: fixture, VULPORA_ASSET: 'security-scan-workflow', VULPORA_ASSET_KIND: 'skill',
      VULPORA_BASELINE_MODE: 'agent-only', VULPORA_METRICS_FILE: metrics, VULPORA_MEASUREMENTS_FILE: `${metrics}.json` }
  });
  assert.equal(run.status, 3, run.stderr);
  assert.equal(run.stdout, '');
  assert.equal(JSON.parse(run.stderr).execution, 'NOT_RUN');
  assert.equal(fs.existsSync(marker), false);
  assert.deepEqual(fs.readdirSync(fixture), []);
  const measured = JSON.parse(fs.readFileSync(`${metrics}.json`, 'utf8'));
  assert.equal(measured.usage.measurement_kind, 'unknown');
  assert.equal(measured.context.context_mode, 'staged_security_workflow');
  assert.equal(measured.context.native_auditor_status, 'not_run_registration_unverified');
  assert.equal(measured.context.runtime_discovery_measured, false);
  assert.ok(measured.context.available_files.length > 8);
});

test('Codex adapter blocks model execution after failed mechanical isolation', t => {
  const dir = temporary(t), fixture = path.join(dir, 'fixture'); fs.mkdirSync(fixture);
  const marker = path.join(dir, 'model-invoked');
  const cli = write(dir, 'bin/codex', `#!${process.execPath}\n`
    + `const fs=require('fs'),{spawnSync}=require('child_process');const a=process.argv.slice(2);`
    + `if(a[0]==='--version'){console.log('codex-cli 0.154.0');process.exit(0)}`
    + `if(a[0]==='sandbox'){const i=a.indexOf('/bin/sh');const r=spawnSync(a[i],a.slice(i+1),{encoding:'utf8'});process.stdout.write(r.stdout);process.exit(r.status)}`
    + `fs.writeFileSync(${JSON.stringify(marker)},'must not execute');\n`);
  fs.chmodSync(cli, 0o755);
  const caseFile = write(dir, 'case.yaml', 'prompt: |\n  Inspect this fixture.\nexpected:\n  required_artifacts:\n    - text:done\n');
  const measurements = path.join(dir, 'measurements.json');
  const run = spawnSync('bash', [path.join(root, 'evals/behavioral/adapters/codex-local-adapter.sh')], {
    encoding: 'utf8', env: { ...process.env, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
      VULPORA_CONTEXT_PROFILE: 'entry', VULPORA_PROMPT_FILE: caseFile, VULPORA_FIXTURE_REPO: fixture,
      VULPORA_ASSET: 'security-scan-workflow', VULPORA_BASELINE_MODE: 'plain-runtime',
      VULPORA_MEASUREMENTS_FILE: measurements, VULPORA_METRICS_FILE: '' }
  });
  assert.equal(run.status, 3, run.stderr);
  assert.equal(JSON.parse(run.stderr).reason, 'MACHINE_ISOLATION_PROBE_FAILED');
  assert.equal(fs.existsSync(marker), false);
  assert.deepEqual(fs.readdirSync(fixture), []);
  assert.equal(JSON.parse(fs.readFileSync(measurements, 'utf8')).usage.measurement_kind, 'unknown');
});

test('Claude live execution rejects absent or self-attested isolation before CLI or input access', t => {
  const dir = temporary(t);
  const marker = path.join(dir, 'invoked');
  const cli = write(dir, 'bin/claude', `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(marker)},'invoked');\n`);
  fs.chmodSync(cli, 0o755);
  const adapter = path.join(root, 'evals/behavioral/adapters/claude-code-local-adapter.sh');
  for (const attestation of ['', '1', 'verified']) {
    const metrics = path.join(dir, 'must-not-be-written.yaml');
    const run = spawnSync('bash', [adapter], { encoding: 'utf8', env: { ...process.env,
      PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
      VULPORA_CLAUDE_EXTERNAL_SANDBOX: attestation,
      VULPORA_CLAUDE_PERMISSION_MODE: 'bypassPermissions',
      VULPORA_PROMPT_FILE: '/missing/untrusted-input', VULPORA_FIXTURE_REPO: '/missing/fixture',
      VULPORA_METRICS_FILE: metrics } });
    assert.equal(run.status, 3);
    assert.equal(run.stdout, '');
    assert.deepEqual(JSON.parse(run.stderr), { runtime: 'claude', outcome: 'INCONCLUSIVE',
      reason: 'MACHINE_ISOLATION_UNVERIFIED', promotion: 'BLOCKED' });
    assert.equal(fs.existsSync(marker), false);
    assert.equal(fs.existsSync(metrics), false);
  }
  const unsupported = spawnSync('bash', [adapter, '--external-sandbox=verified'], { encoding: 'utf8' });
  assert.equal(unsupported.status, 2);
  assert.equal(fs.existsSync(marker), false);
});

test('Claude offline preview retains full skill, task tail and quoted artifacts without execution or usage', t => {
  const dir = temporary(t);
  const fixture = path.join(dir, 'fixture'); fs.mkdirSync(fixture);
  const caseFile = write(dir, 'case.yaml', 'prompt: |\n' + '  task line\n'.repeat(1300)
    + '  FINAL_TASK_TAIL\nexpected:\n  required_artifacts:\n    - "text:quoted evidence"\n');
  const metrics = path.join(dir, 'metrics.yaml');
  const run = spawnSync('bash', [path.join(root, 'evals/behavioral/adapters/claude-code-local-adapter.sh'), '--prepare-prompt'], {
    encoding: 'utf8', env: { ...process.env, VULPORA_PROMPT_FILE: caseFile,
      VULPORA_FIXTURE_REPO: fixture, VULPORA_ASSET: 'e2e-scenario-author',
      VULPORA_ASSET_KIND: 'skill', VULPORA_BASELINE_MODE: 'agent-only', VULPORA_METRICS_FILE: metrics }
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /FINAL_TASK_TAIL/);
  assert.match(run.stdout, /Include this exact evidence label in the final response: quoted evidence/);
  assert.ok(run.stdout.includes(fs.readFileSync(path.join(root, 'skills/e2e-scenario-author/SKILL.md'), 'utf8')));
  assert.match(run.stdout, /not staged or readable/);
  assert.equal(fs.existsSync(metrics), false);
  assert.deepEqual(fs.readdirSync(fixture), []);
});

test('behavioral runner retains a blocked Claude invocation as failed with unknown usage', t => {
  const dir = temporary(t);
  const results = path.join(dir, 'results');
  const adapter = path.join(root, 'evals/behavioral/adapters/claude-code-local-adapter.sh');
  const quote = value => `'${value.replace(/'/g, `'\''`)}'`;
  const run = spawnSync('bash', [path.join(root, 'evals/behavioral/run-behavioral-evals.sh'), '--run', '--only=kotlin-spring-reviewer'], {
    encoding: 'utf8', timeout: 60000, env: { ...process.env,
      VULPORA_BEHAVIORAL_RESULTS_DIR: results, VULPORA_RUN_GROUP_ID: 'claude-isolation-blocked',
      VULPORA_BEHAVIORAL_RUNNER_CMD: `bash ${quote(adapter)}`, VULPORA_CLAUDE_EXTERNAL_SANDBOX: '1' }
  });
  assert.equal(run.status, 1, run.stderr);
  const files = fs.readdirSync(results).filter(file => file.endsWith('.yaml'));
  assert.equal(files.length, 1);
  const result = fs.readFileSync(path.join(results, files[0]), 'utf8');
  assert.match(result, /^verdict: fail$/m);
  const retained = JSON.parse(result.split('\n').find(line => line.startsWith('measurements: ')).slice('measurements: '.length));
  assert.equal(retained.usage.measurement_kind, 'unknown');
  assert.equal(retained.usage.input_tokens, null);
});

test('behavioral runner preserves validated provenance on success and failed calls, without raw fields', t => {
  const dir = temporary(t);
  const helper = path.join(root, 'evals/behavioral/adapters/local-adapter-measurements.cjs');
  const contextHelper = path.join(root, 'evals/behavioral/adapters/local-adapter-context.cjs');
  const adapter = write(dir, 'fake-adapter.cjs', `const fs=require('fs');\n`
    + `const {measure}=require(${JSON.stringify(helper)}); const {loadContext}=require(${JSON.stringify(contextHelper)});\n`
    + `const context=loadContext({root:${JSON.stringify(root)},asset:process.env.VULPORA_ASSET,kind:process.env.VULPORA_ASSET_KIND,baseline:'plain-runtime'}).metadata;\n`
    + `const measured=measure({runtime:'codex',stream:${JSON.stringify(jsonl(codex(codexUsage)))},prompt:'fixture task',context,invocationFailed:process.env.FIXTURE_FAILURE==='1'});\n`
    + `measured.raw_trace='host-secret-sentinel'; fs.writeFileSync(process.env.VULPORA_MEASUREMENTS_FILE,JSON.stringify(measured));\n`
    + `fs.writeFileSync(process.env.VULPORA_METRICS_FILE,'elapsed_seconds: 1\\ntool_calls: 1\\nfiles_read: 1\\nfiles_written: 0\\ncommand_count: 0\\nestimated_tokens: 3\\nestimated_tokens_measurement_kind: byte_quarter_proxy\\nestimated_tokens_scope: adapter_prompt_only\\nforbidden_action_hits: 0\\nguardrail_trips: 0\\n');\n`
    + `console.log('fixture final response'); process.exit(process.env.FIXTURE_FAILURE==='1'?9:0);\n`);
  const quote = value => `'${value.replace(/'/g, `'\\''`)}'`;
  for (const failed of [false, true]) {
    const results = path.join(dir, failed ? 'failed-results' : 'results');
    const run = spawnSync('bash', [path.join(root, 'evals/behavioral/run-behavioral-evals.sh'), '--run', '--only=kotlin-spring-reviewer'], {
      env: { ...process.env, VULPORA_BEHAVIORAL_RESULTS_DIR: results,
        VULPORA_RUN_GROUP_ID: failed ? 'usage-failed' : 'usage-success',
        VULPORA_BEHAVIORAL_RUNNER_CMD: `${quote(process.execPath)} ${quote(adapter)}`,
        FIXTURE_FAILURE: failed ? '1' : '0' }, encoding: 'utf8', timeout: 60000,
    });
    assert.ok([0, 1].includes(run.status), run.stderr);
    const files = fs.readdirSync(results).filter(file => file.endsWith('.yaml'));
    assert.equal(files.length, 1);
    const result = fs.readFileSync(path.join(results, files[0]), 'utf8');
    const retained = JSON.parse(result.split('\n').find(line => line.startsWith('measurements: ')).slice('measurements: '.length));
    assert.equal(retained.usage.measurement_kind, failed ? 'unknown' : 'provider_observed');
    assert.equal(retained.usage.input_tokens, failed ? null : 100);
    assert.equal(retained.prompt_proxy.estimated_tokens, 3);
    assert.ok(!result.includes('host-secret-sentinel'));
    if (!failed) assert.match(result, /estimated_tokens_measurement_kind: byte_quarter_proxy/);
  }
});
