#!/usr/bin/env node
'use strict';

// Deliberately dependency-free: report validation must be deterministic in a fresh install.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');

function fail(code) {
  process.stderr.write(`${code}\n`);
  process.exit(1);
}

if (process.argv.length !== 3) fail('USAGE_REPORT_PATH');
const refactoringReportPath = path.resolve(process.argv[2]);
let report;
try {
  const stat = fs.lstatSync(refactoringReportPath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('REPORT_UNREADABLE');
  report = JSON.parse(fs.readFileSync(refactoringReportPath, 'utf8'));
} catch {
  fail('INVALID_JSON');
}
const reportDirectory = path.dirname(refactoringReportPath);

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const array = (value) => Array.isArray(value);
const oneOf = (value, values) => values.includes(value);
const unique = (values) => new Set(values).size === values.length;
const requireKeys = (value, keys, code) => {
  if (!object(value) || !keys.every((key) => Object.hasOwn(value, key))) fail(code);
};
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_MODE = /^(100644|100755|120000|160000)$/;
const USER_CHANGE_STATES = ['staged', 'unstaged', 'untracked', 'rename', 'delete', 'file_mode', 'submodule'];

const TEST_ROOTS = [
  'src/test/', 'test/', 'tests/', '__tests__/',
];
const FIXTURE_ROOTS = [
  'src/test/resources/', 'src/testFixtures/', 'test/resources/', 'tests/fixtures/', '__tests__/fixtures/', 'fixtures/test/',
];

function normalizedPath(path) {
  return nonEmpty(path)
    && !path.startsWith('/')
    && !path.includes('\\')
    && !path.split('/').some((part) => part === '' || part === '.' || part === '..');
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function artifactPath(relativePath, code) {
  if (!normalizedPath(relativePath)) fail(code);
  let baseStat;
  try { baseStat = fs.lstatSync(reportDirectory); } catch { fail(code); }
  if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) fail(code);
  const absolutePath = path.resolve(reportDirectory, relativePath);
  if (absolutePath !== reportDirectory && !absolutePath.startsWith(`${reportDirectory}${path.sep}`)) fail(code);
  const parts = relativePath.split('/');
  let cursor = reportDirectory;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    let segment;
    try { segment = fs.lstatSync(cursor); } catch { fail(code); }
    if (segment.isSymbolicLink()) fail(code);
  }
  let stat;
  try { stat = fs.lstatSync(absolutePath); } catch { fail(code); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(code);
  let baseRealPath;
  let artifactRealPath;
  try {
    baseRealPath = fs.realpathSync(reportDirectory);
    artifactRealPath = fs.realpathSync(absolutePath);
  } catch { fail(code); }
  if (artifactRealPath !== baseRealPath && !artifactRealPath.startsWith(`${baseRealPath}${path.sep}`)) fail(code);
  return { absolutePath, stat, bytes: fs.readFileSync(absolutePath) };
}

function exactSha256(value, code) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code);
}

function validateReviewReference(input) {
  const artifact = artifactPath(input.review_report_path, 'REVIEW_REPORT_UNREADABLE');
  exactSha256(input.review_report_sha256, 'REVIEW_REPORT_SHA256_INVALID');
  if (sha256(artifact.bytes) !== input.review_report_sha256) fail('REVIEW_REPORT_SHA256_MISMATCH');
  const siblingValidator = path.resolve(__dirname, '../../test-quality-review/scripts/validate-review-report.js');
  let result;
  try {
    result = childProcess.spawnSync(process.execPath, [siblingValidator, artifact.absolutePath], { encoding: 'utf8' });
  } catch {
    fail('REVIEW_REPORT_VALIDATOR_UNAVAILABLE');
  }
  if (result.error || result.status !== 0) fail('REVIEW_REPORT_INVALID');
  let review;
  try { review = JSON.parse(artifact.bytes.toString('utf8')); } catch { fail('REVIEW_REPORT_INVALID'); }
  if (review.schema !== 'vulpora.test-quality-review/v1' || !array(review.findings)) fail('REVIEW_REPORT_INVALID');
  const findings = new Map();
  for (const findingId of input.finding_ids) {
    const finding = review.findings.find((candidate) => candidate && candidate.id === findingId);
    if (!finding || !normalizedPath(finding.path)) fail('FINDING_NOT_IN_REVIEW');
    findings.set(findingId, finding.path);
  }
  return findings;
}

