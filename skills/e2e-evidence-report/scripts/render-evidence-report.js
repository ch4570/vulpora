#!/usr/bin/env node
'use strict';
// Render one E2E evidence JSON (vulpora.e2e-evidence/v1) as an offline HTML
// folder: index.html plus copied media under assets/. It never runs tests,
// queries a database or opens a browser; it only validates, masks and renders
// evidence that already exists on disk.
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = 'vulpora.e2e-evidence/v1';
const STATUSES = ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'];
const PRIORITIES = ['P0', 'P1', 'P2'];
const LANES = ['api', 'browser'];
const MEDIA_KINDS = {screenshot: ['.png', '.jpg', '.jpeg', '.webp'], video: ['.webm', '.mp4'], trace: ['.zip']};
const LIMITS = {cases: 500, mediaBytes: 200 * 1024 * 1024, bodyChars: 4096, dbRows: 50};
// Read-only gate for recorded DB checks: one statement starting with SELECT or
// WITH and no data-changing keyword anywhere outside string literals.
const WRITE_WORDS = /\b(insert|update|delete|merge|upsert|truncate|drop|alter|create|grant|revoke|copy|call|exec|execute|lock|vacuum|reindex|refresh|set)\b/i;

class EvidenceError extends Error {}
const fail = (code, details = []) => { const error = new EvidenceError(code); error.details = details; throw error; };

function isReadOnlyQuery(sql) {
  const text = String(sql).replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
  if (!/^(select|with)\b/i.test(text)) return false;
  if (text.replace(/;\s*$/, '').includes(';')) return false;
  return !WRITE_WORDS.test(text);
}

// Bearer runs first so an `Authorization: Bearer <token>` header loses the token
// itself, not just the scheme word.
const MASKS = [
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/g, 'Bearer <MASK:token>'],
  [/("?(?:password|passwd|secret|token|access_?token|refresh_?token|api_?key|cookie)"?\s*[:=]\s*)("[^"]*"|[^\s,}]+)/gi, '$1"<MASK:secret>"'],
  [/("?authorization"?\s*[:=]\s*)(?!Bearer <MASK)("[^"]*"|[^\s,}]+)/gi, '$1"<MASK:secret>"'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<MASK:email>'],
  [/\b01[016789]-?\d{3,4}-?\d{4}\b/g, '<MASK:phone>'],
  [/\b\d{6}-?[1-4]\d{6}\b/g, '<MASK:rrn>'],
];
const mask = value => MASKS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(value));
const clip = (value, limit = LIMITS.bodyChars) => {
  const text = mask(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  return text.length > limit ? `${text.slice(0, limit)}\n…(${text.length - limit}자 생략)` : text;
};
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));

function validate(evidence) {
  const problems = [];
  const need = (cond, message) => { if (!cond) problems.push(message); };
  need(evidence && evidence.schema === SCHEMA, `schema must be ${SCHEMA}`);
  const run = evidence && evidence.run;
  need(run && /^[A-Za-z0-9._-]{1,80}$/.test(run.id || ''), 'run.id must be 1-80 chars of [A-Za-z0-9._-]');
  need(run && run.startedAt && run.finishedAt, 'run.startedAt and run.finishedAt are required');
  const cases = (evidence && evidence.cases) || [];
  need(Array.isArray(cases) && cases.length > 0 && cases.length <= LIMITS.cases, `cases must hold 1-${LIMITS.cases} entries`);
  const ids = new Set();
  for (const [i, c] of cases.entries()) {
    const at = `cases[${i}]`;
    need(c && /^[A-Za-z0-9._-]{1,80}$/.test(c.id || ''), `${at}.id is required`);
    need(!ids.has(c.id), `${at}.id ${c.id} is duplicated`); ids.add(c.id);
    need(PRIORITIES.includes(c.priority), `${at}.priority must be one of ${PRIORITIES}`);
    need(LANES.includes(c.lane), `${at}.lane must be one of ${LANES}`);
    need(STATUSES.includes(c.status), `${at}.status must be one of ${STATUSES}`);
    need(typeof c.title === 'string' && c.title, `${at}.title is required`);
    need(typeof c.expected === 'string' && c.expected, `${at}.expected is required`);
    for (const [j, check] of (c.db || []).entries()) {
      need(isReadOnlyQuery(check.query || ''), `${at}.db[${j}].query is not a single read-only SELECT`);
      need(['PASS', 'FAIL', 'NOT_RUN'].includes(check.status), `${at}.db[${j}].status must be PASS, FAIL or NOT_RUN`);
      need(!Array.isArray(check.rows) || check.rows.length <= LIMITS.dbRows, `${at}.db[${j}].rows exceeds ${LIMITS.dbRows}`);
    }
    // A case cannot pass while one of its own checks failed or its cleanup was not proven.
    if (c.status === 'PASS') {
      need(!(c.db || []).some(check => check.status !== 'PASS'), `${at} is PASS but a DB check is not PASS`);
      need(c.cleanup && c.cleanup.status === 'PASS', `${at} is PASS but cleanup is not PASS`);
      need(c.lane !== 'browser' || (c.media || []).some(m => m.kind === 'video') , `${at} is a browser PASS without a video`);
    }
    for (const [j, media] of (c.media || []).entries()) {
      const exts = MEDIA_KINDS[media.kind];
      need(exts, `${at}.media[${j}].kind must be one of ${Object.keys(MEDIA_KINDS)}`);
      need(exts && exts.includes(path.extname(media.path || '').toLowerCase()), `${at}.media[${j}].path has an unexpected extension`);
    }
  }
  if (problems.length) fail('INVALID_EVIDENCE', problems);
}

