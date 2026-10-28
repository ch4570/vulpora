#!/usr/bin/env node
'use strict';
// Turn one load-test run into evidence: k6 `--out json` points (NDJSON), the
// frozen test plan, and optional server-side metric samples become summary.json
// and an offline Korean HTML report with latency breakdown, saturation point and
// evidence-backed bottleneck hypotheses. It never generates load, calls the
// target, or opens a browser.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const PLAN_SCHEMA = 'vulpora.load-plan/v1';
const SERVER_SCHEMA = 'vulpora.server-metrics/v1';
const PHASES = ['http_req_blocked', 'http_req_connecting', 'http_req_tls_handshaking', 'http_req_sending', 'http_req_waiting', 'http_req_receiving'];
const PHASE_LABEL = {
  http_req_blocked: '연결 대기(blocked)', http_req_connecting: 'TCP 연결', http_req_tls_handshaking: 'TLS 핸드셰이크',
  http_req_sending: '요청 전송', http_req_waiting: '서버 처리(TTFB)', http_req_receiving: '응답 수신',
};
const MAX_BUCKETS = 300;

class ReportError extends Error {}
const fail = (code, details = []) => { const error = new ReportError(code); error.details = details; throw error; };
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
const round = (value, digits = 1) => (value === null || value === undefined || Number.isNaN(value) ? null : Number(value.toFixed(digits)));
// k6 timestamps carry nanoseconds; Date.parse needs at most milliseconds.
const parseTime = text => Date.parse(String(text).replace(/(\.\d{3})\d+/, '$1'));

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank];
}
function stats(values) {
  const sorted = Float64Array.from(values).sort();
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length, avg: round(sorted.length ? sum / sorted.length : null), min: round(sorted[0] ?? null),
    p50: round(percentile(sorted, 50)), p90: round(percentile(sorted, 90)), p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)), max: round(sorted[sorted.length - 1] ?? null),
  };
}
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 5) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

function validatePlan(plan) {
  const problems = [];
  if (!plan || plan.schema !== PLAN_SCHEMA) problems.push(`plan.schema must be ${PLAN_SCHEMA}`);
  if (!plan || !plan.target || !plan.target.baseUrl) problems.push('plan.target.baseUrl is required');
  if (!plan || !plan.target || !['local', 'ephemeral', 'dedicated-test', 'authorized-shared'].includes(plan.target.environment)) {
    problems.push('plan.target.environment must be local, ephemeral, dedicated-test or authorized-shared');
  }
  if (plan && plan.target && plan.target.environment === 'authorized-shared' && !plan.target.authorization) {
    problems.push('plan.target.authorization is required for an authorized-shared target');
  }
  if (!plan || !plan.workload || !plan.workload.model) problems.push('plan.workload.model (open or closed) is required');
  if (problems.length) fail('INVALID_PLAN', problems);
}

async function readK6(file) {
  const run = {start: Infinity, end: -Infinity, points: 0, skipped: 0};
  const duration = [], phases = Object.fromEntries(PHASES.map(name => [name, []]));
  const endpoints = new Map(), samples = [], vus = [], dropped = [];
  const lines = readline.createInterface({input: fs.createReadStream(file), crlfDelay: Infinity});
  for await (const line of lines) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { run.skipped++; continue; }
    // Metric rows are written when a metric is first seen, so their `tainted`
    // flag does not reflect the final threshold result; the k6 exit code does.
    if (row.type !== 'Point' || !row.data) continue;
    const time = parseTime(row.data.time), value = Number(row.data.value), tags = row.data.tags || {};
    if (!Number.isFinite(time) || !Number.isFinite(value)) { run.skipped++; continue; }
    run.points++; run.start = Math.min(run.start, time); run.end = Math.max(run.end, time);
    if (row.metric === 'vus') { vus.push([time, value]); continue; }
    if (row.metric === 'dropped_iterations') { dropped.push([time, value]); continue; }
    if (phases[row.metric]) { phases[row.metric].push(value); continue; }
    if (row.metric !== 'http_req_duration') continue;
    const key = tags.name || `${tags.method || ''} ${tags.url || ''}`.trim() || '(unnamed)';
    const failed = tags.expected_response === 'false' || (tags.status !== undefined && (Number(tags.status) >= 400 || Number(tags.status) === 0));
    duration.push(value);
    samples.push([time, value, failed ? 1 : 0]);
    if (!endpoints.has(key)) endpoints.set(key, {durations: [], failed: 0, statuses: {}});
    const ep = endpoints.get(key);
    ep.durations.push(value); if (failed) ep.failed++;
    ep.statuses[tags.status || '?'] = (ep.statuses[tags.status || '?'] || 0) + 1;
  }
  if (!duration.length) fail('NO_HTTP_SAMPLES', [`${file} has no http_req_duration points; run k6 with --out json=<file>`]);
  return {run, duration, phases, endpoints, samples, vus, dropped};
}

