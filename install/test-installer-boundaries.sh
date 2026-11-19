#!/usr/bin/env bash
# Real CLI regressions for selector boundaries and unowned project state.
set -eu
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

node - "$REPO_ROOT" <<'NODE'
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = process.argv[2];
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-installer-boundaries-'));
const selector = 'kotlin-spring-review';
let failures = 0;
function fixture(name) {
  const project = path.join(work, name, 'project with spaces');
  const state = path.join(work, name, 'state');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(state, { recursive: true });
  const env = { ...process.env, VULPORA_STATE_HOME: state };
  const run = (command, ...args) => spawnSync('/bin/bash', [path.join(root, 'vulpora'),
    command, '--runtime', 'codex', '--scope', 'project', '--target', project, ...args],
  { encoding: 'utf8', env });
  const installed = path.join(project, '.agents', 'skills', selector, 'SKILL.md');
  const setup = () => {
    const result = run('setup', selector);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(installed));
  };
  return { project, state, run, installed, setup };
}
function test(name, action) {
  try {
    action();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    failures++;
    process.stderr.write(`FAIL ${name}: ${error.message}\n`);
  }
}
try {
  test('setup dry-run rejects a selector containing an apply option', () => {
    const f = fixture('setup-injection');
    const result = f.run('setup', '--dry-run', `${selector} --apply`);
    assert.notEqual(result.status, 0, 'malformed selector must fail');
    assert.deepEqual(fs.readdirSync(f.project), [], 'dry-run must not install assets');
    assert.deepEqual(fs.readdirSync(f.state), [], 'dry-run must not create ownership state');
  });
  for (const malformed of [`${selector} --apply`, '']) {
    test(`uninstall dry-run rejects selector ${JSON.stringify(malformed)}`, () => {
      const f = fixture(malformed ? 'uninstall-injection' : 'uninstall-empty');
      f.setup();
      const original = fs.readFileSync(f.installed);
      const receiptPath = path.join(f.project, '.vulpora', 'receipts', 'v1', 'codex.tsv');
      const receipt = fs.readFileSync(receiptPath);
      const result = f.run('uninstall', '--dry-run', malformed);
      assert.notEqual(result.status, 0, 'malformed selector must fail');
      assert.deepEqual(fs.readFileSync(f.installed), original);
      assert.deepEqual(fs.readFileSync(receiptPath), receipt);
    });
  }
  test('last runtime removal preserves approved task evidence and unowned metadata', () => {
    const f = fixture('task-evidence');
    f.setup();
    const task = path.join(f.project, '.vulpora', 'tasks', 'run-approved');
    fs.mkdirSync(task, { recursive: true });
    const files = [
      [path.join(task, 'clarified-spec.yaml'), 'run_id: run-approved\n'],
      [path.join(task, 'execution-ledger.jsonl'), '{"event":"spec_committed"}\n'],
      [path.join(f.project, '.vulpora', 'project-settings.json'), '{"custom":true}\n'],
    ];
    for (const [file, contents] of files) fs.writeFileSync(file, contents);
    const preview = f.run('uninstall', '--dry-run');
    assert.equal(preview.status, 0, preview.stderr);
    assert.ok(fs.existsSync(f.installed), 'ordinary dry-run must preserve installed assets');
    const result = f.run('uninstall');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(f.installed), false, 'receipt-owned asset must be removed');
    assert.equal(fs.existsSync(path.join(f.project, '.vulpora', 'receipts')), false);
    for (const [file, contents] of files) {
      assert.ok(fs.existsSync(file), `unowned data was deleted: ${path.relative(f.project, file)}`);
      assert.equal(fs.readFileSync(file, 'utf8'), contents);
    }
    assert.equal(f.run('uninstall').status, 0, 'removal remains idempotent with preserved project state');
  });
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
process.exitCode = failures ? 1 : 0;
NODE