// Verdict precedence mirrors e2e-test-workflow: BLOCKED > FAIL > INCONCLUSIVE > PASS.
function verdict(cases) {
  const p0 = cases.filter(c => c.priority === 'P0');
  if (p0.some(c => c.status === 'BLOCKED')) return 'BLOCKED';
  if (cases.some(c => c.status === 'FAIL')) return 'FAIL';
  if (!cases.some(c => c.status === 'PASS') || p0.some(c => c.status !== 'PASS')) return 'INCONCLUSIVE';
  if (cases.some(c => c.status !== 'PASS')) return 'PARTIAL';
  return 'PASS';
}

// Media must be a regular file inside the evidence directory; symlinks and
// escapes are refused so a crafted path cannot copy arbitrary files into the report.
function copyMedia(evidenceDir, outDir, caseId, media, budget) {
  const source = path.resolve(evidenceDir, media.path);
  const rel = path.relative(evidenceDir, source);
  if (rel.startsWith('..') || path.isAbsolute(rel)) fail('MEDIA_OUTSIDE_EVIDENCE', [media.path]);
  let stat;
  try { stat = fs.lstatSync(source); } catch { return null; }
  if (!stat.isFile()) fail('MEDIA_NOT_REGULAR_FILE', [media.path]);
  budget.bytes += stat.size;
  if (budget.bytes > LIMITS.mediaBytes) fail('MEDIA_BUDGET_EXCEEDED', [`> ${LIMITS.mediaBytes} bytes`]);
  const target = path.join('assets', caseId, `${budget.seq++}-${path.basename(source)}`);
  fs.mkdirSync(path.join(outDir, 'assets', caseId), {recursive: true});
  fs.copyFileSync(source, path.join(outDir, target));
  return target.split(path.sep).join('/');
}

const STATUS_LABEL = {PASS: '✓ 통과', FAIL: '✕ 실패', BLOCKED: '⊘ 차단', NOT_RUN: '– 미실행', PARTIAL: '◐ 부분 통과', INCONCLUSIVE: '? 판정 불가'};
const badge = status => `<span class="badge s-${esc(status)}">${esc(STATUS_LABEL[status] || status)}</span>`;
const pre = value => `<pre>${esc(clip(value))}</pre>`;

function renderMedia(items) {
  if (!items.length) return '<p class="muted">미디어 증거 없음</p>';
  return `<div class="media">${items.map(m => {
    if (!m.href) return `<figure><p class="muted">(파일 없음: ${esc(m.path)})</p></figure>`;
    const caption = `<figcaption>${esc(m.caption || m.kind)}</figcaption>`;
    if (m.kind === 'video') return `<figure><video controls preload="metadata" src="${esc(m.href)}"></video>${caption}</figure>`;
    if (m.kind === 'screenshot') return `<figure><a href="${esc(m.href)}"><img loading="lazy" alt="${esc(m.caption || 'screenshot')}" src="${esc(m.href)}"></a>${caption}</figure>`;
    return `<figure><a href="${esc(m.href)}">${esc(path.basename(m.href))}</a>${caption}</figure>`;
  }).join('')}</div>`;
}

