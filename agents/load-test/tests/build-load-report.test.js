'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {main, percentile, pearson, parseTime} = require('../scripts/build-load-report.js');

const PLAN = {schema: 'vulpora.load-plan/v1', name: 'demo', tool: 'k6', target: {baseUrl: 'http://127.0.0.1:8080', environment: 'local'},
  workload: {model: 'open', executor: 'ramping-arrival-rate'}, slo: {p95Ms: 100, errorRate: 0.01}};

function workspace(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-load-')));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = (rel, body) => { const target = path.join(dir, rel); fs.writeFileSync(target, typeof body === 'string' ? body : JSON.stringify(body)); return target; };
  return {dir, file};
}

const point = (metric, second, value, tags = {}) => JSON.stringify({type: 'Point', metric,
  data: {time: new Date(Date.UTC(2026, 9, 28, 0, 0, second)).toISOString().replace('Z', '123456+00:00'), value, tags}});

// 40 seconds: latency stays flat for 20s, then climbs with the server's pending queue.
function saturatingRun() {
  const lines = [JSON.stringify({type: 'Metric', metric: 'http_req_duration', data: {type: 'trend', contains: 'time', tainted: null}})];
  const server = [];
  for (let s = 0; s < 40; s++) {
    const slow = s < 20 ? 0 : (s - 20) * 15;
    lines.push(point('vus', s, 10 + s));
    for (let i = 0; i < 20; i++) {
      const value = 20 + slow + i;
      const status = s > 35 && i === 0 ? '503' : '200';
      const tags = {name: i % 4 ? 'GET /orders/{id}' : 'GET /orders/search', method: 'GET', status, expected_response: status === '200' ? 'true' : 'false'};
      lines.push(point('http_req_duration', s, value, tags));
      lines.push(point('http_req_waiting', s, value - 2, tags));
      lines.push(point('http_req_blocked', s, 0.1, tags));
    }
    if (s === 38) lines.push(point('dropped_iterations', s, 3));
    server.push({time: new Date(Date.UTC(2026, 9, 28, 0, 0, s)).toISOString(), name: 'hikaricp_pending', value: s < 20 ? 0 : (s - 20) * 4});
    server.push({time: new Date(Date.UTC(2026, 9, 28, 0, 0, s)).toISOString(), name: 'noise', value: (s * 7) % 5});
  }
  lines.push('not json');
  return {ndjson: `${lines.join('\n')}\n`, server: {schema: 'vulpora.server-metrics/v1', samples: server}};
}

test('builds summary and report with saturation, correlation and SLO verdict', async t => {
  const w = workspace(t), run = saturatingRun();
  const result = await main(['--plan', w.file('plan.json', PLAN), '--k6-json', w.file('k6.ndjson', run.ndjson),
    '--server-metrics', w.file('server.json', run.server), '--k6-exit-code', '99', '--out', path.join(w.dir, 'report')]);
  const summary = JSON.parse(fs.readFileSync(result.summary, 'utf8'));
  assert.equal(summary.requests, 800);
  assert.equal(summary.skippedLines, 1);
  assert.equal(summary.droppedIterations, 3);
  assert.equal(summary.maxVus, 49);
  assert.ok(summary.errorRate > 0 && summary.errorRate < 0.01);
  assert.ok(summary.saturation.atSecond >= 20 && summary.saturation.atSecond <= 24, JSON.stringify(summary.saturation));
  assert.equal(summary.correlations[0].name, 'hikaricp_pending');
  assert.ok(summary.correlations[0].r > 0.9);
  assert.equal(result.slo_pass, false);
  const titles = summary.hypotheses.map(h => h.title).join('|');
  assert.match(titles, /TTFB/);
  assert.match(titles, /목표 도착률/);
  assert.match(titles, /포화 지점/);
  assert.match(titles, /hikaricp_pending/);
  const html = fs.readFileSync(result.report, 'utf8');
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /종료 코드 99/);
  assert.match(html, /<svg viewBox/);
  assert.ok(!/(src|href)="https?:/.test(html), 'no external resources');
});

test('escapes endpoint names in HTML', async t => {
  const w = workspace(t);
  const lines = Array.from({length: 10}, (_, i) => point('http_req_duration', i, 10, {name: '<script>x</script>', status: '200'}));
  const result = await main(['--plan', w.file('plan.json', PLAN), '--k6-json', w.file('k6.ndjson', lines.join('\n')), '--out', path.join(w.dir, 'r')]);
  const html = fs.readFileSync(result.report, 'utf8');
  assert.ok(!html.includes('<script>x</script>'));
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
});

test('rejects a shared target without recorded authorization', async t => {
  const w = workspace(t);
  const plan = {...PLAN, target: {baseUrl: 'https://staging.example.com', environment: 'authorized-shared'}};
  await assert.rejects(main(['--plan', w.file('plan.json', plan), '--k6-json', w.file('k6.ndjson', point('http_req_duration', 0, 1)), '--out', path.join(w.dir, 'r')]),
    error => error.message === 'INVALID_PLAN' && error.details.some(d => /authorization/.test(d)));
});

test('rejects output without HTTP samples', async t => {
  const w = workspace(t);
  await assert.rejects(main(['--plan', w.file('plan.json', PLAN), '--k6-json', w.file('k6.ndjson', point('vus', 0, 1)), '--out', path.join(w.dir, 'r')]),
    error => error.message === 'NO_HTTP_SAMPLES');
});

test('statistics helpers', () => {
  const sorted = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(percentile(sorted, 50), 5);
  assert.equal(percentile(sorted, 95), 10);
  assert.equal(pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]), 1);
  assert.equal(pearson([1, 2], [1, 2]), null);
  assert.equal(parseTime('2026-10-28T00:00:01.123456789+09:00'), Date.parse('2026-10-28T00:00:01.123+09:00'));
});