function pathKind(path) {
  if (!normalizedPath(path)) return null;
  if (FIXTURE_ROOTS.some((root) => path.startsWith(root))) return 'fixture';
  if (TEST_ROOTS.some((root) => path.startsWith(root))) return 'test';
  return null;
}

function validateUserEntries(entries, code) {
  if (!array(entries)) fail(code);
  for (const entry of entries) {
    requireKeys(entry, ['path', 'state', 'byte_hash', 'mode'], code);
    if (!normalizedPath(entry.path) || !oneOf(entry.state, USER_CHANGE_STATES) || !GIT_MODE.test(entry.mode)) fail(code);
    if (entry.state === 'submodule') {
      if (entry.byte_hash !== null || entry.mode !== '160000') fail(code);
    } else if (entry.state === 'delete') {
      if (entry.byte_hash !== null && !SHA256.test(entry.byte_hash)) fail(code);
    } else if (!SHA256.test(entry.byte_hash)) fail(code);
    if (entry.state === 'rename') {
      if (!normalizedPath(entry.rename_from)) fail(code);
    } else if (entry.rename_from !== undefined) fail(code);
  }
}

function junitTagEnd(xml, start, code) {
  let quote = null;
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '>') return index;
  }
  fail(code);
}

function junitAttributes(source, code) {
  const attributes = {};
  let index = 0;
  while (index < source.length) {
    while (/\s/.test(source[index] ?? '')) index += 1;
    if (index === source.length) break;
    const match = source.slice(index).match(/^([A-Za-z_:][A-Za-z0-9_.:-]*)/);
    if (!match) fail(code);
    index += match[0].length;
    while (/\s/.test(source[index] ?? '')) index += 1;
    if (source[index] !== '=') fail(code);
    index += 1;
    while (/\s/.test(source[index] ?? '')) index += 1;
    const quote = source[index];
    if (quote !== '"' && quote !== "'") fail(code);
    const end = source.indexOf(quote, index + 1);
    if (end === -1 || Object.hasOwn(attributes, match[1])) fail(code);
    attributes[match[1]] = source.slice(index + 1, end);
    index = end + 1;
  }
  return attributes;
}

function parseJUnitXml(bytes, code) {
  const xml = bytes.toString('utf8');
  if (xml.includes('\u0000') || xml.includes('\uFFFD') || /<!DOCTYPE|<!ENTITY/i.test(xml)
    || /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(xml)) fail('MALFORMED_JUNIT_XML');
  const stack = [];
  const testcases = [];
  let roots = 0;
  let root = null;
  let index = 0;
  while (index < xml.length) {
    const start = xml.indexOf('<', index);
    if (start === -1) {
      if (stack.length !== 0 || xml.slice(index).trim() !== '') fail('MALFORMED_JUNIT_XML');
      break;
    }
    if (stack.length === 0 && xml.slice(index, start).trim() !== '') fail('MALFORMED_JUNIT_XML');
    if (xml.startsWith('<!--', start)) {
      const end = xml.indexOf('-->', start + 4);
      if (end === -1) fail('MALFORMED_JUNIT_XML');
      index = end + 3;
      continue;
    }
    if (xml.startsWith('<?', start)) {
      const end = xml.indexOf('?>', start + 2);
      if (end === -1) fail('MALFORMED_JUNIT_XML');
      index = end + 2;
      continue;
    }
    if (xml.startsWith('<![CDATA[', start)) {
      const end = xml.indexOf(']]>', start + 9);
      if (end === -1) fail('MALFORMED_JUNIT_XML');
      index = end + 3;
      continue;
    }
    if (xml.startsWith('<!', start)) fail('MALFORMED_JUNIT_XML');
    const end = junitTagEnd(xml, start + 1, code);
    const token = xml.slice(start + 1, end).trim();
    if (token.startsWith('/')) {
      const name = token.slice(1).trim();
      const frame = stack.pop();
      if (!frame || frame.name !== name) fail('MALFORMED_JUNIT_XML');
    } else {
      const selfClosing = token.endsWith('/');
      const body = (selfClosing ? token.slice(0, -1) : token).trim();
      const match = body.match(/^([A-Za-z_:][A-Za-z0-9_.:-]*)([\s\S]*)$/);
      if (!match) fail('MALFORMED_JUNIT_XML');
      const name = match[1];
      const attributes = junitAttributes(match[2], code);
      if (stack.length === 0) { roots += 1; root = name; }
      const testcase = name === 'testcase'
        ? { classname: attributes.classname, name: attributes.name, result: 'PASS' }
        : null;
      if (name === 'testcase' && (!testcase.classname || !testcase.name)) fail('MALFORMED_JUNIT_XML');
      if (testcase) testcases.push(testcase);
      if (['failure', 'error', 'skipped'].includes(name)) {
        const active = [...stack].reverse().find((frame) => frame.testcase)?.testcase;
        if (!active) fail('MALFORMED_JUNIT_XML');
        active.result = name === 'skipped' ? 'SKIPPED' : 'FAIL';
      }
      if (!selfClosing) stack.push({ name, testcase });
    }
    index = end + 1;
  }
  if (stack.length !== 0 || roots !== 1 || !['testsuite', 'testsuites'].includes(root) || testcases.length < 1) fail('MALFORMED_JUNIT_XML');
  return testcases;
}

