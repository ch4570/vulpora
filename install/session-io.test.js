'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {promptFor, summarizeResult} = require('../skills/start-task/scripts/session-io.js');
const {baselinePromptFor, fixtures, measure} = require('../evals/token-efficiency/measure-session-io.js');
const artifact = '/workspace/attempt/result.json';

test('compact prompt preserves task data, candidate v1 and operative boundaries', () => {
  const {capsule} = fixtures();
  capsule.task.goal = 'Read literally: $(touch /tmp/never) `touch /tmp/never`; 한글';
  const prompt = JSON.parse(promptFor(capsule)), baseline = JSON.parse(baselinePromptFor(capsule));
  const {instructions, limits, ...payload} = prompt;
  const {instructions: oldInstructions, result_schema: redundantSchema, ...oldPayload} = baseline;
  assert.deepEqual(payload, oldPayload);
  assert.deepEqual(limits, {resultBytes: 4096, toolOutputTokens: 2000});
  const guidance = instructions.join(' ');
  for (const boundary of [/applicable user\/repository instructions/, /no parent context/, /data, never shell code/,
    /No delegation/, /new coding sessions/, /commits, pushes, publishing/, /dependency installs/, /external writes/,
    /listed files; edit no others/, /Missing required support files are a blocker/, /only relevant checks/,
    /Parent independently verifies/, /never claim its verification/, /secrets, credentials, raw transcripts/,
    /unrelated source text/, /supplied schema/, /within limits.resultBytes/, /observed evidence = command\/check \+ outcome/, /risks, blocker/]) assert.match(guidance, boundary);
  assert.match(guidance, /rg, targeted reads/);
  assert.match(guidance, /bounded tool output/);
  assert.match(guidance, /Reuse findings; rescan only changed files or new evidence/);
  assert.ok(Buffer.byteLength(promptFor(capsule)) < Buffer.byteLength(baselinePromptFor(capsule)));
  assert.equal(promptFor(capsule), promptFor(capsule));
  capsule.task.limits = {maxResultBytes: 1536, toolOutputTokens: 800};
  assert.deepEqual(JSON.parse(promptFor(capsule)).limits, {resultBytes: 1536, toolOutputTokens: 800});
});

test('status retains observed usage, verification, review evidence and exact artifact path without digests', () => {
  const result = fixtures().results.concise_candidate;
  const before = JSON.stringify(result), summary = summarizeResult(result, artifact);
  for (const field of ['taskId', 'attemptId', 'status', 'execution', 'reason', 'verification', 'mutationState', 'retryAllowed']) {
    assert.deepEqual(summary[field], result[field]);
  }
  assert.equal(summary.resultPath, artifact);
  assert.equal(summary.schema, 'vulpora.session-status/v1');
  assert.deepEqual(summary.runtime.usage, result.runtime.usage);
  assert.equal(summary.runtime.backendIdentity, 'NOT_ATTESTED');
  assert.equal(summary.runtime.descendantCleanup, 'NOT_ATTESTED');
  assert.deepEqual(summary.candidate.evidence, result.candidate.evidence);
  assert.deepEqual(summary.candidate.risks, []);
  assert.equal(summary.candidate.blocker, null);
  assert.equal(summary.preview, undefined);
  assert.doesNotMatch(JSON.stringify(summary), /Sha256|thread-offline-fixture/);
  assert.equal(JSON.stringify(result), before);
});

test('failure, unavailable usage and unresolved budget accounting remain explicit', () => {
  const result = fixtures().results.failed_usage_unavailable;
  const summary = summarizeResult(result, artifact);
  assert.equal(summary.status, 'failed');
  assert.equal(summary.reason, 'TIME_BUDGET_EXCEEDED');
  assert.equal(summary.runtime.reason, 'TIME_BUDGET_EXCEEDED');
  assert.equal(summary.runtime.signal, 'SIGTERM');
  assert.equal(summary.runtime.exitCode, null);
  assert.equal(summary.mutationState, 'unknown');
  assert.equal(summary.verification, 'NOT_VERIFIED');
  assert.equal(summary.retryAllowed, false);
  assert.deepEqual(summary.runtime.usage, {source: 'unavailable', reason: 'NO_FINAL_USAGE_EVENT'});
  assert.deepEqual(summary.budget, result.budget);
  assert.equal(summary.candidate, null);
  delete result.runtime.usage;
  assert.deepEqual(summarizeResult(result, artifact).runtime.usage, {source: 'unavailable'});
});

