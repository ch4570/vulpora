#!/usr/bin/env bash
# Synthetic rollback faults must not destroy the only copy of newer user data.
set -eu
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

node - "$SCRIPT_DIR" <<'NODE'
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const install = process.argv[2];
const helper = path.join(install, 'receipt-lib.sh');
const uninstall = path.join(install, 'uninstall.sh');
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-receipt-rollback-')));
const baseline = 'installed baseline\n';
const manual = 'SYNTHETIC_PRIVATE_MANUAL_CONTENT\n';
let failures = 0;

function test(name, body) {
  const fixture = path.join(work, name);
  const project = path.join(fixture, 'project space 한글');
  const state = path.join(fixture, 'state');
  const home = path.join(fixture, 'home');
  for (const directory of [project, state, home]) fs.mkdirSync(directory, { recursive: true });
  const env = { ...process.env, HOME: home, VULPORA_STATE_HOME: state };
  delete env.BASH_ENV;
  try {
    body({ fixture, project, state, env });
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    failures++;
    process.stderr.write(`FAIL ${name}: ${error.message}\n`);
  }
}

function bash(fixture, body, args = [], extraEnv = {}) {
  return spawnSync('/bin/bash', ['-c', `set -euo pipefail\n. "$1"\n${body}`, '_', helper, ...args], {
    encoding: 'utf8', env: { ...fixture.env, ...extraEnv }, timeout: 30000,
  });
}
function ok(result) { assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error)); }
function transactions(directory, operation = 'remove') {
  return fs.readdirSync(directory).filter(name => name.startsWith(`.vulpora-${operation}.`)).map(name => path.join(directory, name));
}
function recovery(parent, original, directory, operation = 'remove', recordWritten = true) {
  const retained = transactions(parent, operation);
  assert.equal(retained.length, 1, 'failed restore must retain exactly one recovery transaction');
  const transaction = retained[0];
  const candidate = path.join(transaction, operation === 'remove' ? 'candidate' : 'old');
  assert.equal(fs.readFileSync(directory ? path.join(candidate, 'SKILL.md') : candidate, 'utf8'), manual);
  assert.equal(fs.readFileSync(path.join(transaction, 'original.path'), 'utf8'), recordWritten ? `${original}\n` : '');
  assert.equal(fs.statSync(transaction).mode & 0o077, 0, 'recovery directory must stay private');
  return transaction;
}

