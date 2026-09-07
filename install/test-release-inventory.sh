#!/usr/bin/env bash
# Offline inventory gate: source hygiene, actual npm contents, protected test
# inputs, and local links in release documentation. Does not run lifecycle hooks.
set -eu
set -o pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
node - "$ROOT" <<'NODE'
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = process.argv[2];
const failures = [];
const fail = message => failures.push(message);
const command = (program, args) => cp.execFileSync(program, args, {
  cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, npm_config_offline: 'true' }
});
function walk(relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    if (['.git', 'node_modules'].includes(entry.name)) return [];
    const name = path.posix.join(relative, entry.name);
    return entry.isDirectory() ? walk(name) : [name];
  });
}
let gitRoot = '';
try { gitRoot = command('git', ['rev-parse', '--show-toplevel']).trim(); } catch {}
function existsAsEntry(name) {
  try { fs.lstatSync(path.join(root, name)); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
const source = [...new Set(gitRoot === root
  ? command('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)
  : walk())].filter(existsAsEntry);
if (!source.length) throw new Error('NOT_RUN: empty source inventory');
const isGenerated = name =>
  /(?:^|\/)(?:node_modules|__pycache__|\.pytest_cache|\.mypy_cache|\.cache|\.nyc_output|dist|coverage)(?:\/|$)/.test(name) ||
  /(?:^|\/)(?:\.DS_Store|Thumbs\.db)$/.test(name) ||
  /\.(?:py[cod]|tsbuildinfo|log|tmp|bak|orig|rej|tgz|sw[op])$|~$/.test(name) ||
  /^(?:\.vulpora|\.agent-runtime|\.codex|\.claude|\.opencode|test-report|test-results|playwright-report)\//.test(name) ||
  (name.startsWith('evals/behavioral/results/') && name !== 'evals/behavioral/results/.gitkeep');
for (const name of source) {
  if (isGenerated(name)) fail(`generated file in source inventory: ${name}`);
  if (fs.lstatSync(path.join(root, name)).isSymbolicLink()) fail(`source symlink requires explicit distribution review: ${name}`);
}

let pack;
try {
  const entries = JSON.parse(command('npm', ['pack', '--ignore-scripts', '--dry-run', '--json', '--offline']));
  if (entries.length !== 1 || !Array.isArray(entries[0].files) || entries[0].files.length === 0) throw new Error('empty package');
  pack = entries[0];
} catch {
  throw new Error('NOT_RUN: unable to resolve an actual offline npm inventory');
}
const packaged = new Set(pack.files.map(file => file.path));
for (const name of packaged) {
  if (path.posix.isAbsolute(name) || name.split('/').includes('..')) fail(`unsafe package path: ${name}`);
  if (isGenerated(name)) fail(`generated file in npm package: ${name}`);
  if (name.startsWith('docs/security/raw/')) fail(`repository-only scanner payload in npm package: ${name}`);
}
// These "result", "report", and transcript-like files are regression inputs,
// not disposable execution output. Preserve them in source and distribution.
const protectedFixtures = [
  'evals/behavioral/fixtures/repos/sample-backend-test-author/tests/test_smoke.py',
  'evals/behavioral/fixtures/harness-incidents/incidents.json',
  'evals/behavioral/cases/e2e-report-renderer/fixtures/masking-xss/test-report/e2e/run-43/result.json',
  'evals/behavioral/cases/e2e-report-renderer/fixtures/masking-xss/test-report/e2e/run-43/result.done',
  'skills/test-quality-review/tests/fixtures/valid/review-report.json',
  'install/fixtures/smart-routing/positive-transient-effect-none.json',
  'skills/start-task/reference/kb/orchestration-report.valid.json'
];
for (const name of protectedFixtures) {
  if (!fs.existsSync(path.join(root, name))) fail(`required regression fixture missing from source: ${name}`);
  if (!packaged.has(name)) fail(`required regression fixture missing from npm package: ${name}`);
}

function hasPackagedTarget(name) {
  name = name.replace(/\/+$/, '');
  if (name === '.') return packaged.size > 0;
  return packaged.has(name) || [...packaged].some(file => file.startsWith(`${name}/`));
}
let documentCount = 0;
let localLinks = 0;
for (const name of packaged) {
  // Skill instructions can refer to files in the installation target project.
  // Validate the product/release docs here, not those dynamic runtime paths.
  if (!name.endsWith('.md') || !(name.startsWith('docs/') || !name.includes('/'))) continue;
  documentCount++;
  let fence = false;
  const lines = fs.readFileSync(path.join(root, name), 'utf8').split('\n');
  for (let index = 0; index < lines.length; index++) {
    if (/^\s*(```|~~~)/.test(lines[index])) { fence = !fence; continue; }
    if (fence) continue;
    const line = lines[index].replace(/`[^`]*`/g, '');
    const links = /\[[^\]\n]*\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g;
    for (const match of line.matchAll(links)) {
      let target = match[1].replace(/^<|>$/g, '').split('#')[0].split('?')[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//') || /[{}<>$]/.test(target)) continue;
      try { target = decodeURIComponent(target); } catch { fail(`invalid link encoding: ${name}:${index + 1}`); continue; }
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), target));
      localLinks++;
      if (resolved.startsWith('../') || path.posix.isAbsolute(target) || !hasPackagedTarget(resolved)) {
        fail(`broken npm documentation link: ${name}:${index + 1} -> ${target}`);
      }
    }
  }
}
if (!documentCount || !localLinks) fail('NOT_RUN: release documentation link inventory is empty');
if (failures.length) {
  process.stderr.write(failures.join('\n') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`release inventory: PASS source_files=${source.length} package_files=${packaged.size} protected_fixtures=${protectedFixtures.length} release_docs=${documentCount} local_links=${localLinks}\n`);
}
NODE
