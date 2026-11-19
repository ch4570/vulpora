#!/usr/bin/env bash
# Offline renderer, overlay and workflow contract checks; no browser, database or model.
set -euo pipefail
SKILL_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
node --test "$SKILL_ROOT/tests/render.test.js"
node - "$SKILL_ROOT" <<'NODE'
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = process.argv[2], read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const entry = read('SKILL.md');
assert.match(entry, /^name: e2e-evidence-report$/m);
assert.match(entry, /\*\*outside the repository\*\*/);
assert.match(entry, /`e2e-test-workflow`/);
assert.match(entry, /\*\*run-owned\*\* database/);
assert.match(entry, /inside a read-only transaction/);
assert.match(entry, /A DB assertion failure makes the case `FAIL`/);
assert.match(entry, /Do not open a browser/);
for (const rel of ['reference/principles.md', 'reference/evidence-schema.md', 'reference/kb/INDEX.md', 'reference/kb/db-state-verification.md']) {
  assert.ok(entry.includes(`(${rel})`), `${rel} is linked from SKILL.md`);
}
const index = read('reference/kb/INDEX.md');
for (const topic of fs.readdirSync(path.join(root, 'reference/kb')).filter(f => f !== 'INDEX.md')) {
  assert.ok(index.includes(`(${topic})`), `${topic} is discoverable from INDEX.md`);
  const body = read(`reference/kb/${topic}`);
  assert.match(body, /^source: https:\/\//m, `${topic} cites a source`);
  assert.match(body, /^## 리뷰 훅/m, `${topic} has a review hook section`);
}
const pw = fs.readFileSync(path.join(root, '..', 'playwright-e2e', 'SKILL.md'), 'utf8');
assert.match(pw, /PW-7\.1 \(Evidence mode\)/);
NODE
printf 'e2e-evidence-report contract: PASS\n'
