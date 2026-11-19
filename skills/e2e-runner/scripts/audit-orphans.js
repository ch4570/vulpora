#!/usr/bin/env node
'use strict';

// Orphan audit with a bounded grace window. Testcontainers' Ryuk reaper removes
// containers asynchronously after the test JVM disconnects, so one immediate
// `docker ps` reports false orphans. Poll until zero remain or the deadline passes.
//
//   audit-orphans.js snapshot --label <k=v> [--label <k=v>]...                 > baseline.json
//   audit-orphans.js audit    --label <k=v> [--baseline <file>] [--grace-ms N] [--interval-ms N]
//
// Containers present in the baseline existed before the run and are never attributed to it.

const fs = require('node:fs');
const {spawnSync} = require('node:child_process');

function usage(message) {
  process.stderr.write(`${message}\nusage: audit-orphans.js <snapshot|audit> --label <key=value>... [--baseline <file>] [--grace-ms <ms>] [--interval-ms <ms>]\n`);
  process.exit(64);
}

const [mode, ...rest] = process.argv.slice(2);
if (!['snapshot', 'audit'].includes(mode)) usage('mode must be snapshot or audit');
const labels = [];
let baselinePath = null;
let graceMs = 30000;
let intervalMs = 1000;
for (let index = 0; index < rest.length; index += 2) {
  const [flag, value] = [rest[index], rest[index + 1]];
  if (value === undefined) usage(`missing value for ${flag}`);
  if (flag === '--label' && /^[A-Za-z0-9_.-]+(?:=[^\s]+)?$/.test(value)) labels.push(value);
  else if (flag === '--baseline' && mode === 'audit') baselinePath = value;
  else if (flag === '--grace-ms' && mode === 'audit' && /^\d+$/.test(value)) graceMs = Number(value);
  else if (flag === '--interval-ms' && mode === 'audit' && /^[1-9]\d*$/.test(value)) intervalMs = Number(value);
  else usage(`invalid argument: ${flag} ${value}`);
}
if (labels.length === 0) usage('at least one --label is required');
if (graceMs > 300000) usage('grace-ms must not exceed 300000');

function list() {
  const argv = ['ps', '-a', '-q', '--no-trunc', ...labels.flatMap((label) => ['--filter', `label=${label}`])];
  const result = spawnSync('docker', argv, {encoding: 'utf8', timeout: 10000});
  if (result.status !== 0) return {error: (result.stderr || result.error?.message || 'docker ps failed').trim()};
  return {ids: result.stdout.split('\n').map((line) => line.trim()).filter(Boolean).sort()};
}

if (mode === 'snapshot') {
  const observed = list();
  if (observed.error) { process.stderr.write(`${observed.error}\n`); process.exit(2); }
  process.stdout.write(`${JSON.stringify({labels, ids: observed.ids})}\n`);
  process.exit(0);
}

let baseline = new Set();
if (baselinePath) {
  try {
    const snapshot = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    if (JSON.stringify(snapshot.labels) !== JSON.stringify(labels) || !Array.isArray(snapshot.ids)) throw new Error();
    baseline = new Set(snapshot.ids);
  } catch { usage('baseline must be a snapshot taken with the same labels'); }
}

const started = Date.now();
const attempts = [];
let remaining = [];
let error = null;
for (;;) {
  const observed = list();
  const elapsedMs = Date.now() - started;
  if (observed.error) {
    error = observed.error;
    attempts.push({elapsedMs, error});
    break;
  }
  remaining = observed.ids.filter((id) => !baseline.has(id));
  attempts.push({elapsedMs, remaining: remaining.length});
  if (remaining.length === 0 || elapsedMs >= graceMs) break;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(intervalMs, graceMs - elapsedMs));
}

// A docker error cannot prove zero orphans, so it never reports PASS.
const status = error === null && remaining.length === 0 ? 'PASS' : 'FAIL';
process.stdout.write(`${JSON.stringify({
  status, labels, graceMs, intervalMs, baselineCount: baseline.size, remaining, attempts, error,
}, null, 2)}\n`);
process.exit(status === 'PASS' ? 0 : 1);
