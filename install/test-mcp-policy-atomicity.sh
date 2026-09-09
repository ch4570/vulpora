#!/usr/bin/env bash
# Offline policy transactions: real-script fake-runtime faults and explicitly
# instrumented source-copy timing faults. Never use a live runtime or config.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

node - "$SCRIPT_DIR/mcp-manager.sh" <<'NODE'
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const manager = process.argv[2], source = fs.readFileSync(manager, 'utf8');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-mcp-policy-'));
const bin = path.join(work, 'bin');
fs.mkdirSync(bin);
const base = '# PRIVATE_CONFIG_TOKEN\n[mcp_servers.vulpora-notion]\nurl = "https://mcp.notion.com/mcp"\n';
const policy = 'enabled_tools = ["notion-search", "notion-fetch", "search", "fetch"]';
const fault = path.join(work, 'fault.cjs');
fs.writeFileSync(fault, `
const fs = require('node:fs'), path = require('node:path');
module.exports = function mutate() {
  const root = process.env.FAKE_POLICY_ROOT, config = path.join(process.env.CODEX_HOME, 'config.toml');
  if (fs.existsSync(path.join(root, 'mutated'))) return;
  fs.writeFileSync(path.join(root, 'mutated'), 'yes');
  const bytes = fs.readFileSync(config), kind = process.env.FAKE_POLICY_FAULT;
  if (kind.endsWith('-replace')) {
    const prefix = kind === 'backup-replace' ? 'config.toml.vulpora.backup.' : 'config.toml.vulpora.published.';
    const file = kind === 'candidate-replace' ? process.env.FAKE_POLICY_CANDIDATE
      : path.join(process.env.CODEX_HOME, fs.readdirSync(process.env.CODEX_HOME).find(name => name.startsWith(prefix)));
    fs.writeFileSync(file + '.replacement', '# PRIVATE_FOREIGN_TEMP\\n', {mode: 0o600});
    fs.renameSync(file + '.replacement', file);
    fs.writeFileSync(path.join(root, 'foreign.json'), JSON.stringify({file, ino: fs.statSync(file).ino}));
  } else if (kind === 'append') fs.appendFileSync(config, '# PRIVATE_OPERATOR_EDIT\\n');
  else if (kind === 'replace') {
    fs.writeFileSync(config + '.replacement', bytes, {mode: fs.statSync(config).mode & 0o777});
    fs.renameSync(config + '.replacement', config);
  } else if (kind === 'mode') fs.chmodSync(config, fs.statSync(config).mode & 0o777 ^ 0o040);
  else if (kind === 'symlink' || kind === 'dangling') {
    if (kind === 'symlink') fs.writeFileSync(path.join(root, 'outside'), bytes);
    fs.unlinkSync(config);
    fs.symlinkSync(path.join(root, 'outside'), config);
  } else if (kind === 'directory') { fs.unlinkSync(config); fs.mkdirSync(config); }
  else if (kind === 'delete') fs.unlinkSync(config);
  else throw new Error('unknown synthetic fault ' + kind);
  const stat = fs.existsSync(config) || kind === 'dangling' ? fs.lstatSync(config) : null;
  fs.writeFileSync(path.join(root, 'observed.json'), JSON.stringify({
    exists: !!stat, ino: stat && stat.ino, mode: stat && stat.mode,
    link: stat && stat.isSymbolicLink() ? fs.readlinkSync(config) : null,
    bytes: stat && stat.isFile() ? fs.readFileSync(config).toString('base64') : null
  }));
};
if (require.main === module) module.exports();
`);
fs.writeFileSync(path.join(bin, 'codex'), `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const root = process.env.FAKE_POLICY_ROOT, config = path.join(process.env.CODEX_HOME, 'config.toml');
const action = process.argv[3];
fs.appendFileSync(path.join(root, 'calls'), action + '\\n');
if (action === 'get') {
  if (!fs.existsSync(config)) process.exit(1);
  const content = fs.readFileSync(config, 'utf8');
  if (!content.includes('[mcp_servers.vulpora-notion]')) process.exit(1);
  if (content.includes('enabled_tools = ') && process.env.FAKE_POLICY_STAGE === 'verify') {
    if (process.env.FAKE_POLICY_FAULT) require(${JSON.stringify(fault)})();
    if (process.env.FAKE_POLICY_VERIFY_FAIL === '1') process.exit(1);
  }
  process.stdout.write('url: https://mcp.notion.com/mcp\\n');
} else if (action === 'add') {
  fs.mkdirSync(process.env.CODEX_HOME, {recursive: true});
  fs.writeFileSync(config, ${JSON.stringify(base)}, {mode: 0o600});
} else if (action === 'remove') {
  fs.appendFileSync(path.join(root, 'removed'), 'removed');
  fs.writeFileSync(config, '# fake removed\\n');
} else if (action !== 'login') process.exit(2);
`, {mode: 0o755});