function readServerMetrics(file) {
  if (!file) return [];
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (doc.schema !== SERVER_SCHEMA || !Array.isArray(doc.samples)) fail('INVALID_SERVER_METRICS', [`schema must be ${SERVER_SCHEMA} with a samples array`]);
  return doc.samples.map(s => ({time: parseTime(s.time), name: String(s.name), value: Number(s.value), source: s.source || ''}))
    .filter(s => Number.isFinite(s.time) && Number.isFinite(s.value) && s.name);
}

function timeline(k6, server) {
  const span = Math.max(1, Math.ceil((k6.run.end - k6.run.start) / 1000) + 1);
  const size = Math.max(1, Math.ceil(span / MAX_BUCKETS));
  const count = Math.ceil(span / size);
  const buckets = Array.from({length: count}, (_, i) => ({t: i * size, durations: [], failed: 0, vus: null, dropped: 0}));
  const at = time => buckets[Math.min(count - 1, Math.floor((time - k6.run.start) / 1000 / size))];
  for (const [time, value, failed] of k6.samples) { const b = at(time); b.durations.push(value); b.failed += failed; }
  for (const [time, value] of k6.vus) { const b = at(time); b.vus = Math.max(b.vus ?? 0, value); }
  for (const [time, value] of k6.dropped) at(time).dropped += value;
  const series = buckets.map(b => {
    const sorted = Float64Array.from(b.durations).sort();
    return {t: b.t, rps: round(b.durations.length / size, 2), p95: round(percentile(sorted, 95)), p99: round(percentile(sorted, 99)),
      errorRate: b.durations.length ? round(b.failed / b.durations.length, 4) : null, vus: b.vus, dropped: b.dropped, server: {}};
  });
  for (const s of server) {
    const b = Math.floor((s.time - k6.run.start) / 1000 / size);
    if (b < 0 || b >= count) continue;
    const slot = series[b].server;
    slot[s.name] = Math.max(slot[s.name] ?? -Infinity, s.value);
  }
  return {bucketSeconds: size, series};
}

// The saturation point is the first bucket after warm-up where p95 doubles the
// warm-up median or the error rate exceeds 1%. It is a signal, not a capacity.
function saturation(series) {
  const loaded = series.filter(b => b.p95 !== null);
  if (loaded.length < 6) return null;
  const warm = loaded.slice(0, Math.max(3, Math.floor(loaded.length * 0.1))).map(b => b.p95).sort((a, b) => a - b);
  const baseline = warm[Math.floor(warm.length / 2)];
  const hit = loaded.slice(warm.length).find(b => b.p95 > baseline * 2 || (b.errorRate ?? 0) > 0.01);
  return hit ? {atSecond: hit.t, vus: hit.vus, rps: hit.rps, p95: hit.p95, baselineP95: baseline, errorRate: hit.errorRate,
    reason: hit.p95 > baseline * 2 ? 'p95 > 2× 초기 구간 중앙값' : '오류율 > 1%'} : {atSecond: null, baselineP95: baseline};
}

