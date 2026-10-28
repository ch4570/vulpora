'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {main, verdict, isReadOnlyQuery, mask} = require('../scripts/render-evidence-report.js');
const overlay = require('../scripts/write-playwright-evidence-config.js');

function workspace(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-evidence-')));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = (rel, body) => { const target = path.join(dir, rel); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, body); return target; };
  return {dir, file};
}

const browserCase = (over = {}) => ({
  id: 'TC-ORDER-001', title: '주문 취소', priority: 'P0', lane: 'browser', status: 'PASS', durationMs: 900,
  steps: ['상세 이동', '취소 클릭'], expected: 'status = CANCELLED', actual: '취소됨 표시',
  media: [{kind: 'video', path: 'pw/video.webm'}, {kind: 'screenshot', path: 'pw/after.png', caption: '취소 후'}],
  http: [{method: 'POST', url: '/orders/1/cancel', status: 200, durationMs: 30, responseBody: {status: 'CANCELLED', email: 'kim@example.com'}}],
  db: [{name: '상태', query: 'SELECT id, status FROM orders WHERE id = 1', expected: 'CANCELLED', rows: [{id: 1, status: 'CANCELLED'}], status: 'PASS'}],
  cleanup: {status: 'PASS', absenceProbe: 'count = 0'},
  ...over,
});

function evidence(cases) {
  return {schema: 'vulpora.e2e-evidence/v1', run: {id: 'e2e-test-1', startedAt: '2026-10-28T10:00:00Z', finishedAt: '2026-10-28T10:01:00Z'}, cases};
}

function renderWith(t, cases, media = true) {
  const w = workspace(t);
  if (media) { w.file('pw/video.webm', 'webm'); w.file('pw/after.png', 'png'); }
  const evidenceFile = w.file('evidence.json', JSON.stringify(evidence(cases)));
  const result = main(['--evidence', evidenceFile, '--out', path.join(w.dir, 'report')]);
  return {...w, result, html: fs.readFileSync(result.report, 'utf8')};
}

const rejects = (fn, code, detail) => assert.throws(fn, error => {
  assert.equal(error.message, code);
  if (detail) assert.ok(error.details.some(d => detail.test(d)), `${error.details.join('; ')} should match ${detail}`);
  return true;
});

test('renders a passing browser case with copied media, DB rows and masking', t => {
  const {dir, result, html} = renderWith(t, [browserCase()]);
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.media_missing, 0);
  assert.ok(fs.existsSync(path.join(dir, 'report', 'assets', 'TC-ORDER-001', '1-video.webm')));
  assert.match(html, /<video controls preload="metadata" src="assets\/TC-ORDER-001\/1-video.webm">/);
  assert.match(html, /SELECT id, status FROM orders WHERE id = 1/);
  assert.match(html, /&lt;MASK:email&gt;/);
  assert.ok(!html.includes('kim@example.com'));
  assert.ok(!/(src|href)="https?:/.test(html), 'no external resources');
  assert.match(html, /<html lang="ko">/);
});

test('escapes HTML in evidence text', t => {
  const {html} = renderWith(t, [browserCase({actual: '<img src=x onerror=alert(1)>'})]);
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('a PASS case with a failed DB check is rejected', t => {
  const db = [{name: '상태', query: 'SELECT status FROM orders WHERE id = 1', expected: 'CANCELLED', rows: [{status: 'PLACED'}], status: 'FAIL'}];
  rejects(() => renderWith(t, [browserCase({db})]), 'INVALID_EVIDENCE', /DB check is not PASS/);
});

test('a browser PASS without a video is rejected', t => {
  rejects(() => renderWith(t, [browserCase({media: [{kind: 'screenshot', path: 'pw/after.png'}]})]), 'INVALID_EVIDENCE', /without a video/);
});

test('a PASS case without proven cleanup is rejected', t => {
  rejects(() => renderWith(t, [browserCase({cleanup: {status: 'FAIL'}})]), 'INVALID_EVIDENCE', /cleanup is not PASS/);
});

test('write queries and multi-statement queries are rejected', t => {
  for (const query of ['UPDATE orders SET status = 1 WHERE id = 1', 'SELECT 1; DELETE FROM orders', 'SELECT * FROM orders WHERE id = 1 FOR UPDATE', 'WITH x AS (DELETE FROM orders RETURNING id) SELECT * FROM x']) {
    assert.equal(isReadOnlyQuery(query), false, query);
  }
  assert.equal(isReadOnlyQuery("SELECT id FROM orders WHERE note = 'drop; update' AND id = 1"), true);
  const db = [{name: 'x', query: 'DELETE FROM orders WHERE id = 1', expected: '', rows: [], status: 'PASS'}];
  rejects(() => renderWith(t, [browserCase({status: 'FAIL', db})]), 'INVALID_EVIDENCE', /read-only SELECT/);
});

test('media outside the evidence directory is refused', t => {
  rejects(() => renderWith(t, [browserCase({media: [{kind: 'video', path: '../outside.webm'}]})]), 'MEDIA_OUTSIDE_EVIDENCE');
});

test('missing media degrades with a notice instead of failing', t => {
  const {result, html} = renderWith(t, [browserCase({status: 'FAIL'})], false);
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.media_missing, 2);
  assert.match(html, /파일 없음/);
});

test('refuses to write into a non-empty output directory', t => {
  const w = workspace(t);
  w.file('report/old.html', 'x');
  const evidenceFile = w.file('evidence.json', JSON.stringify(evidence([browserCase({status: 'NOT_RUN', media: []})])));
  rejects(() => main(['--evidence', evidenceFile, '--out', path.join(w.dir, 'report')]), 'OUT_NOT_EMPTY');
});

test('verdict precedence', () => {
  const c = (priority, status) => ({priority, status});
  assert.equal(verdict([c('P0', 'BLOCKED'), c('P1', 'FAIL')]), 'BLOCKED');
  assert.equal(verdict([c('P0', 'PASS'), c('P1', 'FAIL')]), 'FAIL');
  assert.equal(verdict([c('P0', 'NOT_RUN'), c('P1', 'PASS')]), 'INCONCLUSIVE');
  assert.equal(verdict([c('P0', 'PASS'), c('P2', 'NOT_RUN')]), 'PARTIAL');
  assert.equal(verdict([c('P0', 'PASS'), c('P1', 'PASS')]), 'PASS');
});

test('masks tokens, phone numbers and secret fields', () => {
  const text = mask('{"password":"hunter2","phone":"010-1234-5678"} Authorization: Bearer abc.def.ghi');
  assert.ok(!/hunter2|1234-5678|abc\.def/.test(text), text);
});

test('playwright overlay re-anchors base paths and stays outside the repository', t => {
  const w = workspace(t);
  w.file('repo/playwright.config.ts', "export default { testDir: './e2e', projects: [{ name: 'chromium' }] };\n");
  const out = overlay.main(['--repo', path.join(w.dir, 'repo'), '--evidence-dir', path.join(w.dir, 'evidence')]);
  const body = fs.readFileSync(out.config, 'utf8');
  assert.match(body, /video: 'on', screenshot: 'on'/);
  assert.match(body, /retries: 0/);
  assert.match(body, /testDir: anchor\(base\.testDir/);
  assert.ok(out.config.startsWith(path.join(w.dir, 'evidence')));
  assert.throws(() => overlay.main(['--repo', path.join(w.dir, 'repo'), '--evidence-dir', path.join(w.dir, 'repo', 'evidence')]), /EVIDENCE_DIR_INSIDE_REPO/);
});