let passed = 0, failed = 0, sequence = 0;
function check(name, action) {
  try { action(); passed++; process.stdout.write(`  ✓ ${name}\n`); }
  catch (error) { failed++; process.stderr.write(`  ✗ ${name}: ${error.message}\n`); }
}
function fixture({fresh = false, exact = false, scope = 'project'} = {}) {
  const root = path.join(work, `case-${++sequence}`), home = path.join(root, 'home');
  const target = path.join(root, 'project');
  fs.mkdirSync(home, {recursive: true}); fs.mkdirSync(target);
  const configRoot = path.join(scope === 'user' ? home : target, '.codex');
  fs.mkdirSync(configRoot);
  const config = path.join(configRoot, 'config.toml');
  if (!fresh) fs.writeFileSync(config, exact ? base.replace('\nurl =', '\n' + policy + '\nurl =') : base, {mode: 0o600});
  return {root, home, target, configRoot, config, scope};
}
function run(f, {stage = '', kind = '', fail = false, copyStage = '', dryRun = false, action = 'install'} = {}) {
  let script = manager;
  if (copyStage) {
    const directory = path.join(f.root, 'instrumented'); fs.mkdirSync(directory);
    script = path.join(directory, 'mcp-manager.sh');
    // Only the isolated COPY has a deterministic scheduling hook. The original
    // source remains byte-identical and has no production fault-injection API.
    const anchor = copyStage === 'before-backup'
      ? '  if ! cp "$CODEX_CONFIG_FILE" "$CODEX_POLICY_BACKUP"; then'
      : copyStage === 'restore-failure' ? 'restore_codex_policy() {\n' : '  policy_write_rc=$?\n';
    assert.equal(source.split(anchor).length, 2, 'timing hook must have one exact anchor');
    const hook = copyStage === 'restore-failure'
      ? '  mv() { case "$1" in *.vulpora.backup.*) return 1 ;; *) command mv "$@" ;; esac; }\n'
      : copyStage === 'write-failure' ? '  policy_write_rc=42\n'
      : `  CODEX_HOME="$TARGET/.codex" FAKE_POLICY_CANDIDATE="\${policy_tmp:-}" "${process.execPath}" "${fault}"\n`;
    fs.writeFileSync(script, source.replace(anchor, copyStage === 'before-backup' ? hook + anchor : anchor + hook));
    fs.copyFileSync(path.join(path.dirname(manager), 'mcp-packs.txt'), path.join(directory, 'mcp-packs.txt'));
  }
  return spawnSync('/bin/bash', [script, action, '--runtime', 'codex', '--scope', f.scope,
    '--target', f.scope === 'user' ? f.home : f.target, ...(dryRun ? ['--dry-run'] : []), 'notion'], {
    cwd: f.root, encoding: 'utf8', timeout: 15000,
    env: {...process.env, HOME: f.home, CODEX_HOME: '', CDPATH: '',
      VULPORA_RUNTIME_PATH: `${bin}:/usr/bin:/bin`, FAKE_POLICY_ROOT: f.root,
      FAKE_POLICY_STAGE: stage, FAKE_POLICY_FAULT: kind, FAKE_POLICY_VERIFY_FAIL: fail ? '1' : '0'}
  });
}
function calls(f) { return fs.readFileSync(path.join(f.root, 'calls'), 'utf8').trim().split('\n'); }
function snapshot(file) {
  let stat; try { stat = fs.lstatSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return {exists: !!stat, ino: stat && stat.ino || null, mode: stat && stat.mode || null,
    link: stat && stat.isSymbolicLink() ? fs.readlinkSync(file) : null,
    bytes: stat && stat.isFile() ? fs.readFileSync(file).toString('base64') : null};
}
function artifacts(f) { return fs.readdirSync(f.configRoot).filter(name => name.includes('.vulpora.')); }
function assertConflict(f, result) {
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  const expected = JSON.parse(fs.readFileSync(path.join(f.root, 'observed.json'), 'utf8'));
  assert.deepEqual(snapshot(f.config), expected, 'operator state must survive, including identity and type');
  assert(!calls(f).includes('remove'), 'drift must suppress runtime_remove');
  assert.match(result.stderr, /config.*(?:drift|변경)|(?:drift|변경).*config/);
  assert(!`${result.stdout}${result.stderr}`.includes('PRIVATE_'), 'diagnostics must not expose file contents');
  const remaining = artifacts(f);
  assert.equal(remaining.length, 1, 'retain only the recovery backup');
  assert.match(remaining[0], /\.vulpora\.backup\./);
  const backup = path.join(f.configRoot, remaining[0]);
  assert.equal(fs.readFileSync(backup, 'utf8'), base);
  assert.equal(fs.statSync(backup).mode & 0o777, 0o600);
  assert(result.stderr.includes(backup), 'report the recovery path without its contents');
  const outside = path.join(f.root, 'outside');
  if (expected.link) {
    if (fs.existsSync(outside)) assert(!fs.readFileSync(outside, 'utf8').includes('PRIVATE_OPERATOR_EDIT'));
    else assert.equal(fs.existsSync(outside), false);
  }
}

try {
  // Isolated helper simulations only: these exercise GNU argument semantics,
  // not a real GNU stat binary, and do not change the manager's command PATH.
  for (const [mode, expected, expectedCalls] of [
    ['bsd', '12:34:100600:501:20\n', ['-f']],
    ['gnu', '12:34:81a4:501:20\n', ['-f', '-c']],
    ['gnu-format-filename', '12:34:81a4:501:20\n', ['-f', '-c']],
    ['empty-bsd', '12:34:81a4:501:20\n', ['-f', '-c']],
    ['multiline-bsd', '12:34:81a4:501:20\n', ['-f', '-c']],
    ['malformed-both', null, ['-f', '-c']],
  ]) {
    check(`isolated helper simulation: strict stat identity for ${mode}`, () => {
      const f = fixture(), script = path.join(f.root, 'identity-helper.sh');
      if (mode === 'gnu-format-filename') fs.writeFileSync(path.join(f.root, '%d:%i:%p:%u:%g'), 'fixture');
      const helper = source.slice(source.indexOf('codex_file_identity() {'), source.indexOf('\ncodex_policy_owned() {'));
      assert(helper.startsWith('codex_file_identity() {') && helper.endsWith('\n'));
      fs.writeFileSync(script, `#!/bin/bash
set -eu
stat() {
  printf '%s\\n' "$1" >> "$STAT_CALLS"
  if [ "$1" = -f ]; then
    case "$STAT_MODE" in
      bsd) printf '%s\\n' '12:34:100600:501:20' ;;
      empty-bsd) return 0 ;;
      multiline-bsd) printf '%s\\n' '12:34:100600:501:20' 'extra report' ;;
      malformed-both) printf '%s\\n' '12:34:not-mode:501:20' ;;
      *)
        # GNU -f treats FORMAT as another filename, not a format string.
        [ -f "$2" ] || return 1
        printf '  File: "%s"\\n    ID: abcdef Namelen: 255 Type: ext4\\n' "$2"
        ;;
    esac
  elif [ "$STAT_MODE" = malformed-both ]; then
    printf '%s\\n' '12:34:81a4:501:20:unexpected'
  else
    printf '%s\\n' '12:34:81a4:501:20'
  fi
}
${helper}
codex_file_identity "$1"
`);
      const result = spawnSync('/bin/bash', [script, f.config], {cwd: f.root, encoding: 'utf8',
        env: {...process.env, STAT_MODE: mode, STAT_CALLS: path.join(f.root, 'stat-calls')}});
      assert.equal(result.status, expected === null ? 1 : 0, result.stderr);
      assert.equal(result.stdout, expected === null ? '' : expected);
      assert.deepEqual(fs.readFileSync(path.join(f.root, 'stat-calls'), 'utf8').trim().split('\n'), expectedCalls);
    });
  }
  for (const fresh of [false, true]) for (const kind of ['append', 'replace', 'mode', 'symlink', 'dangling', 'directory', 'delete']) {
    check(`original script: ${fresh ? 'fresh add' : 'existing'} verify failure preserves ${kind}`, () => {
      const f = fixture({fresh}), result = run(f, {stage: 'verify', kind, fail: true});
      assertConflict(f, result);
    });
  }
  check('original script: successful get cannot commit an operator edit', () => {
    const f = fixture(), result = run(f, {stage: 'verify', kind: 'append'});
    assertConflict(f, result);
  });
  for (const fail of [false, true]) {
    check(`original script: login verify ${fail ? 'failure' : 'success'} preserves operator edit and skips OAuth`, () => {
      const f = fixture(), result = run(f, {action: 'login', stage: 'verify', kind: 'append', fail});
      assertConflict(f, result);
      assert(!calls(f).includes('login'));
    });
  }
  for (const fresh of [false, true]) for (const kind of ['append', 'replace', 'mode', 'symlink', 'dangling', 'directory', 'delete']) {
    check(`instrumented copy: ${fresh ? 'fresh add' : 'existing'} prepublication preserves ${kind}`, () => {
      const f = fixture({fresh}), result = run(f, {copyStage: 'after-candidate', kind});
      assertConflict(f, result);
    });
  }
  check('instrumented copy: replacement during initial backup is refused', () => {
    const f = fixture(), result = run(f, {copyStage: 'before-backup', kind: 'replace'});
    assertConflict(f, result);
  });
  for (const fresh of [false, true]) {
    check(`instrumented copy: ${fresh ? 'fresh' : 'existing'} restore I/O failure retains and reports recovery backup`, () => {
      const f = fixture({fresh}), result = run(f, {copyStage: 'restore-failure', stage: 'verify', fail: true});
      assert.notEqual(result.status, 0);
      assert(!calls(f).includes('remove'));
      assert(fs.readFileSync(f.config, 'utf8').includes(policy), 'failed restore must not replace the published file');
      const remaining = artifacts(f);
      assert.equal(remaining.length, 1);
      assert.match(remaining[0], /\.vulpora\.backup\./);
      const backup = path.join(f.configRoot, remaining[0]);
      assert.equal(fs.readFileSync(backup, 'utf8'), base);
      assert(result.stderr.includes(backup), 'report the preserved recovery path on I/O failure too');
      assert.match(result.stderr, /수동/);
      assert(!result.stderr.includes('원복했습니다'));
      assert(!`${result.stdout}${result.stderr}`.includes('PRIVATE_'));
    });
    check(`instrumented copy: unpublished ${fresh ? 'fresh' : 'existing'} writer failure never restores a backup`, () => {
      const f = fixture({fresh}), before = fresh ? null : snapshot(f.config);
      const result = run(f, {copyStage: 'write-failure'});
      assert.notEqual(result.status, 0);
      assert.deepEqual(artifacts(f), []);
      assert.equal(calls(f).includes('remove'), fresh);
      if (!fresh) assert.deepEqual(snapshot(f.config), before, 'preparation failure must not replace the original inode');
    });
  }
  for (const kind of ['candidate-replace', 'backup-replace', 'published-replace']) {
    check(`${kind === 'candidate-replace' ? 'instrumented copy' : 'original script'}: cleanup preserves foreign ${kind}`, () => {
      const f = fixture(), result = run(f, kind === 'candidate-replace'
        ? {copyStage: 'after-candidate', kind} : {stage: 'verify', kind, fail: true});
      assert.notEqual(result.status, 0);
      assert.deepEqual(snapshot(f.config), JSON.parse(fs.readFileSync(path.join(f.root, 'observed.json'), 'utf8')));
      assert(!calls(f).includes('remove'));
      const foreign = JSON.parse(fs.readFileSync(path.join(f.root, 'foreign.json'), 'utf8'));
      assert.equal(fs.statSync(foreign.file).ino, foreign.ino);
      assert.equal(fs.readFileSync(foreign.file, 'utf8'), '# PRIVATE_FOREIGN_TEMP\n');
      assert(!`${result.stdout}${result.stderr}`.includes('PRIVATE_'));
      const backups = artifacts(f).filter(name => name.includes('.backup.'));
      assert.equal(backups.length, 1);
      assert.equal(artifacts(f).length, kind === 'backup-replace' ? 1 : 2);
    });
  }
  for (const scope of ['project', 'user']) for (const state of ['existing', 'fresh', 'exact', 'dry-run']) {
    check(`happy ${scope}: ${state} preserves policy behavior and cleans snapshots`, () => {
      const f = fixture({fresh: state === 'fresh', exact: state === 'exact', scope});
      const before = fs.existsSync(f.config) ? snapshot(f.config) : null;
      const result = run(f, {dryRun: state === 'dry-run'});
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(artifacts(f), []);
      if (state === 'exact' || state === 'dry-run') assert.deepEqual(snapshot(f.config), before);
      else assert(fs.readFileSync(f.config, 'utf8').includes(policy));
      assert(!calls(f).includes('remove'));
    });
  }
  for (const fresh of [false, true]) {
    check(`original script: owned ${fresh ? 'fresh' : 'existing'} verify failure rolls back`, () => {
      const f = fixture({fresh}), result = run(f, {stage: 'verify', fail: true});
      assert.notEqual(result.status, 0);
      assert.deepEqual(artifacts(f), []);
      assert.equal(calls(f).includes('remove'), fresh);
      assert.equal(fs.readFileSync(f.config, 'utf8'), fresh ? '# fake removed\n' : base);
    });
  }
  process.stdout.write(`MCP policy atomicity: ${passed} passed, ${failed} failed\n`);
  if (failed) process.exitCode = 1;
} finally {
  assert.equal(fs.readFileSync(manager, 'utf8'), source, 'tests must not modify the original script');
  fs.rmSync(work, {recursive: true, force: true});
}
NODE