try {
  for (const directory of [false, true]) {
    test(`normal-mismatch-restore-${directory ? 'directory' : 'file'}`, fixture => {
      const target = path.join(fixture.project, 'item');
      const expected = path.join(fixture.state, 'expected');
      if (directory) { fs.mkdirSync(target); fs.mkdirSync(expected); }
      fs.writeFileSync(directory ? path.join(target, 'SKILL.md') : target, manual);
      fs.writeFileSync(directory ? path.join(expected, 'SKILL.md') : expected, baseline);
      const result = bash(fixture, 'receipt_remove_relative "$2" item "$3"', [fixture.project, expected]);
      assert.equal(result.status, 1);
      assert.equal(fs.readFileSync(directory ? path.join(target, 'SKILL.md') : target, 'utf8'), manual);
      assert.deepEqual(transactions(fixture.project), []);
      assert.doesNotMatch(result.stderr, /receipt_rollback_failed/);
    });

    test(`failed-mismatch-restore-${directory ? 'directory' : 'file'}`, fixture => {
      const target = path.join(fixture.project, 'item');
      const expected = path.join(fixture.state, 'expected');
      if (directory) { fs.mkdirSync(target); fs.mkdirSync(expected); }
      fs.writeFileSync(directory ? path.join(target, 'SKILL.md') : target, manual);
      fs.writeFileSync(directory ? path.join(expected, 'SKILL.md') : expected, baseline);
      const result = bash(fixture, `
mv() {
  case "$1:$2" in .vulpora-remove.*/candidate:./item) return 1 ;; esac
  command mv "$@"
}
receipt_remove_relative "$2" item "$3"
`, [fixture.project, expected]);
      assert.equal(result.status, 1);
      assert.equal(fs.existsSync(target), false, 'failed restore has not recreated the original path');
      const transaction = recovery(fixture.project, target, directory);
      assert.match(result.stderr, /receipt_rollback_failed: recovery_path=/);
      assert.ok(result.stderr.includes(path.basename(transaction)), 'diagnostic must identify the recovery transaction');
      assert.doesNotMatch(result.stderr, /SYNTHETIC_PRIVATE_MANUAL_CONTENT|installed baseline/);
      const retried = bash(fixture, 'receipt_remove_relative "$2" item "$3"', [fixture.project, expected]);
      assert.equal(retried.status, 1);
      assert.equal(recovery(fixture.project, target, directory), transaction, 'retry must keep the previous recovery transaction');
    });
  }

  for (const directory of [false, true]) {
    for (const [scenario, recordFails] of [
      ['mismatch-restore-ok', false], ['mismatch-restore-fails', false],
      ['publish-fails-restore-ok', false], ['publish-fails-restore-fails', false],
      ['mismatch-restore-fails', true], ['publish-fails-restore-fails', true],
    ]) {
      test(`replace-${scenario}-${directory ? 'directory' : 'file'}${recordFails ? '-record-fails' : ''}`, fixture => {
        const target = path.join(fixture.project, 'item');
        const source = path.join(fixture.state, 'source');
        const expected = scenario.startsWith('mismatch') ? path.join(fixture.state, 'expected') : target;
        const contentPath = item => directory ? path.join(item, 'SKILL.md') : item;
        function write(item, contents) {
          if (directory) fs.mkdirSync(item);
          fs.writeFileSync(contentPath(item), contents);
        }
        write(target, manual);
        write(source, 'new publication\n');
        if (expected !== target) write(expected, baseline);
        const result = bash(fixture, `
printf() {
  if [ "$AUDIT_RECORD_FAIL" = 1 ] && [ "\${2:-}" = "$AUDIT_ORIGINAL" ]; then return 1; fi
  builtin printf "$@"
}
mv() {
  case "$AUDIT_SCENARIO:$1:$2" in
    publish-fails-*:.vulpora-replace.*/new:./item) return 1 ;;
    *-restore-fails:.vulpora-replace.*/old:./item) return 1 ;;
  esac
  command mv "$@"
}
before="$(pwd -P)"
if receipt_replace_relative "$2" item "$3" "$4"; then rc=0; else rc=$?; fi
[ "$(pwd -P)" = "$before" ] || exit 99
exit "$rc"
`, [fixture.project, source, expected], { AUDIT_SCENARIO: scenario,
          AUDIT_RECORD_FAIL: recordFails ? '1' : '0', AUDIT_ORIGINAL: target });
        assert.equal(result.status, 1);
        assert.equal(fs.readFileSync(contentPath(source), 'utf8'), 'new publication\n');
        if (scenario.endsWith('restore-ok')) {
          assert.equal(fs.readFileSync(contentPath(target), 'utf8'), manual);
          assert.deepEqual(transactions(fixture.project, 'replace'), []);
          assert.doesNotMatch(result.stderr, /receipt_rollback_failed/);
        } else {
          assert.equal(fs.existsSync(target), false);
          const transaction = recovery(fixture.project, target, directory, 'replace', !recordFails);
          assert.match(result.stderr, /receipt_rollback_failed: recovery_path=/);
          assert.ok(result.stderr.includes(path.basename(transaction)));
          assert.doesNotMatch(result.stderr, /SYNTHETIC_PRIVATE_MANUAL_CONTENT|new publication/);
          const retry = bash(fixture, 'receipt_replace_relative "$2" item "$3" "$4"', [fixture.project, source, expected]);
          assert.equal(retry.status, 1);
          assert.equal(recovery(fixture.project, target, directory, 'replace', !recordFails), transaction);
        }
      });
    }

    test(`replace-new-path-publication-failure-${directory ? 'directory' : 'file'}`, fixture => {
      const source = path.join(fixture.state, 'source');
      if (directory) fs.mkdirSync(source);
      const content = directory ? path.join(source, 'SKILL.md') : source;
      fs.writeFileSync(content, manual);
      const result = bash(fixture, `
mv() {
  case "$1:$2" in .vulpora-replace.*/new:./item) return 1 ;; esac
  command mv "$@"
}
before="$(pwd -P)"
if receipt_replace_relative "$2" item "$3" -; then rc=0; else rc=$?; fi
[ "$(pwd -P)" = "$before" ] || exit 99
exit "$rc"
`, [fixture.project, source]);
      assert.equal(result.status, 1);
      assert.equal(fs.existsSync(path.join(fixture.project, 'item')), false);
      assert.equal(fs.readFileSync(content, 'utf8'), manual, 'the copied publication source remains available');
      assert.deepEqual(transactions(fixture.project, 'replace'), []);
      assert.doesNotMatch(result.stderr, /receipt_rollback_failed/);
    });
  }

  const hook = path.join(work, 'fault.sh');
  fs.writeFileSync(hook, `
mv() {
  if [ "$PWD" = "$AUDIT_PROJECT/.agents/skills" ]; then
    case "$AUDIT_SCENARIO:$1:$2" in
      restore-ok:./audit:.vulpora-remove.*/candidate|restore-fails:./audit:.vulpora-remove.*/candidate)
        printf '%s\\n' SYNTHETIC_PRIVATE_MANUAL_CONTENT > "$1/SKILL.md" ;;
      restore-fails:.vulpora-remove.*/candidate:./audit) return 1 ;;
    esac
  fi
  if [ "$AUDIT_SCENARIO" = snapshot-fails ] && [ "$PWD" = "$AUDIT_PROJECT/.vulpora/receipts/v1/snapshots/codex/.agents/skills" ]; then
    case "$1:$2" in ./audit:.vulpora-remove.*/candidate) return 1 ;; esac
  fi
  command mv "$@"
}
`);

  function seed(fixture) {
    const relative = '.agents/skills/audit';
    const target = path.join(fixture.project, relative);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'SKILL.md'), baseline);
    ok(bash(fixture, 'receipt_record_path "$2" codex "$3" "$2/$3"', [fixture.project, relative]));
    return target;
  }
  function remove(fixture, scenario) {
    return spawnSync('/bin/bash', [uninstall, '--runtime', 'codex', '-t', fixture.project, '--apply'], {
      encoding: 'utf8', timeout: 30000,
      env: { ...fixture.env, ...(scenario ? { BASH_ENV: hook, AUDIT_PROJECT: fixture.project, AUDIT_SCENARIO: scenario } : {}) },
    });
  }
  function anchored(fixture) { ok(bash(fixture, 'receipt_all_local_receipts_are_anchored "$2"', [fixture.project])); }
  function released(fixture) {
    assert.equal(fs.existsSync(path.join(fixture.project, '.vulpora/receipts/v1/codex.tsv')), false);
    assert.equal(fs.existsSync(path.join(fixture.project, '.vulpora/receipts/v1/snapshots/codex')), false);
    ok(bash(fixture, 'root="$(receipt_anchor_runtime_root_for "$2" codex)"; [ ! -e "$root" ]', [fixture.project]));
    anchored(fixture);
  }

  test('uninstall-normal-rollback-control', fixture => {
    const target = seed(fixture);
    const result = remove(fixture, 'restore-ok');
    assert.equal(result.status, 3, result.stderr);
    assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), manual);
    assert.deepEqual(transactions(path.dirname(target)), []);
    assert.match(result.stderr, /released_without_delete: .*anchored_remove_failed/);
    released(fixture);
  });

  test('uninstall-failed-rollback-survives-cleanup-and-retry', fixture => {
    const target = seed(fixture);
    const result = remove(fixture, 'restore-fails');
    assert.equal(result.status, 3, result.stderr);
    assert.equal(fs.existsSync(target), false);
    const transaction = recovery(path.dirname(target), target, true);
    assert.match(result.stderr, /receipt_rollback_failed: recovery_path=/);
    assert.match(result.stderr, /partial_uninstall:/);
    assert.doesNotMatch(result.stderr, /경로를 보존했습니다|SYNTHETIC_PRIVATE_MANUAL_CONTENT/);
    assert.doesNotMatch(result.stdout, /uninstall_complete:/);
    released(fixture);
    const retried = remove(fixture);
    ok(retried);
    assert.match(retried.stdout, /nothing_installed/);
    assert.equal(recovery(path.dirname(target), target, true), transaction);
    assert.equal(fs.existsSync(target), false, 'retry must not automatically restore or overwrite an original path');
    released(fixture);
  });

  test('uninstall-snapshot-cleanup-failure-retains-ownership-until-retry', fixture => {
    const target = seed(fixture);
    const result = remove(fixture, 'snapshot-fails');
    assert.equal(result.status, 3, result.stderr);
    assert.equal(fs.existsSync(target), false);
    assert.match(result.stderr, /preserved_cleanup_failure: .*snapshot_remove_failed/);
    assert.ok(fs.existsSync(path.join(fixture.project, '.vulpora/receipts/v1/codex.tsv')));
    anchored(fixture);
    const retried = remove(fixture);
    ok(retried);
    assert.match(retried.stdout, /already_absent/);
    released(fixture);
  });

  for (const scenario of ['asset-mismatch', 'asset-publication', 'snapshot-publication']) {
    test(`installer-${scenario}-rollback-failure-preserves-recovery`, fixture => {
      // Copy the real installer/helper unchanged; a one-row template catalog
      // avoids unrelated catalog assets, runtimes, or network integrations.
      const catalog = path.join(fixture.fixture, 'catalog');
      fs.mkdirSync(path.join(catalog, 'install'), { recursive: true });
      fs.mkdirSync(path.join(catalog, 'templates'));
      for (const name of ['install.sh', 'receipt-lib.sh']) {
        fs.copyFileSync(path.join(install, name), path.join(catalog, 'install', name));
      }
      fs.writeFileSync(path.join(catalog, 'install', 'manifest.txt'), 'template | audit | templates/audit | - | - | assets/audit\n');
      fs.writeFileSync(path.join(catalog, 'install', 'packs.txt'), '# isolated fixture\n');
      const source = path.join(catalog, 'templates', 'audit');
      fs.writeFileSync(source, scenario === 'asset-mismatch' ? baseline : manual);
      const run = extra => spawnSync('/bin/bash', [path.join(catalog, 'install', 'install.sh'), '--runtime', 'codex',
        '--scope', 'project', '-t', fixture.project, '--apply', 'audit'], {
        encoding: 'utf8', timeout: 30000, env: { ...fixture.env, ...extra },
      });
      ok(run({}));
      anchored(fixture);
      fs.writeFileSync(source, 'new publication\n');
      const fault = path.join(fixture.fixture, 'installer-fault.sh');
      const events = path.join(fixture.fixture, 'events.log');
      fs.writeFileSync(fault, `
mv() {
  fault_parent="$AUDIT_PROJECT/assets"
  if [ "$AUDIT_SCENARIO" = snapshot-publication ]; then
    fault_parent="$AUDIT_PROJECT/.vulpora/receipts/v1/snapshots/codex/assets"
  fi
  if [ "$PWD" = "$fault_parent" ]; then
    case "$AUDIT_SCENARIO:$1:$2" in
      asset-mismatch:./audit:.vulpora-replace.*/old)
        printf '%s\\n' SYNTHETIC_PRIVATE_MANUAL_CONTENT > "$1"
        printf 'edited-before-old-capture\\n' >> "$AUDIT_EVENTS" ;;
      *-publication:.vulpora-replace.*/new:./audit)
        printf 'failed-new-publication\\n' >> "$AUDIT_EVENTS"; return 1 ;;
      *:.vulpora-replace.*/old:./audit)
        printf 'failed-old-restoration\\n' >> "$AUDIT_EVENTS"; return 1 ;;
    esac
  fi
  command mv "$@"
}
`);
      const result = run({ BASH_ENV: fault, AUDIT_SCENARIO: scenario, AUDIT_PROJECT: fixture.project, AUDIT_EVENTS: events });
      assert.equal(result.status, 1, result.stderr);
      assert.match(fs.readFileSync(events, 'utf8'), /failed-old-restoration/);
      const target = path.join(fixture.project, 'assets', 'audit');
      const original = scenario === 'snapshot-publication'
        ? path.join(fixture.project, '.vulpora/receipts/v1/snapshots/codex/assets/audit') : target;
      assert.equal(fs.existsSync(original), false);
      recovery(path.dirname(original), original, false, 'replace');
      assert.match(result.stderr, /receipt_rollback_failed: recovery_path=/);
      assert.doesNotMatch(result.stderr, /SYNTHETIC_PRIVATE_MANUAL_CONTENT|new publication/);
      assert.doesNotMatch(result.stdout, /설치 완료/);
      assert.ok(fs.existsSync(path.join(fixture.project, '.vulpora/receipts/v1/codex.tsv')), 'failed update does not silently release prior ownership');
      if (scenario === 'snapshot-publication') {
        assert.equal(fs.readFileSync(target, 'utf8'), 'new publication\n');
        assert.deepEqual(fs.readdirSync(path.join(fixture.project, '.vulpora/receipts/v1')).filter(name => name.startsWith('.snapshot.')), []);
        assert.equal(bash(fixture, 'receipt_all_local_receipts_are_anchored "$2"', [fixture.project]).status, 1,
          'missing local snapshot must fail closed; no valid-metadata claim');
      } else anchored(fixture);
    });
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
process.exitCode = failures ? 1 : 0;
NODE