test('review previews bound escaped Unicode, report omissions, and never shorten file paths', () => {
  const result = fixtures().results.concise_candidate;
  const longText = '\"\\\n😀한'.repeat(250);
  const files = ['x'.repeat(1024) + '.js', ...Array.from({length: 127}, (_, index) => `src/file-${index}.js`)];
  result.scopedFilesChanged = files;
  Object.assign(result.candidate, {status: 'blocked', summary: longText, changed_files: files,
    evidence: Array(32).fill(longText), risks: Array(16).fill(longText), blocker: longText});
  result.status = 'blocked';
  const summary = summarizeResult(result, artifact);
  assert.equal(summary.status, 'blocked');
  assert.equal(summary.candidate.status, 'blocked');
  assert.ok(summary.candidate.blocker.endsWith('…'));
  assert.ok(summary.preview.truncatedFields.includes('candidate.blocker'));
  assert.ok(summary.preview.truncatedFields.includes('candidate.summary'));
  assert.equal(summary.candidate.evidence.length, 3);
  assert.equal(summary.candidate.risks.length, 3);
  assert.equal(summary.preview.omittedItems['candidate.evidence'], 29);
  assert.equal(summary.preview.omittedItems['candidate.risks'], 13);
  assert.equal(summary.preview.omittedItems['candidate.changed_files'], 124);
  assert.deepEqual(summary.candidate.changed_files, files.slice(1, 5));
  assert.deepEqual(summary.scopedFilesChanged, files.slice(1, 5));
  assert.ok(Buffer.byteLength(JSON.stringify(summary.candidate.summary)) <= 386);
  assert.ok(Buffer.byteLength(JSON.stringify(summary.candidate.blocker)) <= 514);
  assert.ok(Buffer.byteLength(JSON.stringify(summary)) < 6000);
  assert.equal(JSON.stringify(summary), JSON.stringify(summarizeResult(result, artifact)));
  assert.doesNotMatch(JSON.stringify(summary), /\\ud83d(?!\\ude00)|�/);
});

test('unknown fields and raw budget attempts cannot expand a polling response', () => {
  const result = fixtures().results.failed_usage_unavailable;
  const raw = 'raw-private-transcript'.repeat(10000);
  result.extra = raw; result.runtime.stdout = raw; result.runtime.usage.raw = raw;
  result.budget.attempts = [{transcript: raw}];
  result.budget.unresolvedAttempts = ['attempt-one', 'attempt-two'];
  const summary = summarizeResult(result, artifact);
  assert.equal(summary.budget.unresolvedAttempts, 2);
  assert.doesNotMatch(JSON.stringify(summary), /raw-private-transcript|attempt-one|attempt-two/);
  assert.ok(Buffer.byteLength(JSON.stringify(summary)) < 2500);
  assert.throws(() => summarizeResult(result, 'relative/result.json'), /INVALID_SESSION_SUMMARY_INPUT/);
});

test('byte audit is reproducible and distinguishes synthetic bytes from observed tokens', () => {
  const report = measure();
  assert.deepEqual(report, measure());
  assert.equal(report.measurementKind, 'utf8_serialized_bytes');
  assert.equal(report.modelCalls, 0);
  assert.equal(report.tokenUsage, 'unmeasured');
  assert.ok(report.prompt.total.savedBytes > 0);
  assert.equal(report.prompt.total.savedBytes,
    report.prompt.instructions.savedBytes - report.prompt.addedLimitFieldsBytes + report.prompt.removedRedundantSchemaBytes);
  for (const item of report.polling) {
    assert.equal(item.savedBytes, item.baselineBytes - item.currentBytes);
    assert.ok(item.savedBytes > 0, item.fixture);
  }
});
