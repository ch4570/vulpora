#!/usr/bin/env bash
# Offline argument/path boundary tests. Never invoke a real runtime CLI.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

node - "$SCRIPT_DIR/mcp-manager.sh" <<'NODE'
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const manager = process.argv[2];
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-mcp-boundaries-'));
const bin = path.join(work, 'bin');
fs.mkdirSync(bin);
fs.writeFileSync(path.join(bin, 'codex'), `#!${process.execPath}
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2), action = args[1], name = args[2];
const root = process.env.FAKE_MCP_BOUNDARY_ROOT;
fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify({action, cwd: process.cwd(), configHome: process.env.CODEX_HOME}) + '\\n');
const stateFile = path.join(root, 'state.json');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
if (action === 'get') {
  if (!state[name]) process.exit(1);
  process.stdout.write('url: ' + state[name] + '\\n');
} else if (action === 'add') {
  fs.mkdirSync(process.env.CODEX_HOME, {recursive: true});
  fs.appendFileSync(path.join(process.env.CODEX_HOME, 'config.toml'), '[mcp_servers.' + name + ']\\nurl = "' + args[4] + '"\\n');
  state[name] = args[4];
  fs.writeFileSync(stateFile, JSON.stringify(state));
} else if (action === 'remove') {
  delete state[name];
  fs.writeFileSync(stateFile, JSON.stringify(state));
} else process.exit(2);
`, {mode: 0o755});

