#!/usr/bin/env node
'use strict';

// Verifies signed, redacted trial records. This does not certify the sandbox,
// provision an immutable store, or grant permission to promote an agent.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DOMAIN = 'vulpora/eval-evidence/v1\n';
const fail = code => { throw new Error(code); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  if (typeof value === 'number' && !Number.isFinite(value)) fail('NONFINITE_NUMBER');
  return JSON.stringify(value);
};
function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== fields.slice().sort().join(',')) fail('INVALID_FIELDS');
}
function safeId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(value)) fail('INVALID_ID');
}
function digest(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('INVALID_DIGEST');
}
function number(value, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
      || (integer && !Number.isSafeInteger(value))) fail('INVALID_NUMBER');
}
function time(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('INVALID_TIME');
  return Date.parse(value);
}
function regularFile(filename, maxBytes) {
  const absolute = path.resolve(filename);
  // Check each ancestor; realpath equality alone misses an intermediate link
  // that happens to point to the same location.
  let current = path.parse(absolute).root;
  let before;
  for (const part of absolute.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    before = fs.lstatSync(current);
    if (before.isSymbolicLink()) fail('SYMLINK_INPUT');
  }
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) fail('INVALID_FILE');
    if (stat.dev !== before.dev || stat.ino !== before.ino || fs.realpathSync(absolute) !== absolute) fail('FILE_CHANGED');
    const chunks = []; let total = 0;
    const buffer = Buffer.alloc(Math.min(65536, maxBytes + 1));
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, maxBytes - total + 1), null);
      if (count === 0) break;
      total += count;
      if (total > maxBytes) fail('INVALID_FILE');
      chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    const after = fs.fstatSync(fd), named = fs.lstatSync(absolute);
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || named.dev !== stat.dev
        || named.ino !== stat.ino || fs.realpathSync(absolute) !== absolute) fail('FILE_CHANGED');
    return Buffer.concat(chunks, total);
  } finally { fs.closeSync(fd); }
}
function canonicalJson(filename) {
  const bytes = regularFile(filename, 2 * 1024 * 1024);
  const value = JSON.parse(bytes.toString('utf8'));
  // Exact canonical encoding rejects duplicate/shadow keys before use and
  // gives external signers one unambiguous byte representation.
  if (bytes.toString('utf8') !== canonical(value) + '\n') fail('NONCANONICAL_JSON');
  return value;
}
function verifyEnvelope(envelope, keys, role) {
  object(envelope, ['keyId', 'payload', 'signature']);
  safeId(envelope.keyId);
  const key = keys.get(envelope.keyId);
  if (!key || key.role !== role) fail('UNTRUSTED_SIGNER');
  if (typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) fail('INVALID_SIGNATURE');
  const bytes = Buffer.from(DOMAIN + canonical(envelope.payload));
  if (!crypto.verify(null, bytes, key.publicKey, Buffer.from(envelope.signature, 'base64'))) fail('INVALID_SIGNATURE');
  return key;
}
function verifyEvidence(policy, bundle, now = Date.now()) {
  object(policy, ['schema', 'runId', 'revision', 'runnerSha256', 'environmentSha256', 'cases', 'expectedChecks', 'minTrials', 'maxTrials',
    'maxAgeSeconds', 'maxTokens', 'maxCostUsd', 'maxElapsedSeconds', 'minimumOutcome', 'keys']);
  if (policy.schema !== 'vulpora.eval-trust-policy/v1') fail('INVALID_POLICY_SCHEMA');
  safeId(policy.runId); digest(policy.revision); digest(policy.runnerSha256); digest(policy.environmentSha256);
  number(policy.minTrials, 2, 100, true); number(policy.maxTrials, policy.minTrials, 1000, true);
  for (const key of ['maxAgeSeconds', 'maxTokens', 'maxElapsedSeconds']) number(policy[key], 1, 1e12);
  number(policy.maxCostUsd, 0, 1e6); number(policy.minimumOutcome, 0, 1);
  if (!Array.isArray(policy.cases) || policy.cases.length < 1 || policy.cases.length > 1000) fail('INVALID_CASES');
  policy.cases.forEach(safeId);
  if (new Set(policy.cases).size !== policy.cases.length) fail('DUPLICATE_CASE');
  object(policy.expectedChecks, policy.cases);
  for (const expected of Object.values(policy.expectedChecks)) {
    if (!Array.isArray(expected) || expected.length < 1 || expected.length > 10000) fail('INVALID_EXPECTED_CHECKS');
    expected.forEach(safeId);
    if (new Set(expected).size !== expected.length) fail('INVALID_EXPECTED_CHECKS');
  }
  if (!Array.isArray(policy.keys) || policy.keys.length < 2 || policy.keys.length > 100) fail('INVALID_KEYS');
  const keys = new Map(); const fingerprints = new Set();
  for (const entry of policy.keys) {
    object(entry, ['id', 'principal', 'role', 'publicKey']);
    safeId(entry.id); safeId(entry.principal);
    if (!['producer', 'approver'].includes(entry.role) || keys.has(entry.id)) fail('INVALID_KEY_ROLE');
    const publicKey = crypto.createPublicKey(entry.publicKey);
    if (publicKey.asymmetricKeyType !== 'ed25519') fail('UNSUPPORTED_KEY');
    const fingerprint = hash(publicKey.export({ type: 'spki', format: 'der' }));
    if (fingerprints.has(fingerprint)) fail('DUPLICATE_TRUST_KEY');
    fingerprints.add(fingerprint); keys.set(entry.id, { ...entry, publicKey });
  }
  object(bundle, ['schema', 'trials', 'approval']);
  if (bundle.schema !== 'vulpora.eval-evidence-bundle/v1' || !Array.isArray(bundle.trials)
      || bundle.trials.length < 1 || bundle.trials.length > policy.maxTrials) fail('INVALID_BUNDLE');
  const producers = new Set(); const ids = new Set(); const groups = new Map();
  let tokens = 0, costUsd = 0, elapsedSeconds = 0, latest = 0;
  for (const envelope of bundle.trials) {
    const key = verifyEnvelope(envelope, keys, 'producer');
    producers.add(key.principal);
    const trial = envelope.payload;
    object(trial, ['schema', 'id', 'runId', 'revision', 'caseId', 'mode', 'runnerSha256', 'environmentSha256',
      'completedAt', 'status', 'tokens', 'costUsd', 'elapsedSeconds', 'checks', 'trace']);
    if (trial.schema !== 'vulpora.signed-trial/v1') fail('INVALID_TRIAL_SCHEMA');
    safeId(trial.id);
    if (ids.has(trial.id)) fail('DUPLICATE_TRIAL'); ids.add(trial.id);
    for (const field of ['runId', 'revision', 'runnerSha256', 'environmentSha256']) {
      if (trial[field] !== policy[field]) fail('PROVENANCE_MISMATCH');
    }
    if (!policy.cases.includes(trial.caseId) || !['plain-runtime', 'agent-only'].includes(trial.mode)) fail('UNEXPECTED_TRIAL');
    if (trial.status !== 'PASS') fail('INCOMPLETE_TRIAL');
    const completed = time(trial.completedAt);
    if (completed > now || now - completed > policy.maxAgeSeconds * 1000) fail('STALE_TRIAL');
    latest = Math.max(latest, completed);
    number(trial.tokens, 0, policy.maxTokens, true); number(trial.costUsd, 0, policy.maxCostUsd);
    number(trial.elapsedSeconds, 0, policy.maxElapsedSeconds);
    tokens += trial.tokens; costUsd += trial.costUsd; elapsedSeconds += trial.elapsedSeconds;
    if (!Array.isArray(trial.checks) || trial.checks.length === 0 || trial.checks.length > 10000) fail('MISSING_CHECKS');
    const checkIds = new Set();
    for (const check of trial.checks) {
      object(check, ['id', 'passed']); safeId(check.id);
      if (checkIds.has(check.id) || typeof check.passed !== 'boolean') fail('INVALID_CHECK');
      checkIds.add(check.id);
    }
    if ([...checkIds].sort().join(',') !== policy.expectedChecks[trial.caseId].slice().sort().join(',')) fail('UNTRUSTED_CHECK_INVENTORY');
    // Store classifications and digests only: no raw prompts, commands, or excerpts.
    if (!Array.isArray(trial.trace) || trial.trace.length === 0 || trial.trace.length > 10000) fail('MISSING_TRACE');
    for (const event of trial.trace) {
      object(event, ['action', 'decision', 'sourceSha256']); digest(event.sourceSha256);
      if (!['read', 'write', 'tool-call', 'response'].includes(event.action)
          || !['allowed', 'blocked', 'safe-quotation'].includes(event.decision)) fail('UNSAFE_TRACE');
      if (event.decision === 'safe-quotation' && event.action !== 'response') fail('INVALID_QUOTATION');
    }
    const score = trial.checks.filter(c => c.passed).length / trial.checks.length;
    if (trial.mode === 'agent-only' && score < policy.minimumOutcome) fail('OUTCOME_REGRESSION');
    const groupId = trial.caseId + '/' + trial.mode;
    const group = groups.get(groupId) || { scores: [], checks: [...checkIds].sort().join(',') };
    if (group.checks !== [...checkIds].sort().join(',')) fail('CHECK_INVENTORY_DRIFT');
    group.scores.push(score); groups.set(groupId, group);
  }
  if (tokens > policy.maxTokens || costUsd > policy.maxCostUsd || elapsedSeconds > policy.maxElapsedSeconds) fail('BUDGET_EXCEEDED');
  const scores = [];
  for (const caseId of policy.cases) {
    const baseline = groups.get(caseId + '/plain-runtime'); const candidate = groups.get(caseId + '/agent-only');
    if (!baseline || !candidate || baseline.scores.length < policy.minTrials
        || baseline.scores.length !== candidate.scores.length || baseline.checks !== candidate.checks) fail('INCOMPLETE_MATRIX');
    const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
    if (mean(candidate.scores) < mean(baseline.scores)) fail('BASELINE_REGRESSION');
    scores.push({ caseId, baseline: mean(baseline.scores), candidate: mean(candidate.scores) });
  }
  const approver = verifyEnvelope(bundle.approval, keys, 'approver');
  if (producers.has(approver.principal)) fail('SELF_APPROVAL');
  const approval = bundle.approval.payload;
  object(approval, ['schema', 'runId', 'revision', 'trialsSha256', 'approvedAt']);
  if (approval.schema !== 'vulpora.signed-approval/v1' || approval.runId !== policy.runId
      || approval.revision !== policy.revision || approval.trialsSha256 !== hash(canonical(bundle.trials))) fail('APPROVAL_BINDING_MISMATCH');
  const approved = time(approval.approvedAt);
  if (approved < latest || approved > now || now - approved > policy.maxAgeSeconds * 1000) fail('INVALID_APPROVAL_TIME');
  return { evidence: 'VERIFIED_SIGNATURES', runId: policy.runId, trials: bundle.trials.length, scores,
    usage: { tokens, costUsd, elapsedSeconds }, promotion: 'BLOCKED',
    pending: ['machine-enforced-isolation', 'immutable-result-store', 'live-security-stability'] };
}

if (require.main === module) {
  try {
    const [command, policyFile, bundleFile] = process.argv.slice(2);
    if (command !== 'verify' || !policyFile || !bundleFile || process.argv.length !== 5) fail('USAGE: eval-evidence.js verify <trusted-policy.json> <bundle.json>');
    const policy = canonicalJson(policyFile); const bundle = canonicalJson(bundleFile);
    const result = verifyEvidence(policy, bundle);
    process.stdout.write(JSON.stringify(result) + '\n');
    // Valid signatures do not turn incomplete operational evidence into promotion.
    process.exitCode = 3;
  } catch (error) {
    const code = /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'INVALID_EVIDENCE';
    process.stderr.write(JSON.stringify({ evidence: 'FAIL', reason: code, promotion: 'BLOCKED' }) + '\n');
    process.exitCode = 1;
  }
}
module.exports = { DOMAIN, canonical, hash, regularFile, canonicalJson, verifyEvidence };
