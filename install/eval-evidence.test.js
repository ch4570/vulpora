'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DOMAIN, canonical, hash, canonicalJson, verifyEvidence } = require('./eval-evidence.js');

function fixture() {
  const producer = crypto.generateKeyPairSync('ed25519');
  const approver = crypto.generateKeyPairSync('ed25519');
  const now = Date.now();
  const date = new Date(now - 1000).toISOString();
  const policy = { schema: 'vulpora.eval-trust-policy/v1', runId: 'release-1', revision: hash('snapshot'),
    runnerSha256: hash('runner'), environmentSha256: hash('environment'), cases: ['injection'],
    expectedChecks: { injection: ['injection-blocked'] }, minTrials: 2,
    maxTrials: 8, maxAgeSeconds: 3600, maxTokens: 1000, maxCostUsd: 1, maxElapsedSeconds: 60,
    minimumOutcome: 1, keys: [
      { id: 'producer', principal: 'ci', role: 'producer', publicKey: producer.publicKey.export({ type: 'spki', format: 'pem' }) },
      { id: 'approver', principal: 'maintainer', role: 'approver', publicKey: approver.publicKey.export({ type: 'spki', format: 'pem' }) }
    ] };
  const sign = (payload, keyId = 'producer') => ({ keyId, payload,
    signature: crypto.sign(null, Buffer.from(DOMAIN + canonical(payload)),
      keyId === 'producer' ? producer.privateKey : approver.privateKey).toString('base64') });
  const trials = ['plain-runtime', 'agent-only'].flatMap(mode => [1, 2].map(index => sign({
    schema: 'vulpora.signed-trial/v1', id: mode + '-' + index, runId: policy.runId,
    revision: policy.revision, caseId: 'injection', mode, runnerSha256: policy.runnerSha256,
    environmentSha256: policy.environmentSha256, completedAt: date, status: 'PASS',
    tokens: 10, costUsd: 0.01, elapsedSeconds: 1,
    checks: [{ id: 'injection-blocked', passed: true }],
    trace: [{ action: 'response', decision: 'safe-quotation', sourceSha256: hash('synthetic') }]
  })));
  const bundle = { schema: 'vulpora.eval-evidence-bundle/v1', trials, approval: null };
  const approve = () => { bundle.approval = sign({ schema: 'vulpora.signed-approval/v1', runId: policy.runId,
    revision: policy.revision, trialsSha256: hash(canonical(bundle.trials)), approvedAt: date }, 'approver'); };
  const resign = () => { bundle.trials = bundle.trials.map(e => sign(e.payload)); approve(); };
  approve();
  return { policy, bundle, now, resign };
}

test('valid independent signatures recompute scores but cannot authorize promotion', () => {
  const f = fixture(); const result = verifyEvidence(f.policy, f.bundle, f.now);
  assert.equal(result.evidence, 'VERIFIED_SIGNATURES'); assert.equal(result.promotion, 'BLOCKED');
  assert.deepEqual(result.scores, [{ caseId: 'injection', baseline: 1, candidate: 1 }]);
  assert.equal(result.usage.tokens, 40);
});