let passed = 0, failed = 0, sequence = 0;
function check(name, action) {
  try { action(); passed += 1; process.stdout.write(`  ✓ ${name}\n`); }
  catch (error) { failed += 1; process.stderr.write(`  ✗ ${name}: ${error.message}\n`); }
}
function fixture() {
  const root = path.join(work, `case-${++sequence}`);
  const home = path.join(root, 'home'), target = path.join(root, 'project');
  fs.mkdirSync(home, {recursive: true});
  fs.mkdirSync(target);
  return {root, home, target};
}
function run(f, args, extraEnv = {}) {
  return spawnSync('/bin/bash', [manager, ...args], {cwd: f.root, encoding: 'utf8',
    env: {...process.env, HOME: f.home, CODEX_HOME: '', OLDPWD: f.home, CDPATH: '',
      VULPORA_RUNTIME_PATH: `${bin}:/usr/bin:/bin`, FAKE_MCP_BOUNDARY_ROOT: f.root, ...extraEnv}});
}
function calls(f) {
  const file = path.join(f.root, 'calls.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse) : [];
}
function args(f, scope = 'project', pack = 'openai-docs') {
  return ['install', '--runtime', 'codex', '--scope', scope, '--target', scope === 'user' ? f.home : f.target, pack];
}

try {
  for (const flag of ['--runtime', '-r', '--scope', '--target', '-t']) {
    for (const operand of [undefined, '', '--dry-run', '-P', '--', '-']) {
      check(`${flag} rejects missing/empty/option-like value ${JSON.stringify(operand)}`, () => {
        const f = fixture();
        if (operand) fs.mkdirSync(path.join(f.root, operand));
        const result = run(f, [...args(f), flag, ...(operand === undefined ? [] : [operand])]);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /값/);
        assert.deepEqual(calls(f), [], 'invalid arguments must precede all runtime calls');
        assert.equal(fs.existsSync(path.join(f.home, '.codex')), false);
      });
    }
  }
  for (const flag of ['--runtime=', '--scope=', '--target=']) {
    check(`${flag} rejects an explicit empty value`, () => {
      const f = fixture(), result = run(f, [...args(f), flag]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /값/);
      assert.deepEqual(calls(f), []);
    });
  }
  for (const scope of ['project', 'user']) for (const target of ['-P', '--', '-', '--dry-run', 'space name']) {
    check(`--target=${target} is a literal ${scope} directory`, () => {
      const f = fixture(), directory = path.join(f.root, target);
      fs.mkdirSync(directory);
      const result = run(f, ['install', '--runtime=codex', `--scope=${scope}`, `--target=${target}`, 'openai-docs'],
        scope === 'user' ? {HOME: directory} : {});
      assert.equal(result.status, 0, result.stderr);
      const canonical = fs.realpathSync(directory);
      assert(calls(f).some(call => call.action === 'add'));
      assert(calls(f).every(call => call.cwd === canonical && call.configHome === `${canonical}/.codex`));
      assert.equal(fs.existsSync(path.join(directory, '.codex/config.toml')), true);
      assert.equal(fs.existsSync(path.join(f.home, '.codex')), false);
    });
  }
  for (const scope of ['project', 'user']) for (const pack of ['notion', 'openai-docs']) {
    for (const state of ['missing-root', 'missing-config', 'regular-config']) {
      check(`${scope} ${pack} permits ${state}`, () => {
        const f = fixture(), root = scope === 'user' ? f.home : f.target;
        if (state !== 'missing-root') fs.mkdirSync(path.join(root, '.codex'));
        if (state === 'regular-config') fs.writeFileSync(path.join(root, '.codex/config.toml'), '# operator sentinel\n');
        const result = run(f, args(f, scope, pack));
        assert.equal(result.status, 0, result.stderr);
        const config = fs.readFileSync(path.join(root, '.codex/config.toml'), 'utf8');
        if (state === 'regular-config') assert(config.startsWith('# operator sentinel\n'));
        assert(config.includes(`[mcp_servers.vulpora-${pack}]`));
      });
    }
    for (const state of ['dangling-config-link', 'existing-config-link', 'dangling-root-link', 'existing-root-link', 'root-file', 'config-directory']) {
      check(`${scope} ${pack} refuses ${state} before any runtime call`, () => {
        const f = fixture(), root = scope === 'user' ? f.home : f.target;
        const codexRoot = path.join(root, '.codex'), config = path.join(codexRoot, 'config.toml');
        const outside = path.join(f.root, 'outside');
        if (state === 'root-file') fs.writeFileSync(codexRoot, 'operator sentinel\n');
        else if (state.includes('root-link')) {
          if (state === 'existing-root-link') fs.mkdirSync(outside);
          fs.symlinkSync(outside, codexRoot);
        } else {
          fs.mkdirSync(codexRoot);
          if (state === 'config-directory') fs.mkdirSync(config);
          else {
            if (state === 'existing-config-link') fs.writeFileSync(outside, 'operator sentinel\n');
            fs.symlinkSync(outside, config);
          }
        }
        const result = run(f, args(f, scope, pack));
        assert.notEqual(result.status, 0);
        assert.deepEqual(calls(f), [], 'path rejection must precede get as well as add');
        if (state === 'existing-config-link') assert.equal(fs.readFileSync(outside, 'utf8'), 'operator sentinel\n');
        if (state === 'existing-root-link') assert.deepEqual(fs.readdirSync(outside), []);
        if (state.startsWith('dangling-')) assert.equal(fs.existsSync(outside), false);
      });
    }
  }
  check('default project target and canonical user CODEX_HOME remain supported', () => {
    const f = fixture();
    let result = run(f, ['install', '--runtime', 'codex', 'openai-docs']);
    assert.equal(result.status, 0, result.stderr);
    assert(fs.existsSync(path.join(f.root, '.codex/config.toml')));
    const other = fixture();
    result = run(other, args(other, 'user'), {CODEX_HOME: path.join(other.home, '.codex')});
    assert.equal(result.status, 0, result.stderr);
    assert(fs.existsSync(path.join(other.home, '.codex/config.toml')));
  });
  process.stdout.write(`MCP boundaries: ${passed} passed, ${failed} failed\n`);
  if (failed) process.exitCode = 1;
} finally { fs.rmSync(work, {recursive: true, force: true}); }
NODE