function testcaseMatches(symbol, testcase) {
  return symbol === testcase.classname || symbol === testcase.name || symbol === `${testcase.classname}.${testcase.name}`;
}

function validateExecution(value, code, expectedResult = 'PASS') {
  requireKeys(value, [
    'command', 'exit_code', 'executed_count', 'fresh', 'cache_state', 'started_at_epoch_ms', 'report_path', 'report_sha256',
    'report_mtime_epoch_ms', 'executed_test_symbols',
  ], code);
  if (!nonEmpty(value.command) || !Number.isInteger(value.exit_code) || !Number.isInteger(value.executed_count) || value.executed_count < 1
    || value.fresh !== true || value.cache_state !== 'EXECUTED' || !Number.isInteger(value.started_at_epoch_ms)
    || value.started_at_epoch_ms < 0 || !normalizedPath(value.report_path) || !Number.isInteger(value.report_mtime_epoch_ms)
    || value.report_mtime_epoch_ms < value.started_at_epoch_ms) fail(code);
  exactSha256(value.report_sha256, code);
  if (!array(value.executed_test_symbols) || value.executed_test_symbols.length < 1
    || !value.executed_test_symbols.every(nonEmpty) || !unique(value.executed_test_symbols)) fail(code);
  const artifact = artifactPath(value.report_path, 'EXECUTION_REPORT_UNREADABLE');
  if (sha256(artifact.bytes) !== value.report_sha256 || Math.floor(artifact.stat.mtimeMs) !== value.report_mtime_epoch_ms) {
    fail('EXECUTION_REPORT_EVIDENCE_MISMATCH');
  }
  const testcases = parseJUnitXml(artifact.bytes, code);
  if (value.executed_count !== testcases.length) fail('EXECUTION_COUNT_MISMATCH');
  if (expectedResult === 'PASS' && (value.exit_code !== 0 || testcases.some((testcase) => testcase.result !== 'PASS'))) fail('PASS_EXECUTION_NOT_GREEN');
  if (expectedResult === 'FAIL' && (value.exit_code === 0 || !testcases.some((testcase) => testcase.result === 'FAIL'))) fail('FAIL_EXECUTION_NOT_RED');
  for (const symbol of value.executed_test_symbols) {
    if (!testcases.some((testcase) => testcaseMatches(symbol, testcase))) fail('EXECUTED_TEST_SYMBOL_MISSING');
  }
  return testcases;
}

function validateSelectedExecution(value, code, expectedResult = 'PASS') {
  const testcases = validateExecution(value, code, expectedResult);
  if (!array(value.selected_test_symbols) || value.selected_test_symbols.length < 1
    || !value.selected_test_symbols.every(nonEmpty) || !unique(value.selected_test_symbols)) fail(code);
  for (const symbol of value.selected_test_symbols) {
    if (!value.executed_test_symbols.includes(symbol)) fail('SELECTED_TEST_SYMBOL_NOT_EXECUTED');
    const testcase = testcases.find((candidate) => testcaseMatches(symbol, candidate));
    if (!testcase || testcase.result !== expectedResult) fail(expectedResult === 'PASS' ? 'SELECTED_TEST_NOT_GREEN' : 'SELECTED_TEST_NOT_RED');
  }
}