function hypotheses(summary, series) {
  const out = [];
  const add = (title, evidence, confidence, next) => out.push({title, evidence, confidence, next});
  const phases = summary.phases, total = summary.latency.avg || 1;
  const share = name => (phases[name] && phases[name].avg !== null ? phases[name].avg / total : 0);
  if (share('http_req_waiting') >= 0.7) {
    add('서버 처리 시간(TTFB)이 응답 시간 대부분을 차지한다',
      [`TTFB 평균 ${phases.http_req_waiting.avg}ms / 전체 평균 ${summary.latency.avg}ms (${Math.round(share('http_req_waiting') * 100)}%)`],
      'medium', '느린 엔드포인트의 서버 측 구간(DB 쿼리, 커넥션 풀 대기, 외부 호출)을 서버 지표·트레이스로 확인한다');
  }
  if (share('http_req_blocked') + share('http_req_connecting') + share('http_req_tls_handshaking') >= 0.2) {
    add('연결 수립 단계가 지연의 큰 몫이다',
      [`blocked+connecting+TLS 평균 합계가 전체 평균의 ${Math.round((share('http_req_blocked') + share('http_req_connecting') + share('http_req_tls_handshaking')) * 100)}%`],
      'medium', 'keep-alive 재사용, 부하 생성기 커넥션 한도, 서버 accept backlog·LB 연결 한도를 확인한다');
  }
  if (share('http_req_receiving') >= 0.2) {
    add('응답 수신이 길다(페이로드 또는 대역폭)', [`receiving 평균 ${phases.http_req_receiving.avg}ms`], 'low', '응답 크기와 압축, 부하 생성기 네트워크 대역폭을 확인한다');
  }
  if (summary.droppedIterations > 0) {
    add('부하 생성기가 목표 도착률을 내지 못했다', [`dropped_iterations ${summary.droppedIterations}회`], 'high',
      'preAllocatedVUs/maxVUs를 늘리거나 생성기를 분산한다. 이 구간의 결과는 목표 부하를 대표하지 않는다');
  }
  const worst = summary.endpoints.filter(e => e.count >= 20).sort((a, b) => b.p95 - a.p95)[0];
  if (worst && summary.latency.p95 && worst.p95 >= summary.latency.p95 * 1.5) {
    add(`가장 느린 엔드포인트: ${worst.name}`, [`p95 ${worst.p95}ms (전체 p95 ${summary.latency.p95}ms), 요청 ${worst.count}건`], 'medium', '이 엔드포인트의 쿼리 계획, N+1, 락 대기를 먼저 확인한다');
  }
  const errored = summary.endpoints.filter(e => e.errorRate > 0.01).map(e => `${e.name}: 오류율 ${(e.errorRate * 100).toFixed(2)}% (${Object.entries(e.statuses).map(([k, v]) => `${k}×${v}`).join(', ')})`);
  if (errored.length) add('오류 응답이 발생했다', errored, 'high', '오류가 시작된 시점의 서버 로그와 상태 코드(429/503/504 등)를 대조한다');
  if (summary.saturation && summary.saturation.atSecond !== null) {
    add('포화 지점이 관측되었다', [`${summary.saturation.atSecond}초 시점 VU ${summary.saturation.vus ?? '?'}, RPS ${summary.saturation.rps}, p95 ${summary.saturation.p95}ms (초기 ${summary.saturation.baselineP95}ms) — ${summary.saturation.reason}`],
      'medium', '이 시점에 함께 오른 서버 지표(아래 상관관계)를 병목 후보로 본다');
  }
  for (const c of summary.correlations.filter(c => Math.abs(c.r) >= 0.7).slice(0, 3)) {
    add(`서버 지표 ${c.name}이(가) p95와 함께 움직인다`, [`피어슨 r = ${c.r} (${c.points}개 구간), 최대 ${c.max}`], 'low',
      '상관은 인과가 아니다. 해당 자원(풀 크기, CPU, GC)을 조정한 재실행으로 확인한다');
  }
  if (!out.length) add('뚜렷한 병목 신호가 없다', ['연결·처리·수신 구간과 오류율, 포화 신호가 모두 기준 미만'], 'medium', '부하를 단계적으로 올린 재실행으로 한계를 찾는다');
  return out;
}

