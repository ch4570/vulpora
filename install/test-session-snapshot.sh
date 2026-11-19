#!/usr/bin/env bash
# Synthetic Git repositories and a fake runtime; no model or user config access.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
node - "$SCRIPT_DIR/../skills/start-task/scripts/session-runner.js" "$SCRIPT_DIR/test-session-snapshot.sh" <<'NODE'
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const runner = require(path.resolve(process.argv[2]));
const {initBudget, readBudget} = require(path.join(path.dirname(path.resolve(process.argv[2])), 'session-budget.js'));
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-session-snapshot.')));
const savedEnv = {...process.env};
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; process.stdout.write(`ok - ${name}\n`); }
  catch (error) { failed++; process.stderr.write(`not ok - ${name}: ${error.stack}\n`); }
}
(async () => {
  const bin = path.join(work, 'bin'); fs.mkdirSync(bin);
  const hooks = path.join(work, 'empty-hooks'); fs.mkdirSync(hooks);
  const fake = path.join(bin, 'codex');
  fs.writeFileSync(fake, `#!${process.execPath}
const fs = require('node:fs'), args = process.argv.slice(2);
const prompt = JSON.parse(fs.readFileSync(0, 'utf8'));
fs.writeFileSync(process.env.SNAPSHOT_CAPTURE, 'called');
fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify({
  schema:'vulpora.session-candidate/v1', task_id:prompt.task_id, attempt_id:prompt.attempt_id,
  status:'candidate', summary:'Synthetic inspection.', changed_files:[], evidence:[], risks:[], blocker:null
}));
process.stdout.write(JSON.stringify({type:'turn.completed', usage:{input_tokens:10, output_tokens:1}})+'\\n');
`, {mode:0o700});
  // Git's config/index/object/common-directory overrides can redirect fixture
  // writes outside its repository. Restore the caller's environment in finally.
  for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];
  Object.assign(process.env, {PATH:`${bin}${path.delimiter}${savedEnv.PATH}`, GIT_CONFIG_NOSYSTEM:'1',
    GIT_CONFIG_GLOBAL:os.devNull, GIT_CONFIG_COUNT:'0', GIT_TERMINAL_PROMPT:'0'});
  delete process.env.VULPORA_SESSION_DEPTH;
  const catalog = path.join(work, 'catalog.json'), policy = path.join(work, 'policy.json');
  fs.writeFileSync(catalog, JSON.stringify({schema:'vulpora.runtime-model-catalog/v1', runtime:'codex',
    source:'offline-test', observedAt:new Date().toISOString(),
    models:[{id:'fake-standard', reasoningEfforts:['medium']}]}));
  fs.writeFileSync(policy, JSON.stringify({schema:'vulpora.model-routing-policy/v1', id:'snapshot-test',
    maxCatalogAgeSeconds:3600, profiles:{frugal:{effort:'low',relativeUnits:1},
      standard:{effort:'medium',relativeUnits:10},frontier:{effort:'high',relativeUnits:30}},
    runtimes:{codex:{frugal:['fake-small'],standard:['fake-standard'],frontier:['fake-frontier']},
      'claude-code':{frugal:['haiku'],standard:['sonnet'],frontier:['opus']}}}));
  function git(item, args) {
    const result = spawnSync('git', ['-c', `core.hooksPath=${hooks}`, ...args],
      {cwd:item.cwd, env:process.env, encoding:'utf8', timeout:10000});
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  }
  function fixture(name, inside = false) {
    const cwd = path.join(work, name); fs.mkdirSync(cwd);
    const item = {cwd, marker:path.join(work, `${name}.marker`), helper:path.join(work, `${name}.helper`),
      capture:path.join(work, `${name}.capture`), budget:path.join(work, `${name}.budget`),
      task:path.join(work, `${name}.task`), out:inside ? path.join(cwd, '.attempt') : path.join(work, `${name}.attempt`)};
    fs.writeFileSync(path.join(cwd, 'source.txt'), 'scoped source\n');
    fs.writeFileSync(path.join(cwd, 'side.txt'), 'committed side\n');
    git(item, ['init', '-q']); git(item, ['add', 'source.txt', 'side.txt']);
    git(item, ['-c','user.name=Offline Fixture','-c','user.email=offline@example.invalid',
      '-c','commit.gpgsign=false','commit','-qm','synthetic snapshot baseline']);
    fs.writeFileSync(path.join(cwd, 'side.txt'), 'dirty side A\n');
    fs.writeFileSync(item.task, JSON.stringify({schema:'vulpora.session-task/v1', id:name,
      goal:'Inspect scoped source.', cwd, files:['source.txt'], acceptance:['Report observed content.']}));
    initBudget(item.budget, {totalTokens:20000, maxRelativeUnits:60});
    process.env.SNAPSHOT_CAPTURE = item.capture;
    return item;
  }
  function helper(item, type, volatile = false) {
    fs.writeFileSync(item.helper, `#!${process.execPath}\nconst fs=require('node:fs');
fs.appendFileSync(${JSON.stringify(item.marker)}, 'called\\n');
process.stdout.write(${volatile ? "require('node:path').resolve(process.argv[2]) === require('node:path').join(process.cwd(), 'side.txt') ? process.env.SNAPSHOT_RENDERING : 'committed rendering'" : JSON.stringify(type === 'textconv' ? 'constant rendering\n' : '')});
`, {mode:0o700});
    if (type === 'textconv') {
      fs.writeFileSync(path.join(item.cwd, '.gitattributes'), 'side.txt diff=snapshot-fixture\n');
      git(item, ['config', 'diff.snapshot-fixture.textconv', item.helper]);
    } else if (type === 'external') git(item, ['config', 'diff.external', item.helper]);
  }
  function prepare(item) {
    return runner.prepare({task:item.task, catalog, policy, budget:item.budget, out:item.out});
  }
  async function stale(item) {
    await assert.rejects(runner.run({capsule:path.join(item.out, 'capsule.json')}), {code:'STALE_WORKSPACE'});
    assert.equal(fs.existsSync(item.capture), false);
    assert.equal(fs.existsSync(path.join(item.out, 'launch.json')), false);
    assert.equal(readBudget(item.budget).reservedTokens, 0);
  }
  for (const type of ['textconv', 'external', 'environment']) {
    await check(`preparation does not invoke ${type} diff helpers`, async () => {
      const item = fixture(`prepare-${type}`); helper(item, type);
      if (type === 'environment') process.env.GIT_EXTERNAL_DIFF = item.helper;
      try {
        assert.equal(prepare(item).status, 'PREPARED');
        assert.equal(fs.existsSync(item.marker), false);
        assert.equal(fs.existsSync(item.capture), false);
      } finally { delete process.env.GIT_EXTERNAL_DIFF; }
    });
  }
  for (const type of ['textconv', 'external']) {
    await check(`${type} rendering cannot hide a changed tracked file outside task scope`, async () => {
      const item = fixture(`stale-${type}`); helper(item, type);
      assert.equal(prepare(item).status, 'PREPARED');
      fs.writeFileSync(path.join(item.cwd, 'side.txt'), 'dirty side B\n');
      await stale(item);
      assert.equal(fs.existsSync(item.marker), false);
    });
  }
  await check('volatile diff rendering cannot make unchanged source falsely stale', async () => {
    const item = fixture('volatile-rendering'); helper(item, 'textconv', true);
    process.env.SNAPSHOT_RENDERING = 'first rendering';
    assert.equal(prepare(item).status, 'PREPARED');
    process.env.SNAPSHOT_RENDERING = 'second rendering';
    const result = await runner.run({capsule:path.join(item.out, 'capsule.json')});
    assert.equal(result.status, 'candidate'); assert.equal(result.mutationState, 'effect_none');
    assert.equal(fs.existsSync(item.marker), false);
    delete process.env.SNAPSHOT_RENDERING;
  });
  await check('ordinary and binary tracked changes remain stale-protected', async () => {
    for (const binary of [false, true]) {
      const item = fixture(`ordinary-${binary}`); assert.equal(prepare(item).status, 'PREPARED');
      fs.writeFileSync(path.join(item.cwd, 'side.txt'), binary ? Buffer.from([0,1,2,3]) : 'dirty side C\n');
      await stale(item);
    }
  });
  await check('an in-workspace attempt excludes only its own generated artifacts', async () => {
    const item = fixture('inside-attempt', true); assert.equal(prepare(item).status, 'PREPARED');
    const result = await runner.run({capsule:path.join(item.out, 'capsule.json')});
    assert.equal(result.status, 'candidate'); assert.equal(result.mutationState, 'effect_none');
  });
  if (savedEnv.VULPORA_SNAPSHOT_ENV_PROBE !== '1') {
    await check('inherited Git path overrides cannot redirect fixture writes', async () => {
      const outside = path.join(work, 'outside-fixtures'); fs.mkdirSync(outside);
      const config = path.join(outside, 'config');
      const content = '[user]\n\tname = Synthetic Outside Config\n'; fs.writeFileSync(config, content);
      for (const overrides of [{GIT_CONFIG:config}, {GIT_CONFIG:config,
        GIT_COMMON_DIR:path.join(outside, 'common'), GIT_OBJECT_DIRECTORY:path.join(outside, 'objects'),
        GIT_INDEX_FILE:path.join(outside, 'index')}]) {
        const result = spawnSync('/bin/bash', [process.argv[3]], {encoding:'utf8', timeout:60000,
          env:{...savedEnv, ...overrides, VULPORA_SNAPSHOT_ENV_PROBE:'1'}});
        assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /Session snapshot checks: PASS=8 FAIL=0/);
        assert.equal(fs.readFileSync(config, 'utf8'), content);
        assert.deepEqual(fs.readdirSync(outside), ['config']);
      }
    });
  }
})().catch(error => { failed++; process.stderr.write(`${error.stack}\n`); }).finally(() => {
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(savedEnv, key)) delete process.env[key];
  Object.assign(process.env, savedEnv);
  fs.rmSync(work, {recursive:true, force:true});
  process.stdout.write(`Session snapshot checks: PASS=${passed} FAIL=${failed}\n`);
  if (failed) process.exitCode = 1;
});
NODE
