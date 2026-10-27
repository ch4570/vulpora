#!/usr/bin/env bash
# Offline bookkeeping and workflow contract checks; no model invocation.
set -euo pipefail
SKILL_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
node --test "$SKILL_ROOT/tests/refine.test.js"
node - "$SKILL_ROOT" <<'NODE'
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = process.argv[2], read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const entry = read('SKILL.md');
assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(entry), 'control characters in entry');
assert.match(entry, /\*\*answer-free\*\*/);
assert.match(entry, /Isolation is \*\*not verified\*\* by this skill/);
assert.match(entry, /keeps the key in `\.pool-key\.json` \*\*outside\*\* `pool\/`/);
assert.match(entry, /Choosing a base output means `KEEP_BASE`, a valid and common result/);
assert.match(entry, /graded \*\*after\*\* selection, never during it/);
assert.match(entry, /Stop here unless the user authorized applying/);
for (const brief of ['execute', 'propose-inv', 'propose-dom', 'compose', 'select', 'reflect']) {
  const rel = `reference/missions/${brief}.md`;
  assert.ok(entry.includes(`(${rel})`), `${rel} is linked from SKILL.md`);
  const body = read(rel);
  assert.ok(!/must_find|must_not_claim|pass_threshold|outcome_score/.test(body), `${rel} carries no grader vocabulary`);
}
assert.match(read('reference/missions/select.md'), /Choosing an output of the unmodified harness is a valid and expected outcome/);
assert.match(read('reference/missions/reflect.md'), /The selection is not the verdict on the edits/);
assert.match(read('reference/missions/execute.md'), /Do not improve, critique or edit `harness\/`/);
const index = read('reference/kb/INDEX.md');
for (const topic of fs.readdirSync(path.join(root, 'reference/kb')).filter(f => f !== 'INDEX.md')) {
  assert.ok(index.includes(`(${topic})`), `${topic} is discoverable from INDEX.md`);
  assert.match(read(`reference/kb/${topic}`), /^## 리뷰 훅/m, `${topic} has a review hook section`);
}
NODE
printf 'harness-refine contract: PASS\n'
