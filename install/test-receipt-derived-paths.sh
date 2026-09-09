#!/usr/bin/env bash
# Pure path derivation may avoid subprocesses; filesystem evidence must stay fresh.
set -eu
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

node - "$SCRIPT_DIR/receipt-lib.sh" <<'NODE'
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const helper = process.argv[2];
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-receipt-derived-paths-')));
let failures = 0;
function test(name, body, check = () => {}, extraEnv = {}) {
  const directory = path.join(work, name);
  const project = path.join(directory, 'project');
  const state = path.join(directory, 'state');
  fs.mkdirSync(path.join(project, '.agents', 'skills', 'cache-audit'), { recursive: true });
  fs.writeFileSync(path.join(project, '.agents', 'skills', 'cache-audit', 'SKILL.md'), 'fixture\n');
  fs.mkdirSync(state, { recursive: true });
  const result = spawnSync('/bin/bash', ['-c', `
set -euo pipefail
. "$1"
project="$2"
state="$3"
${body}
`, '_', helper, project, state], {
    encoding: 'utf8',
    env: { ...process.env, ...(typeof extraEnv === 'function' ? extraEnv({ project, state }) : extraEnv),
      VULPORA_STATE_HOME: state },
  });
  try {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    check(result.stdout);
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    failures++;
    process.stderr.write(`FAIL ${name}: ${error.message}\n`);
  }
}
try {
  test('same-target-and-state-derive-once', `
expected="$(receipt_anchor_root_for "$project")"
counter="$state/checksum-count"
: > "$counter"
cksum() { printf 'call\\n' >> "$counter"; command cksum "$@"; }
for iteration in 1 2 3 4; do
  receipt_anchor_location_is_safe "$project"
  actual="$(receipt_anchor_root_for "$project")"
  [ "$actual" = "$expected" ]
done
wc -l < "$counter"
`, output => assert.equal(Number(output.trim()), 1, 'the same immutable root should need one checksum'));

  test('changed-target-uses-its-own-binding', `
other="$project-other"
mkdir "$other"
receipt_anchor_prepare "$project"
first="$(receipt_anchor_root_for "$project")"
receipt_anchor_prepare "$other"
second="$(receipt_anchor_root_for "$other")"
[ "$first" != "$second" ]
printf '%s\\n' "$other" | cmp -s - "$second/target.path"
receipt_anchor_store_is_safe "$project"
[ "$(receipt_anchor_root_for "$project")" = "$first" ]
`);

  test('changed-state-home-uses-its-own-root', `
receipt_anchor_prepare "$project"
first="$(receipt_anchor_root_for "$project")"
VULPORA_STATE_HOME="$state-other"
receipt_anchor_prepare "$project"
second="$(receipt_anchor_root_for "$project")"
[ "$first" != "$second" ]
case "$second" in "$VULPORA_STATE_HOME"/receipts/v1/targets/*) ;; *) exit 1 ;; esac
receipt_anchor_store_is_safe "$project"
VULPORA_STATE_HOME="$state"
receipt_anchor_store_is_safe "$project"
[ "$(receipt_anchor_root_for "$project")" = "$first" ]
`);

  test('cached-root-does-not-trust-a-new-state-symlink', `
receipt_anchor_prepare "$project"
receipt_anchor_store_is_safe "$project"
mv "$state" "$state-original"
ln -s "$state-original" "$state"
if receipt_anchor_store_is_safe "$project"; then exit 1; fi
`);

  test('cached-root-does-not-trust-an-altered-binding', `
receipt_anchor_prepare "$project"
receipt_anchor_store_is_safe "$project"
root="$(receipt_anchor_root_for "$project")"
printf '%s\\n' "$project-other" > "$root/target.path"
if receipt_anchor_store_is_safe "$project"; then exit 1; fi
`);

  test('cached-root-does-not-trust-a-modified-local-snapshot', `
rel=.agents/skills/cache-audit
receipt_record_path "$project" codex "$rel" "$project/$rel"
receipt_anchor_entry_is_valid "$project" codex "$rel"
snapshot="$(receipt_snapshot_for "$project" codex "$rel")"
printf 'changed\\n' > "$snapshot/SKILL.md"
if receipt_anchor_entry_is_valid "$project" codex "$rel"; then exit 1; fi
`);

  test('ambient-cache-cannot-override-derived-path', `
actual="$(receipt_anchor_root_for "$project")"
case "$actual" in "$state"/receipts/v1/targets/*) ;; *) exit 1 ;; esac
`, () => {}, ({ project, state }) => ({
    _VULPORA_RECEIPT_ANCHOR_CACHE_TARGET: project,
    _VULPORA_RECEIPT_ANCHOR_CACHE_STATE_HOME: state,
    _VULPORA_RECEIPT_ANCHOR_CACHE_ROOT: '/untrusted-root',
  }));

  test('remove-relative-split-equivalence-90', `
capture="$state/split"
counter="$state/path-command-count"
: > "$counter"
dirname() { printf 'dirname\\n' >> "$counter"; command dirname "$@"; }
basename() { printf 'basename\\n' >> "$counter"; command basename "$@"; }
# Bash dynamic scope exposes the production locals. Stop at the first physical
# path lookup after capturing them; this probe cannot reach any deletion.
pwd() { printf '%s\\t%s\\n' "$parent_rel" "$leaf" > "$capture"; return 1; }
checked=0
for first in a a-b a_b a.b .hidden ... 9 -x --; do
  for suffix in '' /a /a-b /a_b /a.b /.hidden /... /9 /-x /--; do
    rel="$first$suffix"
    expected_parent="$(command dirname "$rel" 2>/dev/null)" || true
    expected_leaf="$(command basename "$rel" 2>/dev/null)" || true
    printf '%s\\t%s\\n' "$expected_parent" "$expected_leaf" > "$state/expected"
    rm -f "$capture"
    if receipt_remove_relative "$project" "$rel" "$project/unused" 2>/dev/null; then exit 1; fi
    cmp -s "$state/expected" "$capture"
    checked=$((checked + 1))
  done
done
[ "$checked" = 90 ]
# Twenty option-like paths keep both legacy subprocesses; all other paths use
# pure splitting. This checks the actual helper, not a duplicated algorithm.
calls="$(wc -l < "$counter")"
if [ "$calls" -ne 40 ]; then printf '90 equivalent splits used %s external calls; expected 40 fallback calls\\n' "$calls" >&2; exit 1; fi
`);

  test('remove-relative-root-nested-and-unicode-base', `
base="$project/space 한글"
mkdir -p "$base/nested/assets"
printf 'root\\n' > "$base/leaf.txt"
printf 'nested\\n' > "$base/nested/item.txt"
printf 'asset\\n' > "$base/nested/assets/value.txt"
printf 'keep\\n' > "$base/keep.txt"
counter="$state/path-command-count"
: > "$counter"
dirname() { printf 'dirname\\n' >> "$counter"; command dirname "$@"; }
basename() { printf 'basename\\n' >> "$counter"; command basename "$@"; }
for rel in leaf.txt nested/item.txt nested/assets; do
  cp -R "$base/$rel" "$state/expected"
  receipt_remove_relative "$base" "$rel" "$state/expected"
  [ ! -e "$base/$rel" ] && [ ! -L "$base/$rel" ]
  rm -rf "$state/expected"
done
[ "$(cat "$base/keep.txt")" = keep ]
if [ -s "$counter" ]; then printf '3 successful removals used %s path subprocesses; expected 0\\n' "$(wc -l < "$counter")" >&2; exit 1; fi
[ -z "$(find "$base" -name '.vulpora-remove.*' -print)" ]
`);

  test('remove-relative-mismatch-restores-the-original', `
mkdir -p "$project/nested"
printf 'user content\\n' > "$project/nested/item.txt"
printf 'old snapshot\\n' > "$state/expected"
if receipt_remove_relative "$project" nested/item.txt "$state/expected"; then exit 1; fi
[ "$(cat "$project/nested/item.txt")" = 'user content' ]
[ "$(cat "$state/expected")" = 'old snapshot' ]
[ -z "$(find "$project" -name '.vulpora-remove.*' -print)" ]
`);

  test('remove-relative-keeps-physical-parent-and-symlink-checks', `
mkdir -p "$state/outside"
printf 'user content\\n' > "$state/outside/item.txt"
cp "$state/outside/item.txt" "$state/expected"
ln -s "$state/outside" "$project/linked-parent"
if receipt_remove_relative "$project" linked-parent/item.txt "$state/expected"; then exit 1; fi
ln -s "$state/outside/item.txt" "$project/linked-leaf"
if receipt_remove_relative "$project" linked-leaf "$state/expected"; then exit 1; fi
ln -s "$state/outside" "$project/linked-base"
if receipt_remove_relative "$project/linked-base" item.txt "$state/expected"; then exit 1; fi
ln -s "$state/missing" "$project/broken-leaf"
if receipt_remove_relative "$project" broken-leaf "$state/expected"; then exit 1; fi
[ -L "$project/linked-parent" ] && [ -L "$project/linked-leaf" ]
[ -L "$project/linked-base" ] && [ -L "$project/broken-leaf" ]
[ "$(cat "$state/outside/item.txt")" = 'user content' ]
[ ! -e "$state/missing" ]
[ -z "$(find "$project" -name '.vulpora-remove.*' -print)" ]
`);

  test('remove-relative-rejects-unsafe-relative-paths-before-splitting', `
printf 'keep\\n' > "$project/leaf"
cp "$project/leaf" "$state/expected"
counter="$state/path-command-count"
: > "$counter"
dirname() { printf 'dirname\\n' >> "$counter"; command dirname "$@"; }
basename() { printf 'basename\\n' >> "$counter"; command basename "$@"; }
for rel in '' . .. /absolute .vulpora .vulpora/leaf a/../leaf a//leaf leaf/ 'a b' 한글; do
  if receipt_remove_relative "$project" "$rel" "$state/expected"; then exit 1; fi
done
[ "$(cat "$project/leaf")" = keep ]
[ ! -s "$counter" ]
`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
process.exitCode = failures ? 1 : 0;
NODE