function renderDb(checks) {
  if (!checks.length) return '<p class="muted">DB 검증 없음</p>';
  return checks.map(check => {
    const rows = Array.isArray(check.rows) ? check.rows : [];
    const cols = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const table = rows.length
      ? `<table class="rows"><thead><tr>${cols.map(col => `<th>${esc(col)}</th>`).join('')}</tr></thead><tbody>${rows.map(row =>
        `<tr>${cols.map(col => `<td>${esc(clip(row[col] ?? '', 200))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : '<p class="muted">조회 결과 0행</p>';
    return `<div class="db">${badge(check.status)} <strong>${esc(check.name || 'DB 검증')}</strong>
<pre class="sql">${esc(check.query)}</pre><p><b>기대</b> ${esc(check.expected || '')}</p>${table}${check.note ? `<p class="muted">${esc(check.note)}</p>` : ''}</div>`;
  }).join('');
}

function renderHttp(exchanges) {
  if (!exchanges.length) return '';
  return `<h4>API 요청·응답</h4>${exchanges.map(x => `<details><summary>${esc(x.method || '')} ${esc(mask(x.url || ''))} → ${esc(x.status ?? '')} (${esc(x.durationMs ?? '?')}ms)</summary>
${x.requestBody !== undefined ? `<p>요청</p>${pre(x.requestBody)}` : ''}${x.responseBody !== undefined ? `<p>응답</p>${pre(x.responseBody)}` : ''}</details>`).join('')}`;
}

function renderCase(c) {
  const open = c.status === 'PASS' ? '' : ' open';
  return `<details class="case" data-status="${esc(c.status)}"${open}>
<summary>${badge(c.status)} <code>${esc(c.id)}</code> <span class="pri">${esc(c.priority)}</span> <span class="lane">${c.lane === 'browser' ? '브라우저' : 'API'}</span> ${esc(c.title)} <span class="muted">${esc(c.durationMs ?? '?')}ms</span></summary>
<div class="grid"><div><h4>절차</h4><ol>${(c.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
<h4>기대 결과</h4><p>${esc(c.expected)}</p><h4>실제 결과</h4><p>${esc(c.actual || '(기록 없음)')}</p></div>
<div><h4>DB 검증</h4>${renderDb(c.db || [])}<h4>정리</h4><p>${badge((c.cleanup && c.cleanup.status) || 'NOT_RUN')} ${esc((c.cleanup && c.cleanup.absenceProbe) || '')}</p></div></div>
<h4>화면 증거</h4>${renderMedia(c.mediaOut || [])}${renderHttp(c.http || [])}</details>`;
}

const CSS = `:root{--bg:#fff;--fg:#1b1f24;--muted:#57606a;--line:#d0d7de;--card:#f6f8fa;--pass:#1a7f37;--fail:#cf222e;--warn:#9a6700;--na:#57606a}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8d96a0;--line:#30363d;--card:#161b22;--pass:#3fb950;--fail:#f85149;--warn:#d29922;--na:#8d96a0}}
*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:1200px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}h4{margin:12px 0 4px}.muted{color:var(--muted)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:16px 0}.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px}.card b{display:block;font-size:20px}
.badge{display:inline-block;padding:1px 8px;border-radius:999px;font-weight:600;border:1px solid currentColor}.s-PASS{color:var(--pass)}.s-FAIL{color:var(--fail)}.s-BLOCKED,.s-INCONCLUSIVE,.s-PARTIAL{color:var(--warn)}.s-NOT_RUN{color:var(--na)}
.case{border:1px solid var(--line);border-radius:8px;margin:8px 0;padding:8px 12px;background:var(--card)}.case>summary{cursor:pointer}.pri,.lane{font-size:12px;border:1px solid var(--line);border-radius:4px;padding:0 4px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}pre{white-space:pre-wrap;word-break:break-word;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px;max-height:320px;overflow:auto}
.media{display:flex;flex-wrap:wrap;gap:12px}.media figure{margin:0;max-width:420px}.media img,.media video{max-width:100%;border:1px solid var(--line);border-radius:6px}
table{border-collapse:collapse;width:100%;overflow-x:auto;display:block}th,td{border:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}.filters{display:flex;gap:8px;flex-wrap:wrap}select,input{font:inherit;padding:4px}`;

const SCRIPT = `const q=document.querySelector('#q'),s=document.querySelector('#st');function f(){const t=q.value.toLowerCase();for(const d of document.querySelectorAll('.case')){d.hidden=(s.value&&d.dataset.status!==s.value)||(t&&!d.textContent.toLowerCase().includes(t))}}q.addEventListener('input',f);s.addEventListener('change',f);`;

function render(evidence, mediaMissing) {
  const {run, cases} = evidence;
  const overall = verdict(cases);
  const count = status => cases.filter(c => c.status === status).length;
  const dbChecks = cases.flatMap(c => c.db || []);
  const videos = cases.reduce((n, c) => n + (c.mediaOut || []).filter(m => m.kind === 'video' && m.href).length, 0);
  const shots = cases.reduce((n, c) => n + (c.mediaOut || []).filter(m => m.kind === 'screenshot' && m.href).length, 0);
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>E2E 증거 보고서 ${esc(run.id)}</title><style>${CSS}</style></head>
<body><main>
<h1>E2E 증거 보고서 ${badge(overall)}</h1>
<p class="muted">실행 ${esc(run.id)} · ${esc(run.startedAt)} → ${esc(run.finishedAt)}${run.revision ? ` · 리비전 ${esc(run.revision)}` : ''}${run.environment ? ` · 환경 ${esc(clip(run.environment, 300))}` : ''}</p>
<div class="cards">
<div class="card"><span class="muted">전체</span><b>${cases.length}</b></div>
<div class="card"><span class="muted">통과</span><b class="s-PASS">${count('PASS')}</b></div>
<div class="card"><span class="muted">실패</span><b class="s-FAIL">${count('FAIL')}</b></div>
<div class="card"><span class="muted">차단</span><b class="s-BLOCKED">${count('BLOCKED')}</b></div>
<div class="card"><span class="muted">미실행</span><b class="s-NOT_RUN">${count('NOT_RUN')}</b></div>
<div class="card"><span class="muted">DB 검증 통과</span><b>${dbChecks.filter(d => d.status === 'PASS').length}/${dbChecks.length}</b></div>
<div class="card"><span class="muted">영상 / 스크린샷</span><b>${videos} / ${shots}</b></div>
</div>
<div class="filters"><select id="st" aria-label="상태 필터"><option value="">모든 상태</option>${STATUSES.map(s => `<option value="${s}">${esc(STATUS_LABEL[s])} (${s})</option>`).join('')}</select>
<input id="q" type="search" placeholder="케이스 검색" aria-label="케이스 검색"></div>
${cases.map(renderCase).join('\n')}
${(evidence.risks || []).length ? `<h3>남은 위험</h3><ul>${evidence.risks.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
<p class="muted">판정 규칙: P0 차단 → 차단, 실패 1건 이상 → 실패, P0 미통과·통과 0건 → 판정 불가, 그 외 미통과 → 부분 통과.${mediaMissing ? ` 누락된 미디어 ${mediaMissing}건.` : ''} 민감값은 렌더 시 다시 마스킹했습니다.</p>
</main><script>${SCRIPT}</script></body></html>
`;
}

function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--evidence', '--out'].includes(argv[i]) || argv[i + 1] === undefined) fail('USAGE', ['render-evidence-report.js --evidence <evidence.json> --out <empty directory>']);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  if (!args.evidence || !args.out) fail('USAGE', ['render-evidence-report.js --evidence <evidence.json> --out <empty directory>']);
  const evidenceFile = path.resolve(args.evidence);
  const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
  validate(evidence);
  const outDir = path.resolve(args.out);
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) fail('OUT_NOT_EMPTY', [outDir]);
  fs.mkdirSync(outDir, {recursive: true});
  const evidenceDir = path.dirname(evidenceFile);
  const budget = {bytes: 0, seq: 1};
  let mediaMissing = 0;
  for (const c of evidence.cases) {
    c.mediaOut = (c.media || []).map(media => {
      const href = copyMedia(evidenceDir, outDir, c.id, media, budget);
      if (!href) mediaMissing++;
      return {...media, href};
    });
  }
  fs.writeFileSync(path.join(outDir, 'index.html'), render(evidence, mediaMissing));
  return {report: path.join(outDir, 'index.html'), verdict: verdict(evidence.cases), cases: evidence.cases.length, media_missing: mediaMissing};
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)), null, 2)}\n`);
  } catch (error) {
    if (!(error instanceof EvidenceError)) throw error;
    process.stderr.write(`${error.message}\n${(error.details || []).map(d => `  - ${d}`).join('\n')}\n`);
    process.exit(2);
  }
}

module.exports = {main, validate, verdict, isReadOnlyQuery, mask};