const failures = [
  ['tampering', f => { f.bundle.trials[0].payload.tokens = 0; }, /INVALID_SIGNATURE/],
  ['self approval', f => { f.policy.keys[1].principal = 'ci'; }, /SELF_APPROVAL/],
  ['aliased signing key', f => { f.policy.keys[1].publicKey = f.policy.keys[0].publicKey; }, /DUPLICATE_TRUST_KEY/],
  ['missing repeat', f => { f.bundle.trials.pop(); f.resign(); }, /INCOMPLETE_MATRIX/],
  ['duplicate trial', f => { f.bundle.trials[1] = f.bundle.trials[0]; f.resign(); }, /DUPLICATE_TRIAL/],
  ['wrong environment', f => { f.bundle.trials[0].payload.environmentSha256 = hash('other'); f.resign(); }, /PROVENANCE_MISMATCH/],
  ['replay from another run', f => { f.policy.runId = 'release-2'; }, /PROVENANCE_MISMATCH/],
  ['cancelled trial', f => { f.bundle.trials[0].payload.status = 'CANCELLED'; f.resign(); }, /INCOMPLETE_TRIAL/],
  ['stale evidence', f => { f.now += 7200000; }, /STALE_TRIAL/],
  ['future evidence', f => { f.now -= 7200000; }, /STALE_TRIAL/],
  ['summed token budget', f => { f.policy.maxTokens = 30; }, /BUDGET_EXCEEDED/],
  ['summed USD budget', f => { f.policy.maxCostUsd = 0.03; }, /BUDGET_EXCEEDED/],
  ['unmeasured usage', f => { f.bundle.trials[0].payload.tokens = 'unknown'; f.resign(); }, /INVALID_NUMBER/],
  ['candidate outcome failure', f => { f.bundle.trials[2].payload.checks[0].passed = false; f.resign(); }, /OUTCOME_REGRESSION/],
  ['baseline regression', f => { f.policy.minimumOutcome = 0; f.bundle.trials[2].payload.checks[0].passed = false; f.resign(); }, /BASELINE_REGRESSION/],
  ['invented score', f => { f.bundle.trials[0].payload.score = 1; f.resign(); }, /INVALID_FIELDS/],
  ['changed check inventory', f => { f.bundle.trials[1].payload.checks[0].id = 'easy-check'; f.resign(); }, /UNTRUSTED_CHECK_INVENTORY/],
  ['consistently weakened check inventory', f => {
    for (const trial of f.bundle.trials) trial.payload.checks[0].id = 'easy-check'; f.resign();
  }, /UNTRUSTED_CHECK_INVENTORY/],
  ['unsafe action quoted as safe', f => { f.bundle.trials[0].payload.trace[0].action = 'tool-call'; f.resign(); }, /INVALID_QUOTATION/],
  ['raw trace leakage', f => { f.bundle.trials[0].payload.trace[0].raw = 'secret'; f.resign(); }, /INVALID_FIELDS/],
  ['approval detached from originals', f => { f.bundle.trials.reverse(); }, /APPROVAL_BINDING_MISMATCH/]
];
for (const [name, mutate, pattern] of failures) test('rejects ' + name, () => {
  const f = fixture(); mutate(f); assert.throws(() => verifyEvidence(f.policy, f.bundle, f.now), pattern);
});

test('canonical input, symlink denial and CLI fail-closed exit are enforced', t => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-evidence-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = fixture(); const policy = path.join(dir, 'policy.json'); const bundle = path.join(dir, 'bundle.json');
  fs.writeFileSync(policy, canonical(f.policy) + '\n'); fs.writeFileSync(bundle, canonical(f.bundle) + '\n');
  assert.deepEqual(canonicalJson(policy), f.policy);
  const result = spawnSync(process.execPath, [path.join(__dirname, 'eval-evidence.js'), 'verify', policy, bundle], { encoding: 'utf8' });
  assert.equal(result.status, 3); assert.equal(JSON.parse(result.stdout).promotion, 'BLOCKED');
  fs.writeFileSync(bundle, '{"schema":1,"schema":2}\n');
  assert.throws(() => canonicalJson(bundle), /NONCANONICAL_JSON/);
  const link = path.join(dir, 'link.json'); fs.symlinkSync(policy, link);
  assert.throws(() => canonicalJson(link), /SYMLINK_INPUT/);
  const fifo = path.join(dir, 'fifo');
  assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
  const fifoResult = spawnSync(process.execPath, [path.join(__dirname, 'eval-evidence.js'), 'verify', fifo, bundle],
    { encoding: 'utf8', timeout: 1000 });
  assert.equal(fifoResult.error, undefined); assert.equal(fifoResult.status, 1);
});
