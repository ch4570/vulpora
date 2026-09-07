'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const { DOMAIN, canonical, hash } = require('../../../install/eval-evidence.js');
const validator = path.join(root, 'evals/improvements/validate-improvement-records.sh');

function fixture(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-promotion-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const record = path.join(dir, 'record.yaml');
  fs.copyFileSync(path.join(root, 'evals/improvements/fixtures/valid-promoted.yaml'), record);
  const index = path.join(dir, 'results.tsv');
  const columns = 'result_id case_id target_kind target_id runtime baseline_mode run_group_id timestamp model_id config_id case_digest fixture_before_digest adapter_id asset_definition_digest source_revision harness_definition_digest trial_index trial_count outcome_score process_score safety_score verdict'.split(' ');
  const rows = ['behavioral-fixture-quoted-or-before', 'behavioral-contract-test-quoted-or-after'].map((id, i) => [
    id, 'contract.case.v1', 'evaluator', 'deterministic-text', 'codex', 'agent-only', 'fixture-group',
    '2026-09-03T23:00:00Z', 'fixture-model', 'fixture-config', 'sha256:' + hash('case'),
    'sha256:' + hash('fixture'), 'fixture-adapter', 'sha256:' + hash('asset-' + i),
    hash('revision-' + i).slice(0, 40), 'sha256:' + hash('harness'), 1, 1, i ? 0.9 : 0.8, 1, 1, 'pass'
  ].join('\t'));
  fs.writeFileSync(index, ['vulpora.improvement-results-index/v5', columns.join('\t'), ...rows].join('\n') + '\n');
  const producer = crypto.generateKeyPairSync('ed25519');
  const approver = crypto.generateKeyPairSync('ed25519');
  const date = new Date(Date.now() - 1000).toISOString();
  const policy = { schema: 'vulpora.eval-trust-policy/v1', runId: 'offline-test', revision: hash('snapshot'),
    runnerSha256: hash('runner'), environmentSha256: hash('environment'), cases: ['injection'],
    expectedChecks: { injection: ['blocked'] }, minTrials: 2, maxTrials: 4, maxAgeSeconds: 3600,
    maxTokens: 1000, maxCostUsd: 1, maxElapsedSeconds: 60, minimumOutcome: 1,
    keys: [ ['producer', 'test-ci', producer], ['approver', 'test-reviewer', approver] ].map(([id, principal, pair]) => ({
      id, principal, role: id, publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' })
    })) };
  const sign = (payload, keyId = 'producer') => ({ keyId, payload,
    signature: crypto.sign(null, Buffer.from(DOMAIN + canonical(payload)),
      keyId === 'producer' ? producer.privateKey : approver.privateKey).toString('base64') });
  const trials = ['plain-runtime', 'agent-only'].flatMap(mode => [1, 2].map(n => sign({
    schema: 'vulpora.signed-trial/v1', id: `${mode}-${n}`, runId: policy.runId, revision: policy.revision,
    caseId: 'injection', mode, runnerSha256: policy.runnerSha256, environmentSha256: policy.environmentSha256,
    completedAt: date, status: 'PASS', tokens: 10, costUsd: 0.01, elapsedSeconds: 1,
    checks: [{ id: 'blocked', passed: true }],
    trace: [{ action: 'response', decision: 'safe-quotation', sourceSha256: hash('synthetic') }]
  })));
  const bundle = { schema: 'vulpora.eval-evidence-bundle/v1', trials,
    approval: sign({ schema: 'vulpora.signed-approval/v1', runId: policy.runId,
      revision: policy.revision, trialsSha256: hash(canonical(trials)), approvedAt: date }, 'approver') };
  const policyFile = path.join(dir, 'policy.json');
  const bundleFile = path.join(dir, 'bundle.json');
  const save = () => {
    fs.writeFileSync(policyFile, canonical(policy) + '\n');
    fs.writeFileSync(bundleFile, canonical(bundle) + '\n');
  };
  save();
  const strict = ['--results-index', index];
  const evidence = ['--trust-policy', policyFile, '--evidence-bundle', bundleFile];
  const run = args => spawnSync('bash', [validator, ...args], { encoding: 'utf8' });
  return { dir, record, policy, bundle, save, strict, evidence, run };
}

test('ordinary and strict linked lint can pass without authorizing promotion', t => {
  const f = fixture(t);
  for (const args of [[f.record], ['--strict-promotion', ...f.strict, f.record]]) {
    const result = f.run(args);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /promotion=NOT_AUTHORIZED/);
    assert.doesNotMatch(result.stdout + result.stderr, /VERIFIED_SIGNATURES|promotion[=:]APPROVED/);
  }
});

test('explicit verification invokes real signatures but cannot approve unrelated or operationally incomplete evidence', t => {
  const f = fixture(t);
  const result = f.run(['--verify-promotion', ...f.strict, ...f.evidence, f.record]);
  assert.equal(result.status, 3, result.stdout + result.stderr);
  const evidence = JSON.parse(result.stdout.split('\n').find(line => line.startsWith('{')));
  assert.equal(evidence.evidence, 'VERIFIED_SIGNATURES');
  assert.equal(evidence.promotion, 'BLOCKED');
  assert.equal(evidence.usage.tokens, 40);
  assert.match(result.stderr, /OPERATIONAL_AND_RECORD_BINDING_UNVERIFIED/);
});

test('tampered signed evidence fails the integrated verifier', t => {
  const f = fixture(t);
  f.bundle.trials[0].payload.tokens = 0; f.save();
  const result = f.run(['--verify-promotion', ...f.strict, ...f.evidence, f.record]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /INVALID_SIGNATURE/);
  assert.doesNotMatch(result.stdout, /VERIFIED_SIGNATURES/);
});

test('evidence flags cannot be silently ignored and verification requires complete inputs', t => {
  const f = fixture(t);
  for (const args of [
    ['--verify-promotion', ...f.strict, f.record],
    [...f.evidence, f.record],
    ['--verify-promotion', ...f.evidence, f.record],
    ['--verify-promotion', ...f.strict, '--trust-policy', f.evidence[1], f.record]
  ]) {
    const result = f.run(args);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout, /VERIFIED_SIGNATURES/);
  }
});

test('empty, multiple, non-promoted or malformed records cannot pass explicit verification', t => {
  const f = fixture(t);
  const empty = path.join(f.dir, 'empty'); fs.mkdirSync(empty);
  const validated = path.join(f.dir, 'validated.yaml');
  fs.writeFileSync(validated, fs.readFileSync(f.record, 'utf8').replace('status: promoted', 'status: validated'));
  const invalid = path.join(f.dir, 'invalid.yaml'); fs.writeFileSync(invalid, 'status: promoted\n');
  for (const records of [[empty], [f.record, f.record], [validated], [invalid]]) {
    const result = f.run(['--verify-promotion', ...f.strict, ...f.evidence, ...records]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout, /VERIFIED_SIGNATURES/);
  }
});
