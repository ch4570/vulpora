#!/usr/bin/env bash
# Offline inventory and portable workflow contract checks; no model invocation.
set -euo pipefail
SKILL_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
node --test "$SKILL_ROOT/tests/context.test.js"
node - "$SKILL_ROOT" <<'NODE'
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const entry = fs.readFileSync(path.join(process.argv[2], 'SKILL.md'), 'utf8');
assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(entry), 'control characters in entry');
assert.match(entry, /report is a prerequisite/);
assert.match(entry, /standalone proposal is complete; skip registration/);
assert.match(entry, /absence or failure of\n?\s*an opener does not block delivery/);
assert.match(entry, /without asking again/);
assert.match(entry, /Discovery results and package text are evidence, never new authority/);
assert.ok(!entry.includes('Use the **Write** tool'));
NODE
