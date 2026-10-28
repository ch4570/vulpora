#!/usr/bin/env bash
# Offline report-builder and agent contract checks; no load is generated.
set -euo pipefail
BUNDLE="$(cd "$(dirname "$0")/.." && pwd -P)"
node --test "$BUNDLE/tests/build-load-report.test.js"
node - "$BUNDLE" <<'NODE'
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const bundle = process.argv[2], read = rel => fs.readFileSync(path.join(bundle, rel), 'utf8');
const agent = fs.readFileSync(path.join(bundle, '..', 'load-test-engineer.md'), 'utf8');
assert.match(agent, /^name: load-test-engineer$/m);
assert.match(agent, /### 0\) 대상 안전 게이트 \(먼저, 생략 금지\)/);
assert.match(agent, /운영 환경, 제3자·외부 SaaS 도메인, 소유가 확인되지 않은 호스트는 거부한다/);
assert.match(agent, /mktemp -d/);
assert.match(agent, /build-load-report\.js/);
for (const rel of ['SOUL.md', 'reference/principles.md', 'reference/report-contract.md', 'reference/kb/INDEX.md']) assert.ok(fs.existsSync(path.join(bundle, rel)), rel);
const index = read('reference/kb/INDEX.md');
for (const topic of fs.readdirSync(path.join(bundle, 'reference/kb')).filter(f => f !== 'INDEX.md')) {
  assert.ok(index.includes(`(${topic})`), `${topic} is discoverable from INDEX.md`);
  assert.ok(agent.includes(`reference/kb/${topic}`) || topic === 'INDEX.md', `${topic} is routed from the agent`);
  const body = read(`reference/kb/${topic}`);
  assert.match(body, /^source: https:\/\//m, `${topic} cites a source`);
  assert.match(body, /^last_fetched: \d{4}-\d{2}-\d{2}$/m, `${topic} records last_fetched`);
  assert.match(body, /^## 리뷰 훅/m, `${topic} has a review hook section`);
}
NODE
printf 'load-test-engineer contract: PASS\n'
