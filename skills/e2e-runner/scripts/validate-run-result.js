#!/usr/bin/env node
'use strict';

// Gate for any run result, whether produced by assemble-run-result.js or by a repository
// harness directly: CONTRACT.md §5 shape, per-status fields, recorded comparisons, masking,
// the RUN-16.7 verdict input, the RUN-7.1a environment endpoints and RUN-7.1d isolation record, and (with
// --require-done) a `.done` marker written last. `warnings` lists what could not be proven without failing the
// contract (an older result with no endpoints or no isolation record stays valid).
// Exit 0 = valid, 1 = contract violations (listed), 64 = usage.
//
// usage: validate-run-result.js <run.json> [--require-done] [--mask-key <key>]...

const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {findUnmasked} = require('./mask-evidence');
const {clauses} = require('./expected-assertions');

const args = process.argv.slice(2);
const maskKeys = [];
const positional = [];
let requireDone = false;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--require-done') requireDone = true;
  else if (args[index] === '--mask-key' && args[index + 1]) maskKeys.push(args[++index]);
  else positional.push(args[index]);
}
if (positional.length !== 1) {
  process.stderr.write('usage: validate-run-result.js <run.json> [--require-done] [--mask-key <key>]...\n');
  process.exit(64);
}
const runPath = path.resolve(positional[0]);
const errors = [];
const error = (message) => errors.push(message);

let run;
try { run = JSON.parse(fs.readFileSync(runPath, 'utf8')); } catch (cause) {
  process.stdout.write(`${JSON.stringify({valid: false, errors: [`unreadable run JSON: ${cause.message}`]}, null, 2)}\n`);
  process.exit(1);
}

for (const key of ['schemaVersion', 'contractVersion', 'runId', 'startedAt', 'finishedAt', 'environment', 'catalog', 'scope', 'summary', 'results']) {
  if (run[key] === undefined) error(`missing root field: ${key}`);
}
if (run.schemaVersion !== 1 || run.contractVersion !== 1) error('schemaVersion and contractVersion must both be 1');
if (Number.isNaN(Date.parse(run.startedAt)) || Number.isNaN(Date.parse(run.finishedAt))) error('startedAt and finishedAt must be ISO timestamps');

const STATUSES = new Set(['PASS', 'FAIL', 'SKIPPED', 'FAILED-DEPENDENCY', 'PROBE-ERROR']);
const results = Array.isArray(run.results) ? run.results : [];
if (!Array.isArray(run.results)) error('results must be an array');
for (const result of results) {
  const id = result?.id ?? '<missing id>';
  for (const key of ['id', 'status', 'target', 'dataset', 'dependsOn', 'actual', 'expected', 'latencyMs', 'skippedReason', 'evidence']) {
    if (result?.[key] === undefined) error(`${id}: missing field ${key}`);
  }
  if (!STATUSES.has(result?.status)) { error(`${id}: invalid status ${result?.status}`); continue; }
  if (!Array.isArray(result.dependsOn)) error(`${id}: dependsOn must be an array`);
  if (typeof result.dataset !== 'object' || result.dataset === null) {
    if (typeof result.dataset !== 'string') error(`${id}: dataset must be an object or the catalog string`);
  }
  if (['SKIPPED', 'FAILED-DEPENDENCY'].includes(result.status)
    && (result.actual !== null || result.latencyMs !== null || result.evidence?.rawBodyPath !== null)) {
    error(`${id}: ${result.status} requires actual, latencyMs, and evidence.rawBodyPath to be null`);
  }
  if (!['PASS', 'FAIL'].includes(result.status)) continue;
  if (result.actual == null || typeof result.latencyMs !== 'number') error(`${id}: ${result.status} requires actual and latencyMs`);
  if (!result.evidence?.rawBodyPath) error(`${id}: ${result.status} requires evidence.rawBodyPath`);
  if (result.status === 'FAIL' && !result.evidence?.logTailPath && !result.evidence?.logUnavailableReason) {
    error(`${id}: FAIL requires evidence.logTailPath or evidence.logUnavailableReason`);
  }
  // Inline-code wrappers must not hide the expected status: `204` and 204 are both a status.
  const assertions = Array.isArray(result.assertions) ? result.assertions : null;
  if (!assertions) { error(`${id}: executed result must record assertions[]`); continue; }
  if (result.status === 'PASS' && result.assertionSource !== 'framework') {
    if (assertions.length === 0) error(`${id}: PASS records no comparison`);
    for (const assertion of assertions) {
      if (assertion.passed !== true) error(`${id}: PASS with a failed comparison (${assertion.clause || assertion.kind})`);
      if (assertion.kind === 'status' && String(assertion.expected) !== String(assertion.actual)) {
        error(`${id}: PASS while expected status ${assertion.expected} != actual ${assertion.actual}`);
      }
    }
    const expectedStatus = typeof result.expected === 'string' ? clauses(result.expected)[0]?.match(/^(\d{3})\b/)?.[1] : null;
    if (expectedStatus && !assertions.some((assertion) => assertion.kind === 'status' && String(assertion.expected) === expectedStatus)) {
      error(`${id}: expected status ${expectedStatus} was never compared`);
    }
  }
}

if (run.summary && typeof run.summary === 'object') {
  const count = (status) => results.filter((result) => result.status === status).length;
  const expected = {total: results.length, pass: count('PASS'), fail: count('FAIL'), skipped: count('SKIPPED'),
    failedDependency: count('FAILED-DEPENDENCY'), probeError: count('PROBE-ERROR')};
  for (const [key, value] of Object.entries(expected)) {
    if (run.summary[key] !== value) error(`summary.${key} must be ${value}, found ${run.summary[key]}`);
  }
}