function evaluateSlo(plan, summary) {
  const slo = plan.slo || {};
  const checks = [];
  if (slo.p95Ms !== undefined) checks.push({name: `p95 ≤ ${slo.p95Ms}ms`, actual: `${summary.latency.p95}ms`, pass: summary.latency.p95 <= slo.p95Ms});
  if (slo.p99Ms !== undefined) checks.push({name: `p99 ≤ ${slo.p99Ms}ms`, actual: `${summary.latency.p99}ms`, pass: summary.latency.p99 <= slo.p99Ms});
  if (slo.errorRate !== undefined) checks.push({name: `오류율 ≤ ${(slo.errorRate * 100).toFixed(2)}%`, actual: `${(summary.errorRate * 100).toFixed(2)}%`, pass: summary.errorRate <= slo.errorRate});
  if (slo.minRps !== undefined) checks.push({name: `처리량 ≥ ${slo.minRps} RPS`, actual: `${summary.rps} RPS`, pass: summary.rps >= slo.minRps});
  return checks;
}

function chart(series, key, label, color, unit) {
  const points = series.filter(b => b[key] !== null && b[key] !== undefined);
  if (points.length < 2) return '';
  const w = 560, h = 160, pad = 32;
  const maxX = series[series.length - 1].t || 1, maxY = Math.max(...points.map(b => b[key])) || 1;
  const x = t => pad + (t / maxX) * (w - pad * 2), y = v => h - pad + 8 - (v / maxY) * (h - pad * 1.5);
  const d = points.map((b, i) => `${i ? 'L' : 'M'}${x(b.t).toFixed(1)},${y(b[key]).toFixed(1)}`).join(' ');
  return `<figure class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
<line x1="${pad}" y1="${h - pad + 8}" x2="${w - pad}" y2="${h - pad + 8}" class="axis"/><line x1="${pad}" y1="8" x2="${pad}" y2="${h - pad + 8}" class="axis"/>
<text x="${pad + 4}" y="18" class="tick">${esc(round(maxY, 2))}${esc(unit)}</text><text x="${w - pad}" y="${h - 6}" class="tick" text-anchor="end">${esc(maxX)}s</text>
<path d="${d}" fill="none" stroke="${color}" stroke-width="2"/></svg><figcaption>${esc(label)}</figcaption></figure>`;
}

const CSS = `:root{--bg:#fff;--fg:#1b1f24;--muted:#57606a;--line:#d0d7de;--card:#f6f8fa;--ok:#1a7f37;--bad:#cf222e;--warn:#9a6700}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8d96a0;--line:#30363d;--card:#161b22;--ok:#3fb950;--bad:#f85149;--warn:#d29922}}
*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:1200px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:24px 0 8px}.muted{color:var(--muted)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px}.card b{display:block;font-size:20px}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}th,td{border:1px solid var(--line);padding:4px 8px;text-align:left}td.num{text-align:right;font-variant-numeric:tabular-nums}
.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
.chart{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px}.chart svg{width:100%;height:auto}.axis{stroke:var(--line)}.tick{fill:var(--muted);font-size:11px}
.hyp{border:1px solid var(--line);border-left:4px solid var(--warn);border-radius:6px;padding:8px 12px;margin:8px 0;background:var(--card)}.bar{display:inline-block;height:10px;background:var(--warn);border-radius:2px;vertical-align:middle}`;