if (!object(report) || report.schema_version !== 'vulpora.test-refactoring/v1') fail('SCHEMA_VERSION');
requireKeys(report, [
  'input', 'profile', 'workflow_write_scope', 'workspace_baseline', 'baseline', 'smell_iterations', 'finding_results',
  'changes', 'mutation_capability', 'negative_proof', 'verification_ladder', 'postflight', 'verdict',
], 'MISSING_REQUIRED_FIELD');

requireKeys(report.input, ['review_report_path', 'review_report_sha256', 'finding_ids', 'finding_owned_fixture_paths'], 'INVALID_INPUT');
if (!normalizedPath(report.input.review_report_path) || !nonEmpty(report.input.review_report_sha256)
  || !array(report.input.finding_ids) || report.input.finding_ids.length < 1
  || !report.input.finding_ids.every(nonEmpty) || !unique(report.input.finding_ids)
  || !array(report.input.finding_owned_fixture_paths)) fail('INVALID_INPUT');
const findingIds = report.input.finding_ids;
const reviewedFindingPaths = validateReviewReference(report.input);
const ownedFixtureKeys = new Set();
for (const entry of report.input.finding_owned_fixture_paths) {
  requireKeys(entry, ['finding_id', 'path'], 'INVALID_INPUT');
  if (!findingIds.includes(entry.finding_id) || pathKind(entry.path) !== 'fixture') fail('INVALID_INPUT');
  const key = `${entry.finding_id}\u0000${entry.path}`;
  if (ownedFixtureKeys.has(key)) fail('INVALID_INPUT');
  ownedFixtureKeys.add(key);
}

requireKeys(report.profile, ['language', 'runtime', 'framework', 'mode', 'evidence'], 'INVALID_PROFILE');
const supported = report.profile.language === 'kotlin' && report.profile.runtime === 'jvm'
  && oneOf(report.profile.framework, ['junit-jupiter', 'kotest']);
if (!oneOf(report.profile.mode, ['AUTO_REFACTOR', 'AUDIT_ONLY'])) fail('INVALID_PROFILE');
if (!array(report.profile.evidence) || report.profile.evidence.length < 1 || !report.profile.evidence.every(nonEmpty)) fail('INVALID_PROFILE');
if (report.profile.mode === 'AUTO_REFACTOR' && !supported) fail('UNSUPPORTED_PROFILE_MUST_AUDIT_ONLY');
if (report.profile.mode === 'AUDIT_ONLY' && supported && report.verdict === 'PASS') fail('AUDIT_ONLY_CANNOT_PASS');

validateUserEntries(report.workspace_baseline.user_changes, 'INVALID_WORKSPACE_BASELINE');
if (!/^[a-f0-9]{7,64}$/.test(report.workspace_baseline.head)
  || !/^[a-f0-9]{7,64}$/.test(report.workspace_baseline.index_tree)) fail('INVALID_WORKSPACE_BASELINE');
if (!array(report.workflow_write_scope) || report.workflow_write_scope.length < 1) fail('INVALID_WRITE_SCOPE');
const scopeKeys = new Set();
for (const entry of report.workflow_write_scope) {
  requireKeys(entry, ['finding_id', 'path', 'kind'], 'INVALID_WRITE_SCOPE');
  const kind = pathKind(entry.path);
  const reviewPath = reviewedFindingPaths.get(entry.finding_id);
  const ownedFixture = ownedFixtureKeys.has(`${entry.finding_id}\u0000${entry.path}`);
  if (!findingIds.includes(entry.finding_id) || !kind || entry.kind !== kind
    || (entry.path !== reviewPath && !(kind === 'fixture' && ownedFixture))) fail('FINDING_PATH_MISMATCH');
  const key = `${entry.finding_id}\u0000${entry.path}`;
  if (scopeKeys.has(key)) fail('DUPLICATE_WRITE_SCOPE');
  scopeKeys.add(key);
}

const overlapsUserChange = report.workspace_baseline.user_changes.some((entry) =>
  report.workflow_write_scope.some((scope) => scope.path === entry.path || scope.path === entry.rename_from));

