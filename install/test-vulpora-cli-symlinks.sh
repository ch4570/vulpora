#!/usr/bin/env bash
# Exercise the canonical executable through npm-style symlinks.
set -eu
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

node - "$REPO_ROOT" <<'NODE'
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const root = process.argv[2];
const cli = path.join(root, 'vulpora');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-cli-symlinks-'));
try {
  assert.equal(run(cli, ['version']), `vulpora ${version}\n`);
  const help = run(cli, ['--help']);
  assert.match(help, /^Vulpora CLI\n/);
  assert.match(help, /vulpora setup/);
  assert.match(help, /VULPORA_CODEX_MODEL/);

  const source = path.join(work, 'package with spaces');
  const linked = path.join(work, 'linked');
  const npmBin = path.join(work, 'npm-bin');
  for (const directory of [path.join(source, 'install'), linked, npmBin]) fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(cli, path.join(source, 'vulpora'));
  fs.copyFileSync(path.join(root, 'VERSION'), path.join(source, 'VERSION'));
  fs.copyFileSync(path.join(root, 'install/runtime-detect.sh'), path.join(source, 'install/runtime-detect.sh'));
  fs.chmodSync(path.join(source, 'vulpora'), 0o755);
  fs.symlinkSync(path.join(source, 'vulpora'), path.join(linked, 'vulpora'));
  fs.symlinkSync('../linked/vulpora', path.join(npmBin, 'vulpora'));
  const launcher = path.join(npmBin, 'vulpora');
  assert.equal(run(launcher, ['version']), `vulpora ${version}\n`);
  assert.equal(run(launcher, ['--help']), help);

  // The real CLI must resolve its own helpers and preserve argument boundaries
  // and runtime discovery PATH. No replacement executable stands in for it.
  fs.writeFileSync(path.join(source, 'install/mcp-manager.sh'), `#!/bin/bash
printf '%s\\0' "$@"
printf '%s' "$VULPORA_RUNTIME_PATH" >&2
exit 37
`);
  const args = ['list', '', 'two words', 'line\nbreak', '*', '--literal=$value'];
  const result = spawnSync(launcher, ['mcp', ...args], { encoding: 'utf8', env: { ...process.env, VULPORA_RUNTIME_PATH: process.env.PATH } });
  assert.equal(result.status, 37);
  assert.equal(result.stdout, args.join('\0') + '\0');
  assert.equal(result.stderr, process.env.PATH);
  assert.equal(spawnSync(launcher, ['missing-command'], { encoding: 'utf8' }).status, 1);
  process.stdout.write('Vulpora CLI symlinks: PASS version help helper-resolution argv runtime-PATH exit-status\n');
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
NODE
