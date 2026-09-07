#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const validator = path.join(root, 'scripts/validate-review-report.js');
const { validateReport } = require(validator);
const fixtures = path.join(__dirname, 'fixtures');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-test-quality-review-'));

function fixture(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(fixtures, relativePath), 'utf8'));
}

function junitXml(symbols, options = {}) {
  const failures = options.failure ? 1 : 0;
  const cases = symbols.map((symbol) => {
    const separator = symbol.lastIndexOf('.');
    const classname = separator === -1 ? symbol : symbol.slice(0, separator);
    const name = separator === -1 ? symbol : symbol.slice(separator + 1);
    return options.failure ? `<testcase classname="${classname}" name="${name}"><failure message="mutation survived"/></testcase>`
      : `<testcase classname="${classname}" name="${name}"/>`;
  }).join('');
  const wrappedCases = options.arbitraryText ? `unexpected wrapper text${cases}` : cases;
  const declaredCount = options.declaredCount ?? symbols.length;
  return `<?xml version="1.0" encoding="UTF-8"?><testsuite tests="${declaredCount}" failures="${failures}" errors="0" skipped="0">${wrappedCases}</testsuite>`;
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function prepareExecutionArtifacts(reportPath, report, options) {
  if (options.artifacts === false) return;
  const baseDirectory = path.dirname(reportPath);
  for (const execution of report.execution_evidence) {
    let artifactPath = path.resolve(baseDirectory, execution.report_path);
    const symbols = options.caseSymbolsById?.[execution.id] ?? execution.executed_test_symbols;
    const content = options.malformedExecutionIds?.includes(execution.id) ? '<testsuite><testcase>' : junitXml(symbols, {
      failure: options.failureExecutionIds?.includes(execution.id),
      arbitraryText: options.arbitraryTextExecutionIds?.includes(execution.id),
      declaredCount: options.declaredCountById?.[execution.id],
    });
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    if (options.symlinkAncestorExecutionIds?.includes(execution.id)) {
      const targetDirectory = path.join(baseDirectory, 'outside-report-directory');
      const linkDirectory = path.join(baseDirectory, 'linked-report-directory');
      fs.mkdirSync(targetDirectory, { recursive: true });
      fs.symlinkSync(path.basename(targetDirectory), linkDirectory);
      execution.report_path = 'linked-report-directory/result.xml';
      artifactPath = path.join(targetDirectory, 'result.xml');
      fs.writeFileSync(artifactPath, content);
    } else if (options.symlinkExecutionIds?.includes(execution.id)) {
      const target = `${artifactPath}.target`;
      fs.writeFileSync(target, content);
      fs.symlinkSync(path.basename(target), artifactPath);
    } else {
      fs.writeFileSync(artifactPath, content);
    }
    if (options.syncHash !== false) execution.report_sha256 = sha256(content);
    if (options.syncMtime !== false) execution.report_mtime_epoch_ms = Math.floor(fs.statSync(artifactPath).mtimeMs);
  }
}

function invoke(name, report, options = {}) {
  const reportPath = path.join(work, name, 'report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  prepareExecutionArtifacts(reportPath, report, options);
  fs.writeFileSync(reportPath, `${JSON.stringify(report)}\n`);
  return spawnSync(process.execPath, [validator, reportPath], { encoding: 'utf8' });
}

function valid(name, report, verdict, options) {
  const result = invoke(name, report, options);
  assert.equal(result.status, 0, `${name}: validator exit: ${result.stderr}`);
  const output = JSON.parse(result.stdout);
  assert.equal(output.valid, true, `${name}: valid marker`);
  assert.equal(output.verdict, verdict, `${name}: verdict`);
  assert.equal(result.stderr, '', `${name}: stderr`);
}

function invalid(name, report, code, options) {
  const result = invoke(name, report, options);
  assert.equal(result.status, 1, `${name}: validator exit`);
  assert.equal(result.stdout, '', `${name}: must not emit success JSON`);
  assert.match(result.stderr, new RegExp(`^INVALID_REPORT: ${code}`), `${name}: fail-closed reason`);
}

try {
  valid('pass', fixture('valid/review-report.json'), 'PASS');
  valid('audit-only', fixture('valid/reviewed-without-execution.json'), 'REVIEWED_WITHOUT_EXECUTION');

  const programmatic = fixture('valid/review-report.json');
  const programmaticReportPath = path.join(work, 'programmatic', 'report.json');
  fs.mkdirSync(path.dirname(programmaticReportPath), { recursive: true });
  prepareExecutionArtifacts(programmaticReportPath, programmatic, {});
  assert.throws(() => validateReport(programmatic), /BASE_DIRECTORY_REQUIRED/,
    'evidence-bearing programmatic validation must receive an explicit base directory');
  assert.equal(validateReport(programmatic, { baseDirectory: path.dirname(programmaticReportPath) }).verdict, 'PASS',
    'programmatic validation resolves reports from an explicit base directory');

  for (const name of ['missing-oracle.json', 'missing-line-evidence.json']) {
    const invalidReport = fixture(`invalid/${name}`);
    const result = invoke(`fixture-${name}`, invalidReport);
    assert.equal(result.status, 1, `${name}: invalid fixture rejected`);
    assert.match(result.stderr, /^INVALID_REPORT: /, `${name}: reason emitted`);
  }

  const zeroExecuted = fixture('valid/review-report.json');
  zeroExecuted.execution_evidence[0].executed_count = 0;
  invalid('zero-executed-pass', zeroExecuted, 'ZERO_EXECUTED_EVIDENCE');

  const stale = fixture('valid/review-report.json');
  stale.execution_evidence[0].started_at_epoch_ms = Date.now() + 30_000;
  invalid('stale-report-pass', stale, 'STALE_EXECUTION_EVIDENCE');

  const cacheOnly = fixture('valid/review-report.json');
  cacheOnly.execution_evidence[0].cache_state = 'UP_TO_DATE';
  invalid('cache-only-pass', cacheOnly, 'CACHE_ONLY_EXECUTION_EVIDENCE');

  const nonexistent = fixture('valid/review-report.json');
  invalid('nonexistent-execution-report', nonexistent, 'EXECUTION_REPORT_UNREADABLE', { artifacts: false });

  const wrongHash = fixture('valid/review-report.json');
  invalid('wrong-execution-report-hash', wrongHash, 'EXECUTION_REPORT_HASH_MISMATCH', { syncHash: false });

  const wrongMtime = fixture('valid/review-report.json');
  invalid('wrong-execution-report-mtime', wrongMtime, 'EXECUTION_REPORT_MTIME_MISMATCH', { syncMtime: false });

  const symlink = fixture('valid/review-report.json');
  invalid('symlink-execution-report', symlink, 'EXECUTION_REPORT_SYMLINK', {
    symlinkExecutionIds: ['EXEC-PRICE-NEGATIVE'],
  });

  const symlinkAncestor = fixture('valid/review-report.json');
  invalid('symlink-ancestor-execution-report', symlinkAncestor, 'EXECUTION_REPORT_SYMLINK', {
    symlinkAncestorExecutionIds: ['EXEC-PRICE-NEGATIVE'],
  });

  const nonzeroPassExecution = fixture('valid/review-report.json');
  nonzeroPassExecution.execution_evidence[0].exit_code = 1;
  invalid('nonzero-pass-execution', nonzeroPassExecution, 'PASS_WITH_NONZERO_EXECUTION');

  const preReviewExecution = fixture('valid/review-report.json');
  preReviewExecution.revision.review_started_at_epoch_ms = preReviewExecution.execution_evidence[0].started_at_epoch_ms + 1;
  invalid('pre-review-pass-execution', preReviewExecution, 'PASS_WITH_PRE_REVIEW_EXECUTION');

  const missingSymbol = fixture('valid/review-report.json');
  invalid('missing-executed-symbol', missingSymbol, 'REQUESTED_TEST_NOT_IN_XML', {
    caseSymbolsById: { 'EXEC-PRICE-NEGATIVE': ['example.OtherTest.otherCase'] },
  });

  const countMismatch = fixture('valid/review-report.json');
  invalid('executed-count-mismatch', countMismatch, 'EXECUTED_COUNT_MISMATCH', {
    caseSymbolsById: { 'EXEC-PRICE-NEGATIVE': [
      'example.PriceCalculatorTest.rejectsNegativePrice', 'example.PriceCalculatorTest.acceptsZeroPrice',
    ] },
  });

  const malformed = fixture('valid/review-report.json');
  invalid('malformed-junit-xml', malformed, 'MALFORMED_JUNIT_XML', {
    malformedExecutionIds: ['EXEC-PRICE-NEGATIVE'],
  });

  const arbitraryText = fixture('valid/review-report.json');
  invalid('arbitrary-junit-wrapper-text', arbitraryText, 'MALFORMED_JUNIT_XML', {
    arbitraryTextExecutionIds: ['EXEC-PRICE-NEGATIVE'],
  });

  const suiteCountMismatch = fixture('valid/review-report.json');
  invalid('junit-suite-count-mismatch', suiteCountMismatch, 'JUNIT_SUITE_COUNT_MISMATCH', {
    declaredCountById: { 'EXEC-PRICE-NEGATIVE': 2 },
  });

  const junitFailure = fixture('valid/review-report.json');
  invalid('passing-report-with-junit-failure', junitFailure, 'PASS_WITH_NONPASSING_JUNIT_TESTCASE', {
    failureExecutionIds: ['EXEC-PRICE-NEGATIVE'],
  });

  const survivor = fixture('valid/review-report.json');
  survivor.behavior_inventory[0].plausible_fault.status = 'SURVIVED';
  invalid('surviving-fault-pass', survivor, 'PASS_WITHOUT_KILLED_FAULT');

  const unsafeEnvironment = fixture('valid/review-report.json');
  unsafeEnvironment.environment_ownership.operations[0].disposable_endpoint = false;
  invalid('unsafe-environment-owner', unsafeEnvironment, 'UNSAFE_ENVIRONMENT_OWNERSHIP');

  const dirtyOverlap = fixture('valid/review-report.json');
  dirtyOverlap.baseline.dirty_entries = [{
    kind: 'unstaged', path: 'src/test/kotlin/example/PriceCalculatorTest.kt',
    byte_sha256: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    mode: '100644', is_binary: false, test_or_fixture_overlap: true,
  }];
  dirtyOverlap.baseline.test_fixture_overlaps = ['src/test/kotlin/example/PriceCalculatorTest.kt'];
  invalid('dirty-test-overlap-pass', dirtyOverlap, 'PASS_WITH_DIRTY_TEST_FIXTURE_OVERLAP');

  const unknownRule = fixture('valid/review-report.json');
  unknownRule.behavior_inventory[0].rule_ids = ['TQR-1'];
  invalid('unknown-rule', unknownRule, 'UNKNOWN_TST_RULE');

  const highFinding = fixture('valid/review-report.json');
  highFinding.findings.push({
    id: 'FIND-HIGH', kind: 'improvement', severity: 'high', confidence: 'high', rule_ids: ['TST-6'],
    path: 'src/test/kotlin/example/PriceCalculatorTest.kt', line: 18,
    observable_contract: 'Negative price must fail.', plausible_fault: 'A missing guard would accept it.',
    evidence: [{ path: 'src/test/kotlin/example/PriceCalculatorTest.kt', line: 18, summary: 'The assertion is absent.' }],
    recommendation: 'Assert the rejection.', behavior_id: 'BEH-PRICE-NEGATIVE',
  });
  invalid('high-finding-pass', highFinding, 'PASS_WITH_HIGH_SEVERITY_FINDING');

  const lowWeakOracle = fixture('valid/review-report.json');
  lowWeakOracle.findings.push({
    id: 'FIND-LOW-WEAK-ORACLE', kind: 'weak_oracle', severity: 'low', confidence: 'high', rule_ids: ['TST-6'],
    path: 'src/test/kotlin/example/PriceCalculatorTest.kt', line: 18,
    observable_contract: 'Negative price must fail.', plausible_fault: 'An implementation-copied expectation would hide a changed result.',
    evidence: [{ path: 'src/test/kotlin/example/PriceCalculatorTest.kt', line: 18, summary: 'The expected value is copied from a production helper.' }],
    recommendation: 'Derive the expected outcome from the public contract.', behavior_id: 'BEH-PRICE-NEGATIVE',
  });
  invalid('low-severity-weak-oracle-pass', lowWeakOracle, 'PASS_WITH_BLOCKING_FINDING');

  const lowImprovement = fixture('valid/review-report.json');
  lowImprovement.findings.push({
    id: 'FIND-LOW-IMPROVEMENT', kind: 'improvement', severity: 'low', confidence: 'medium', rule_ids: ['TST-3'],
    path: 'src/test/kotlin/example/PriceCalculatorTest.kt', line: 18,
    observable_contract: 'Negative price must fail.', plausible_fault: 'No behavior fault; naming could make diagnosis slower.',
    evidence: [{ path: 'src/test/kotlin/example/PriceCalculatorTest.kt', line: 18, summary: 'The test name lacks the triggering condition.' }],
    recommendation: 'Use the local condition-and-behavior naming convention.', behavior_id: 'BEH-PRICE-NEGATIVE',
  });
  valid('low-improvement-pass', lowImprovement, 'PASS');

  const userChangeAudit = fixture('valid/reviewed-without-execution.json');
  userChangeAudit.baseline.dirty_entries = [{
    kind: 'rename', path: 'src/test/kotlin/example/LegacyTest.kt', from_path: 'src/test/kotlin/example/OldLegacyTest.kt',
    byte_sha256: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    mode: '100644', is_binary: false, test_or_fixture_overlap: true,
  }];
  userChangeAudit.baseline.test_fixture_overlaps = ['src/test/kotlin/example/LegacyTest.kt'];
  valid('dirty-user-change-audit', userChangeAudit, 'REVIEWED_WITHOUT_EXECUTION');

  const submoduleAudit = fixture('valid/reviewed-without-execution.json');
  submoduleAudit.baseline.dirty_entries = [{
    kind: 'submodule', path: 'vendor/contract-fixture', byte_sha256: null, mode: '160000', is_binary: false,
    submodule_head: '0123456789abcdef', test_or_fixture_overlap: false,
  }];
  valid('opaque-submodule-audit', submoduleAudit, 'REVIEWED_WITHOUT_EXECUTION');

  console.log('test-quality-review validator contract: PASS');
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