if (!array(report.changes)) fail('INVALID_CHANGES');
const allowedClassifications = ['new-behavior-proof', 'intentional-contract-update', 'strength-preserving-maintenance'];
for (const change of report.changes) {
  requireKeys(change, ['finding_id', 'path', 'classification', 'evidence'], 'INVALID_CHANGE');
  if (!findingIds.includes(change.finding_id)) fail('CHANGE_OUTSIDE_FINDING_SCOPE');
  if (!scopeKeys.has(`${change.finding_id}\u0000${change.path}`)) fail('CHANGE_OUTSIDE_WRITE_SCOPE');
  if (!pathKind(change.path)) fail('FORBIDDEN_CHANGED_PATH');
  if (change.classification === 'weakening') fail('WEAKENING_BLOCKED');
  if (!oneOf(change.classification, allowedClassifications) || !nonEmpty(change.evidence)) fail('INVALID_TST19_CLASSIFICATION');
  if (change.classification === 'intentional-contract-update' && !nonEmpty(change.contract_anchor)) fail('MISSING_CONTRACT_UPDATE_ANCHOR');
}

if (!array(report.smell_iterations) || report.smell_iterations.length !== findingIds.length) fail('ONE_SMELL_AT_A_TIME_REQUIRED');
const iterated = [];
for (let index = 0; index < report.smell_iterations.length; index += 1) {
  const iteration = report.smell_iterations[index];
  requireKeys(iteration, ['sequence', 'finding_id', 'status'], 'INVALID_SMELL_ITERATION');
  if (iteration.sequence !== index + 1 || !findingIds.includes(iteration.finding_id)
    || !oneOf(iteration.status, ['RESOLVED', 'NOT_APPLICABLE', 'BLOCKED'])) fail('INVALID_SMELL_ITERATION');
  iterated.push(iteration.finding_id);
}
if (!unique(iterated) || findingIds.some((id) => !iterated.includes(id))) fail('ONE_SMELL_AT_A_TIME_REQUIRED');

if (!array(report.finding_results) || report.finding_results.length !== findingIds.length) fail('INVALID_FINDING_RESULTS');
const resultIds = [];
for (const result of report.finding_results) {
  requireKeys(result, ['finding_id', 'outcome', 'evidence'], 'INVALID_FINDING_RESULTS');
  if (!findingIds.includes(result.finding_id) || !oneOf(result.outcome, ['RESOLVED', 'NOT_APPLICABLE', 'BLOCKED']) || !nonEmpty(result.evidence)) fail('INVALID_FINDING_RESULTS');
  resultIds.push(result.finding_id);
}
if (!unique(resultIds) || findingIds.some((id) => !resultIds.includes(id))) fail('INVALID_FINDING_RESULTS');
for (const iteration of report.smell_iterations) {
  const result = report.finding_results.find((item) => item.finding_id === iteration.finding_id);
  if (result.outcome !== iteration.status) fail('FINDING_ITERATION_RESULT_MISMATCH');
}

const auditOnly = report.profile.mode === 'AUDIT_ONLY';
if (auditOnly && report.changes.length !== 0) fail('AUDIT_ONLY_MUST_NOT_EDIT');
if (overlapsUserChange && report.verdict !== 'BLOCKED') fail('USER_CHANGE_OVERLAP');
if (report.verdict === 'BLOCKED' && overlapsUserChange) {
  if (!object(report.blocker) || report.blocker.code !== 'USER_CHANGE_OVERLAP') fail('USER_CHANGE_OVERLAP');
}

if (!auditOnly) {
  validateSelectedExecution(report.baseline, 'INVALID_BASELINE');
  if (report.baseline.completed_before_first_edit !== true) fail('BASELINE_NOT_FIRST');
}
else if (!object(report.baseline) || !oneOf(report.baseline.status, ['NOT_RUN', 'PASS'])) fail('INVALID_AUDIT_BASELINE');