function renderHtml(plan, summary, tl) {
  const pass = summary.slo.every(c => c.pass);
  const verdict = summary.slo.length ? (pass ? '<span class="ok">✓ SLO 충족</span>' : '<span class="bad">✕ SLO 미달</span>') : '<span class="warn">? SLO 미정</span>';
  const num = v => (v === null || v === undefined ? '–' : esc(v));
  const phaseRows = PHASES.map(name => {
    const s = summary.phases[name], pct = s && s.avg !== null && summary.latency.avg ? Math.round((s.avg / summary.latency.avg) * 100) : 0;
    return `<tr><td>${esc(PHASE_LABEL[name])}</td><td class="num">${num(s && s.avg)}</td><td class="num">${num(s && s.p95)}</td><td class="num">${num(s && s.p99)}</td><td><span class="bar" style="width:${Math.min(100, pct) * 2}px"></span> ${pct}%</td></tr>`;
  }).join('');
  const epRows = summary.endpoints.map(e => `<tr><td>${esc(e.name)}</td><td class="num">${e.count}</td><td class="num ${e.errorRate > 0.01 ? 'bad' : ''}">${(e.errorRate * 100).toFixed(2)}%</td><td class="num">${num(e.p50)}</td><td class="num">${num(e.p95)}</td><td class="num">${num(e.p99)}</td><td class="num">${num(e.max)}</td><td>${esc(Object.entries(e.statuses).map(([k, v]) => `${k}×${v}`).join(', '))}</td></tr>`).join('');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>부하 테스트 보고서 ${esc(plan.name || '')}</title><style>${CSS}</style></head><body><main>
<h1>부하 테스트 보고서 ${verdict}</h1>
<p class="muted">${esc(plan.name || '')} · 대상 ${esc(plan.target.baseUrl)} (${esc(plan.target.environment)}) · 도구 ${esc(plan.tool || 'k6')} · 모델 ${esc(plan.workload.model)} · ${esc(summary.startedAt)} 부터 ${esc(summary.durationSeconds)}초</p>
<h2>부하 설정</h2><pre>${esc(JSON.stringify(plan.workload, null, 2))}</pre>
<div class="cards">
<div class="card"><span class="muted">총 요청</span><b>${summary.requests}</b></div>
<div class="card"><span class="muted">평균 처리량</span><b>${summary.rps} RPS</b></div>
<div class="card"><span class="muted">응답 성공률</span><b class="${summary.errorRate > 0.01 ? 'bad' : 'ok'}">${((1 - summary.errorRate) * 100).toFixed(2)}%</b></div>
<div class="card"><span class="muted">p50 / p95</span><b>${num(summary.latency.p50)} / ${num(summary.latency.p95)}ms</b></div>
<div class="card"><span class="muted">p99 / 최대</span><b>${num(summary.latency.p99)} / ${num(summary.latency.max)}ms</b></div>
<div class="card"><span class="muted">최대 VU</span><b>${num(summary.maxVus)}</b></div>
<div class="card"><span class="muted">누락 반복</span><b class="${summary.droppedIterations ? 'bad' : ''}">${summary.droppedIterations}</b></div>
</div>
${summary.slo.length ? `<h2>SLO 판정</h2><table><thead><tr><th>기준</th><th>실측</th><th>결과</th></tr></thead><tbody>${summary.slo.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${esc(c.actual)}</td><td class="${c.pass ? 'ok' : 'bad'}">${c.pass ? '✓ 충족' : '✕ 미달'}</td></tr>`).join('')}</tbody></table>` : ''}
<h2>시간 흐름 (${tl.bucketSeconds}초 구간)</h2><div class="charts">
${chart(tl.series, 'rps', '처리량 (RPS)', '#2f81f7', '')}${chart(tl.series, 'p95', 'p95 응답 시간 (ms)', '#d29922', 'ms')}
${chart(tl.series, 'errorRate', '오류율', '#f85149', '')}${chart(tl.series, 'vus', '활성 VU', '#3fb950', '')}</div>
<h2>병목 분석</h2>${summary.hypotheses.map(h => `<div class="hyp"><b>${esc(h.title)}</b> <span class="muted">확신도 ${esc(h.confidence)}</span><ul>${h.evidence.map(e => `<li>${esc(e)}</li>`).join('')}</ul><p class="muted">다음 확인: ${esc(h.next)}</p></div>`).join('')}
<h2>지연 구간 분해</h2><table><thead><tr><th>구간</th><th>평균(ms)</th><th>p95</th><th>p99</th><th>평균 대비 비중</th></tr></thead><tbody>${phaseRows}</tbody></table>
<h2>엔드포인트별</h2><table><thead><tr><th>엔드포인트</th><th>요청</th><th>오류율</th><th>p50</th><th>p95</th><th>p99</th><th>최대</th><th>상태 코드</th></tr></thead><tbody>${epRows}</tbody></table>
${summary.correlations.length ? `<h2>서버 지표 상관관계 (p95 대비)</h2><table><thead><tr><th>지표</th><th>r</th><th>최대</th><th>구간 수</th></tr></thead><tbody>${summary.correlations.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${c.r}</td><td class="num">${c.max}</td><td class="num">${c.points}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">서버 측 지표가 제공되지 않아 상관관계 분석을 생략했다.</p>'}
${summary.k6ExitCode === 99 ? '<p class="bad">k6 종료 코드 99: 스크립트의 threshold가 실패했다.</p>' : summary.k6ExitCode ? `<p class="bad">k6 종료 코드 ${esc(summary.k6ExitCode)}: 실행이 정상 종료되지 않았다.</p>` : ''}
<p class="muted">백분위수는 원시 샘플에서 계산했다(nearest-rank). 포화 지점은 초기 구간 대비 p95 2배 또는 오류율 1% 초과로 판정한 신호이며 용량 한계의 증명이 아니다. 상관관계는 인과가 아니다.${summary.skippedLines ? ` 해석하지 못한 줄 ${summary.skippedLines}개.` : ''}</p>
</main></body></html>
`;
}

async function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[String(argv[i]).replace(/^--/, '')] = argv[i + 1];
  if (!args.plan || !args['k6-json'] || !args.out) fail('USAGE', ['build-load-report.js --plan <plan.json> --k6-json <k6 --out json file> [--server-metrics <file>] [--k6-exit-code <n>] --out <empty dir>']);
  const plan = JSON.parse(fs.readFileSync(args.plan, 'utf8'));
  validatePlan(plan);
  const outDir = path.resolve(args.out);
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) fail('OUT_NOT_EMPTY', [outDir]);
  const k6 = await readK6(args['k6-json']);
  const server = readServerMetrics(args['server-metrics']);
  const tl = timeline(k6, server);
  const durationSeconds = round((k6.run.end - k6.run.start) / 1000, 1) || 1;
  const failed = k6.samples.reduce((n, s) => n + s[2], 0);
  const names = [...new Set(server.map(s => s.name))];
  const correlations = names.map(name => {
    const pairs = tl.series.filter(b => b.p95 !== null && b.server[name] !== undefined);
    const r = pearson(pairs.map(b => b.server[name]), pairs.map(b => b.p95));
    return r === null ? null : {name, r: round(r, 2), points: pairs.length, max: round(Math.max(...pairs.map(b => b.server[name])), 2)};
  }).filter(Boolean).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const summary = {
    schema: 'vulpora.load-summary/v1', startedAt: new Date(k6.run.start).toISOString(), durationSeconds,
    requests: k6.duration.length, rps: round(k6.duration.length / durationSeconds, 2), errorRate: round(failed / k6.duration.length, 4),
    latency: stats(k6.duration), phases: Object.fromEntries(PHASES.map(name => [name, k6.phases[name].length ? stats(k6.phases[name]) : null])),
    endpoints: [...k6.endpoints.entries()].map(([name, ep]) => ({name, ...stats(ep.durations), errorRate: round(ep.failed / ep.durations.length, 4), statuses: ep.statuses}))
      .sort((a, b) => b.p95 - a.p95),
    maxVus: k6.vus.length ? k6.vus.reduce((max, v) => Math.max(max, v[1]), 0) : null,
    droppedIterations: k6.dropped.reduce((n, d) => n + d[1], 0),
    k6ExitCode: args['k6-exit-code'] === undefined ? null : Number(args['k6-exit-code']), skippedLines: k6.run.skipped, correlations,
  };
  summary.saturation = saturation(tl.series);
  summary.slo = evaluateSlo(plan, summary);
  summary.hypotheses = hypotheses(summary, tl.series);
  fs.mkdirSync(outDir, {recursive: true});
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify({...summary, timeline: tl}, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'index.html'), renderHtml(plan, summary, tl));
  return {report: path.join(outDir, 'index.html'), summary: path.join(outDir, 'summary.json'), requests: summary.requests,
    p95: summary.latency.p95, error_rate: summary.errorRate, slo_pass: summary.slo.length ? summary.slo.every(c => c.pass) : null,
    hypotheses: summary.hypotheses.map(h => h.title)};
}

if (require.main === module) {
  main(process.argv.slice(2)).then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
    if (!(error instanceof ReportError)) { process.stderr.write(`${error.stack}\n`); process.exit(1); }
    process.stderr.write(`${error.message}\n${(error.details || []).map(d => `  - ${d}`).join('\n')}\n`);
    process.exit(2);
  });
}

module.exports = {main, stats, percentile, saturation, pearson, parseTime};