// Environment (RUN-7.1a). schemaVersion 2 declares the run-owned endpoints; everything else is accepted for
// compatibility but cannot prove ownership, so it only warns.
const warnings = [];
const warn = (message) => warnings.push(message);
const LITERAL_LOOPBACK = (host) => typeof host === 'string' && (host === 'localhost' || host === '::1' || host === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(host));
const environment = run.environment;
if (environment && typeof environment === 'object' && environment.schemaVersion === 2) {
  if (!Array.isArray(environment.endpoints)) error('environment.endpoints must be an array when environment.schemaVersion is 2');
  else {
    environment.endpoints.forEach((endpoint, index) => {
      const at = `environment.endpoints[${index}]`;
      if (!endpoint || typeof endpoint !== 'object') { error(`${at} must be an object`); return; }
      if (typeof endpoint.kind !== 'string' || endpoint.kind.length === 0) error(`${at}.kind must be a non-empty string`);
      if (!LITERAL_LOOPBACK(endpoint.host)) error(`${at}.host must be a loopback address (localhost, 127.x.x.x, ::1); a run-owned endpoint is never a remote or Docker-alias host`);
      if (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535) error(`${at}.port must be an integer port`);
      if (typeof endpoint.containerId !== 'string' || endpoint.containerId.length < 12) error(`${at}.containerId must be the run-owned container id (at least 12 characters)`);
      if (!Array.isArray(endpoint.propertyKeys) || endpoint.propertyKeys.some((key) => typeof key !== 'string')) error(`${at}.propertyKeys must be an array of strings`);
    });
    if (environment.endpoints.length === 0) warn('environment declares no endpoints: nothing was proven run-owned');
  }
} else {
  warn('environment has no schemaVersion 2 endpoints: endpoint ownership cannot be checked and "no shared-resource contact" must not be claimed');
}

// Isolation record (RUN-7.1d): the receipt must exist next to the result and match its hash.
const isolation = run.isolation;
if (isolation !== undefined) {
  if (!isolation || typeof isolation !== 'object') error('isolation must be an object');
  else {
    const receiptPath = isolation.receipt?.path;
    if (typeof receiptPath !== 'string' || typeof isolation.receipt?.sha256 !== 'string') error('isolation.receipt needs path and sha256');
    else {
      const absolute = path.resolve(path.dirname(runPath), receiptPath);
      if (!absolute.startsWith(`${path.dirname(runPath)}${path.sep}`)) error('isolation.receipt.path must stay inside the run output directory');
      else if (!fs.existsSync(absolute)) error(`isolation receipt does not exist: ${receiptPath}`);
      else if (require('node:crypto').createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') !== isolation.receipt.sha256) error('isolation receipt does not match its recorded sha256');
    }
    for (const violation of Array.isArray(isolation.ownershipViolations) ? isolation.ownershipViolations : []) {
      warn(`environment endpoint ${violation.kind ?? '?'}:${violation.port ?? '?'} is not proven run-owned (${violation.reason ?? 'unknown reason'})`);
    }
    const proven = new Set((Array.isArray(isolation.verifiedOwnedEndpoints) ? isolation.verifiedOwnedEndpoints : []).map((entry) => `${entry.kind}|${entry.port}|${entry.containerId}`));
    for (const endpoint of Array.isArray(environment?.endpoints) ? environment.endpoints : []) {
      const violated = (isolation.ownershipViolations || []).some((entry) => entry.kind === endpoint.kind && entry.port === endpoint.port && entry.containerId === endpoint.containerId);
      if (!proven.has(`${endpoint.kind}|${endpoint.port}|${endpoint.containerId}`) && !violated) warn(`environment endpoint ${endpoint.kind}:${endpoint.port} was not checked by check-isolation.js`);
    }
  }
} else {
  warn('no isolation record: the run is "isolation not verified"');
}

// Masking applies to the JSON and every raw body it references.
for (const at of findUnmasked(run, maskKeys)) error(`unmasked sensitive value at ${at}`);
for (const result of results) {
  for (const key of ['rawBodyPath', 'logTailPath']) {
    const file = result.evidence?.[key];
    if (!file) continue;
    const absolute = path.resolve(path.dirname(runPath), file);
    if (!fs.existsSync(absolute)) { error(`${result.id}: ${key} does not exist: ${file}`); continue; }
    const text = fs.readFileSync(absolute, 'utf8');
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    for (const at of findUnmasked(parsed, maskKeys)) error(`${result.id}: unmasked sensitive value in ${file} at ${at}`);
  }
}

// The verdict input is part of the result; the evaluator owns its schema.
const verdict = spawnSync(process.execPath, [path.join(__dirname, 'evaluate-run-verdict.js'), runPath], {encoding: 'utf8'});
if (verdict.status === 64) error(`verdict input: ${verdict.stderr.trim()}`);

if (requireDone) {
  const done = runPath.replace(/\.json$/, '.done');
  if (!fs.existsSync(done)) error('missing .done marker');
  else if (fs.statSync(done).mtimeMs < fs.statSync(runPath).mtimeMs) error('.done marker was written before the run JSON');
}

const valid = errors.length === 0;
process.stdout.write(`${JSON.stringify({valid, errors, warnings, verdict: verdict.status === 64 ? null : JSON.parse(verdict.stdout || 'null')?.verdict ?? null}, null, 2)}\n`);
process.exit(valid ? 0 : 1);