requireKeys(report.mutation_capability, ['status', 'tool', 'target', 'authority', 'restoration'], 'INVALID_MUTATION_CAPABILITY');
const capabilities = ['configured', 'controlled_allowed', 'replica_only', 'unavailable', 'safety_blocked'];
if (!oneOf(report.mutation_capability.status, capabilities) || !nonEmpty(report.mutation_capability.authority)) fail('INVALID_MUTATION_CAPABILITY');
if (report.mutation_capability.status === 'configured'
  && (!nonEmpty(report.mutation_capability.tool) || !nonEmpty(report.mutation_capability.target))) fail('INVALID_MUTATION_CAPABILITY');
if (report.mutation_capability.status === 'controlled_allowed' && !nonEmpty(report.mutation_capability.tool)) fail('INVALID_MUTATION_CAPABILITY');
if (['controlled_allowed', 'replica_only'].includes(report.mutation_capability.status)
  && (!nonEmpty(report.mutation_capability.target) || !object(report.mutation_capability.restoration))) fail('INVALID_MUTATION_CAPABILITY');
if (report.mutation_capability.status === 'controlled_allowed') {
  const restored = report.mutation_capability.restoration;
  requireKeys(restored, ['status', 'original_byte_hash', 'restored_byte_hash', 'diff_after_restore'], 'MUTATION_RESTORATION_MISSING');
  if (restored.status !== 'RESTORED' || restored.original_byte_hash !== restored.restored_byte_hash
    || restored.diff_after_restore !== 'clean') fail('MUTATION_RESTORATION_MISSING');
  exactSha256(restored.original_byte_hash, 'MUTATION_RESTORATION_MISSING');
  exactSha256(restored.restored_byte_hash, 'MUTATION_RESTORATION_MISSING');
  const target = artifactPath(report.mutation_capability.target, 'MUTATION_TARGET_UNREADABLE');
  if (sha256(target.bytes) !== restored.restored_byte_hash) fail('MUTATION_RESTORATION_MISSING');
}

requireKeys(report.negative_proof, ['status', 'method', 'plausible_fault', 'selected_test_observation', 'restored_green'], 'INVALID_NEGATIVE_PROOF');
if (!oneOf(report.negative_proof.status, ['PASS', 'NOT_RUN', 'BLOCKED']) || !nonEmpty(report.negative_proof.plausible_fault)
  || !oneOf(report.negative_proof.selected_test_observation, ['FAIL', 'NOT_RUN'])
  || !oneOf(report.negative_proof.restored_green, ['PASS', 'NOT_RUN'])) fail('INVALID_NEGATIVE_PROOF');
const methods = ['configured_mutation_tool', 'controlled_mutation', 'replica_mutation', 'preexisting_red'];
if (!oneOf(report.negative_proof.method, methods)) fail('INVALID_NEGATIVE_PROOF');
if (report.negative_proof.status === 'PASS'
  && (report.negative_proof.selected_test_observation !== 'FAIL' || report.negative_proof.restored_green !== 'PASS')) fail('NEGATIVE_PROOF_INSUFFICIENT');
if (report.negative_proof.status === 'PASS') {
  requireKeys(report.negative_proof, ['failing_before_execution', 'failing_after_execution', 'restored_green_execution'], 'NEGATIVE_PROOF_EVIDENCE_MISSING');
  validateSelectedExecution(report.negative_proof.failing_before_execution, 'NEGATIVE_PROOF_EVIDENCE_MISSING', 'FAIL');
  validateSelectedExecution(report.negative_proof.failing_after_execution, 'NEGATIVE_PROOF_EVIDENCE_MISSING', 'FAIL');
  validateSelectedExecution(report.negative_proof.restored_green_execution, 'NEGATIVE_PROOF_EVIDENCE_MISSING', 'PASS');
}
if (report.negative_proof.method === 'configured_mutation_tool' && report.mutation_capability.status !== 'configured') fail('MUTATION_CAPABILITY_MISMATCH');
if (report.negative_proof.method === 'controlled_mutation' && report.mutation_capability.status !== 'controlled_allowed') fail('MUTATION_CAPABILITY_MISMATCH');
if (report.negative_proof.method === 'replica_mutation' && report.mutation_capability.status !== 'replica_only') fail('MUTATION_CAPABILITY_MISMATCH');
if (['controlled_mutation', 'replica_mutation'].includes(report.negative_proof.method)) {
  const restored = report.mutation_capability.restoration;
  requireKeys(restored, ['status', 'original_byte_hash', 'restored_byte_hash', 'diff_after_restore'], 'MUTATION_RESTORATION_MISSING');
  if (restored.status !== 'RESTORED' || !nonEmpty(restored.original_byte_hash)
    || restored.original_byte_hash !== restored.restored_byte_hash || restored.diff_after_restore !== 'clean') fail('MUTATION_RESTORATION_MISSING');
  exactSha256(restored.original_byte_hash, 'MUTATION_RESTORATION_MISSING');
  exactSha256(restored.restored_byte_hash, 'MUTATION_RESTORATION_MISSING');
  const target = artifactPath(report.mutation_capability.target, 'MUTATION_TARGET_UNREADABLE');
  if (sha256(target.bytes) !== restored.restored_byte_hash) fail('MUTATION_RESTORATION_MISSING');
}

if (!array(report.verification_ladder) || report.verification_ladder.length !== 4) fail('INVALID_VERIFICATION_LADDER');
const rungNames = ['selected', 'affected_module', 'boundary', 'repository_required'];
const seenRungs = new Set();
for (const rung of report.verification_ladder) {
  requireKeys(rung, ['rung', 'applicable', 'status'], 'INVALID_VERIFICATION_LADDER');
  if (!rungNames.includes(rung.rung) || seenRungs.has(rung.rung) || typeof rung.applicable !== 'boolean'
    || !oneOf(rung.status, ['PASS', 'NOT_RUN'])) fail('INVALID_VERIFICATION_LADDER');
  seenRungs.add(rung.rung);
  if (rung.status === 'PASS') validateExecution(rung, 'INVALID_VERIFICATION_EXECUTION');
  if (rung.rung === 'selected' && rung.status === 'PASS') validateSelectedExecution(rung, 'INVALID_VERIFICATION_EXECUTION');
  if (!auditOnly && rung.applicable && rung.status !== 'PASS') fail('APPLICABLE_RUNG_NOT_RUN');
}
if (!seenRungs.has('selected') || !report.verification_ladder.find((rung) => rung.rung === 'selected').applicable) fail('SELECTED_RUNG_REQUIRED');

requireKeys(report.postflight, ['user_changes', 'workflow_changed_paths', 'forbidden_paths_changed'], 'INVALID_POSTFLIGHT');
validateUserEntries(report.postflight.user_changes, 'INVALID_POSTFLIGHT');
if (!isDeepStrictEqual(report.workspace_baseline.user_changes, report.postflight.user_changes)) fail('USER_CHANGE_PRESERVATION_FAILED');
if (!array(report.postflight.workflow_changed_paths) || !array(report.postflight.forbidden_paths_changed)
  || report.postflight.forbidden_paths_changed.length !== 0) fail('FORBIDDEN_CHANGED_PATH');
for (const path of report.postflight.workflow_changed_paths) {
  if (!normalizedPath(path) || !report.changes.some((change) => change.path === path)) fail('POSTFLIGHT_PATH_MISMATCH');
}
for (const change of report.changes) {
  if (!report.postflight.workflow_changed_paths.includes(change.path)) fail('POSTFLIGHT_PATH_MISMATCH');
}

if (!oneOf(report.verdict, ['PASS', 'PARTIAL', 'INCONCLUSIVE', 'BLOCKED', 'AUDIT_ONLY'])) fail('INVALID_VERDICT');
if (report.verdict === 'PASS') {
  const resolvedFinding = report.finding_results.some((result) => result.outcome === 'RESOLVED');
  if (auditOnly || overlapsUserChange) fail('PASS_GATE_FAILED');
  if (resolvedFinding && (report.changes.length < 1 || report.negative_proof.status !== 'PASS')) fail('PASS_GATE_FAILED');
  if (!resolvedFinding && (report.changes.length !== 0 || report.negative_proof.status === 'PASS')) fail('PASS_GATE_FAILED');
  if (!report.finding_results.every((result) => oneOf(result.outcome, ['RESOLVED', 'NOT_APPLICABLE']))) fail('PASS_GATE_FAILED');
}
if (auditOnly && report.verdict !== 'AUDIT_ONLY') fail('AUDIT_ONLY_VERDICT_REQUIRED');

process.stdout.write(`${JSON.stringify({ outcome: 'pass', schema_version: report.schema_version, finding_count: findingIds.length })}\n`);
