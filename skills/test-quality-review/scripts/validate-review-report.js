#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const nodePath = require('node:path');

const SCHEMA = 'vulpora.test-quality-review/v1';
const SHA256 = /^[a-f0-9]{64}$/;
const PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\0\r\n]+$/;
const MODE = /^[0-7]{3,6}$/;
const VERDICTS = new Set(['PASS', 'REVIEWED_WITHOUT_EXECUTION', 'PARTIAL', 'INCONCLUSIVE', 'BLOCKED']);
const NON_PASS_EXECUTION = new Set(['NOT_RUN', 'STALE', 'CACHE_ONLY', 'ZERO_EXECUTED', 'FAILED']);
const OWNERSHIP = new Set(['PASS', 'NOT_APPLICABLE', 'INCONCLUSIVE', 'BLOCKED']);
const FAULT_STATUS = new Set(['KILLED', 'SURVIVED', 'NOT_RUN', 'BLOCKED']);
const SEVERITY = new Set(['critical', 'high', 'medium', 'low']);
const CONFIDENCE = new Set(['high', 'medium', 'low']);
const FINDING_KIND = new Set([
  'improvement', 'missing_oracle', 'weak_oracle', 'fault_survivor',
  'unsafe_environment_ownership', 'execution_integrity',
]);
const PASS_BLOCKING_FINDING_KIND = new Set([
  'missing_oracle', 'weak_oracle', 'fault_survivor',
  'unsafe_environment_ownership', 'execution_integrity',
]);
const DIRTY_KIND = new Set(['staged', 'unstaged', 'untracked', 'rename', 'delete', 'file_mode', 'submodule']);
const RULE = /^TST-(?:[1-9]|1\d|20)$/;

function fail(code, detail) {
  throw new Error(`${code}${detail ? `: ${detail}` : ''}`);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_OBJECT', label);
  return value;
}

function string(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail('INVALID_STRING', label);
  return value;
}

function path(value, label) {
  string(value, label);
  if (!PATH.test(value)) fail('INVALID_PATH', label);
  return value;
}

function line(value, label) {
  if (!Number.isInteger(value) || value < 1) fail('INVALID_LINE', label);
  return value;
}

function hash(value, label) {
  string(value, label);
  if (!SHA256.test(value)) fail('INVALID_SHA256', label);
  return value;
}

function array(value, label, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum) fail('INVALID_ARRAY', label);
  return value;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) fail('DUPLICATE_VALUE', label);
}

function evidence(value, label) {
  value = object(value, label);
  path(value.path, `${label}.path`);
  line(value.line, `${label}.line`);
  string(value.summary, `${label}.summary`);
  return value;
}

function evidenceList(value, label, minimum = 1) {
  array(value, label, minimum).forEach((item, index) => evidence(item, `${label}[${index}]`));
}

function validateScope(value) {
  value = object(value, 'scope');
  path(value.repository_root, 'scope.repository_root');
  array(value.requested_paths, 'scope.requested_paths', 1).forEach((item, index) => path(item, `scope.requested_paths[${index}]`));
  array(value.modules, 'scope.modules', 1).forEach((item, index) => path(item, `scope.modules[${index}]`));
  array(value.test_symbols, 'scope.test_symbols', 1).forEach((item, index) => string(item, `scope.test_symbols[${index}]`));
  unique(value.test_symbols, 'scope.test_symbols');
}

function validateRevision(value) {
  value = object(value, 'revision');
  if (!/^[a-f0-9]{7,64}$/.test(string(value.head, 'revision.head'))) fail('INVALID_REVISION', 'revision.head');
  if (!/^[a-f0-9]{7,64}$/.test(string(value.index_tree, 'revision.index_tree'))) fail('INVALID_REVISION', 'revision.index_tree');
  if (!Number.isInteger(value.review_started_at_epoch_ms) || value.review_started_at_epoch_ms < 0) {
    fail('INVALID_TIMESTAMP', 'revision.review_started_at_epoch_ms');
  }
}

function validateFramework(value) {
  value = object(value, 'framework');
  string(value.primary, 'framework.primary');
  string(value.runner, 'framework.runner');
  array(value.config_paths, 'framework.config_paths', 1).forEach((item, index) => path(item, `framework.config_paths[${index}]`));
  array(value.nearby_tests, 'framework.nearby_tests').forEach((item, index) => path(item, `framework.nearby_tests[${index}]`));
  if (value.nearby_tests.length > 8) fail('DISCOVERY_BUDGET_EXCEEDED', 'framework.nearby_tests');
  array(value.report_globs, 'framework.report_globs', 1).forEach((item, index) => string(item, `framework.report_globs[${index}]`));
  string(value.fixture_conventions, 'framework.fixture_conventions');
}

function validateDirtyEntry(value, label) {
  value = object(value, label);
  if (!DIRTY_KIND.has(value.kind)) fail('INVALID_DIRTY_KIND', label);
  path(value.path, `${label}.path`);
  if (!MODE.test(string(value.mode, `${label}.mode`))) fail('INVALID_MODE', `${label}.mode`);
  if (typeof value.is_binary !== 'boolean') fail('INVALID_BOOLEAN', `${label}.is_binary`);
  if (value.kind === 'submodule') {
    if (value.byte_sha256 !== null || value.is_binary !== false) fail('INVALID_SUBMODULE_EVIDENCE', label);
    if (!/^[a-f0-9]{7,64}$/.test(string(value.submodule_head, `${label}.submodule_head`))) {
      fail('INVALID_SUBMODULE_EVIDENCE', `${label}.submodule_head`);
    }
  } else if (value.kind === 'delete') {
    if (value.byte_sha256 !== null) hash(value.byte_sha256, `${label}.byte_sha256`);
  } else {
    hash(value.byte_sha256, `${label}.byte_sha256`);
  }
  if (value.kind !== 'submodule' && value.submodule_head !== undefined) fail('UNEXPECTED_FIELD', `${label}.submodule_head`);
  if (value.kind === 'rename') path(value.from_path, `${label}.from_path`);
  else if (value.from_path !== undefined) fail('UNEXPECTED_FIELD', `${label}.from_path`);
  if (typeof value.test_or_fixture_overlap !== 'boolean') fail('INVALID_BOOLEAN', `${label}.test_or_fixture_overlap`);
}

function validateBaseline(value) {
  value = object(value, 'baseline');
  if (value.schema !== 'vulpora.test-quality-workspace-baseline/v1') fail('INVALID_BASELINE_SCHEMA');
  hash(value.staged_patch_sha256, 'baseline.staged_patch_sha256');
  hash(value.unstaged_patch_sha256, 'baseline.unstaged_patch_sha256');
  const entries = array(value.dirty_entries, 'baseline.dirty_entries');
  const seen = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    validateDirtyEntry(entries[index], `baseline.dirty_entries[${index}]`);
    const key = `${entries[index].kind}:${entries[index].path}`;
    if (seen.has(key)) fail('DUPLICATE_DIRTY_ENTRY', key);
    seen.add(key);
  }
  const overlaps = array(value.test_fixture_overlaps, 'baseline.test_fixture_overlaps');
  for (const overlap of overlaps) {
    path(overlap, 'baseline.test_fixture_overlaps[]');
    const matched = entries.find((entry) => entry.path === overlap && entry.test_or_fixture_overlap);
    if (!matched) fail('UNDECLARED_DIRTY_OVERLAP', overlap);
  }
  unique(overlaps, 'baseline.test_fixture_overlaps');
}

function validateBehavior(value, label, scopeSymbols) {
  value = object(value, label);
  string(value.id, `${label}.id`);
  path(value.path, `${label}.path`);
  line(value.line, `${label}.line`);
  string(value.test_symbol, `${label}.test_symbol`);
  if (!scopeSymbols.has(value.test_symbol)) fail('UNSCOPED_TEST_SYMBOL', value.test_symbol);
  string(value.observable_contract, `${label}.observable_contract`);
  const oracle = object(value.oracle, `${label}.oracle`);
  if (!['public_contract', 'caller', 'requirement', 'incident', 'qa_case'].includes(oracle.source_kind)) {
    fail('INVALID_ORACLE_SOURCE', `${label}.oracle.source_kind`);
  }
  evidence(oracle.evidence, `${label}.oracle.evidence`);
  string(oracle.rationale, `${label}.oracle.rationale`);
  const fault = object(value.plausible_fault, `${label}.plausible_fault`);
  string(fault.description, `${label}.plausible_fault.description`);
  if (!FAULT_STATUS.has(fault.status)) fail('INVALID_FAULT_STATUS', `${label}.plausible_fault.status`);
  string(fault.method, `${label}.plausible_fault.method`);
  evidenceList(fault.evidence, `${label}.plausible_fault.evidence`);
  const ruleIds = array(value.rule_ids, `${label}.rule_ids`, 1);
  ruleIds.forEach((ruleId) => { if (!RULE.test(ruleId)) fail('UNKNOWN_TST_RULE', ruleId); });
  unique(ruleIds, `${label}.rule_ids`);
  return value;
}

function validateFinding(value, label, behaviorIds) {
  value = object(value, label);
  string(value.id, `${label}.id`);
  if (!FINDING_KIND.has(value.kind)) fail('INVALID_FINDING_KIND', `${label}.kind`);
  if (!SEVERITY.has(value.severity)) fail('INVALID_SEVERITY', `${label}.severity`);
  if (!CONFIDENCE.has(value.confidence)) fail('INVALID_CONFIDENCE', `${label}.confidence`);
  const ruleIds = array(value.rule_ids, `${label}.rule_ids`, 1);
  ruleIds.forEach((ruleId) => { if (!RULE.test(ruleId)) fail('UNKNOWN_TST_RULE', ruleId); });
  unique(ruleIds, `${label}.rule_ids`);
  path(value.path, `${label}.path`);
  line(value.line, `${label}.line`);
  string(value.observable_contract, `${label}.observable_contract`);
  string(value.plausible_fault, `${label}.plausible_fault`);
  evidenceList(value.evidence, `${label}.evidence`);
  string(value.recommendation, `${label}.recommendation`);
  if (value.behavior_id !== undefined && !behaviorIds.has(value.behavior_id)) fail('UNKNOWN_BEHAVIOR_REFERENCE', value.behavior_id);
  return value;
}

function validateCoverageGap(value, label, behaviorIds) {
  value = object(value, label);
  string(value.id, `${label}.id`);
  string(value.dimension, `${label}.dimension`);
  string(value.observable_contract, `${label}.observable_contract`);
  string(value.risk, `${label}.risk`);
  evidenceList(value.evidence, `${label}.evidence`);
  string(value.recommendation, `${label}.recommendation`);
  if (value.behavior_id !== undefined && !behaviorIds.has(value.behavior_id)) fail('UNKNOWN_BEHAVIOR_REFERENCE', value.behavior_id);
  return value;
}

function validateEnvironmentOwnership(value) {
  value = object(value, 'environment_ownership');
  if (!OWNERSHIP.has(value.status)) fail('INVALID_ENVIRONMENT_STATUS');
  const operations = array(value.operations, 'environment_ownership.operations');
  if (value.status === 'NOT_APPLICABLE' && operations.length !== 0) fail('ENVIRONMENT_NOT_APPLICABLE_HAS_OPERATIONS');
  if (value.status === 'PASS' && operations.length === 0) fail('ENVIRONMENT_PASS_WITHOUT_EVIDENCE');
  const ids = [];
  operations.forEach((operation, index) => {
    const label = `environment_ownership.operations[${index}]`;
    object(operation, label);
    ids.push(string(operation.id, `${label}.id`));
    path(operation.path, `${label}.path`);
    line(operation.line, `${label}.line`);
    string(operation.operation, `${label}.operation`);
    string(operation.target, `${label}.target`);
    if (operation.disposable_endpoint !== true) fail('UNSAFE_ENVIRONMENT_OWNERSHIP', `${label}.disposable_endpoint`);
    string(operation.namespace, `${label}.namespace`);
    if (!['serial_only', 'isolated_namespace', 'not_parallel'].includes(operation.parallel_policy)) {
      fail('INVALID_PARALLEL_POLICY', `${label}.parallel_policy`);
    }
    evidenceList(operation.evidence, `${label}.evidence`);
  });
  unique(ids, 'environment_ownership.operations');
  evidenceList(value.evidence, 'environment_ownership.evidence');
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function findTagEnd(xml, start) {
  let quote = null;
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '>') return index;
  }
  fail('MALFORMED_JUNIT_XML', 'unterminated-tag');
}

function parseAttributes(source, label) {
  const attributes = {};
  let index = 0;
  while (index < source.length) {
    while (/\s/.test(source[index] ?? '')) index += 1;
    if (index === source.length) break;
    const name = source.slice(index).match(/^([A-Za-z_:][A-Za-z0-9_.:-]*)/);
    if (!name) fail('MALFORMED_JUNIT_XML', `${label}:attribute-name`);
    index += name[0].length;
    while (/\s/.test(source[index] ?? '')) index += 1;
    if (source[index] !== '=') fail('MALFORMED_JUNIT_XML', `${label}:attribute-equals`);
    index += 1;
    while (/\s/.test(source[index] ?? '')) index += 1;
    const quote = source[index];
    if (quote !== '"' && quote !== "'") fail('MALFORMED_JUNIT_XML', `${label}:attribute-quote`);
    const end = source.indexOf(quote, index + 1);
    if (end === -1) fail('MALFORMED_JUNIT_XML', `${label}:attribute-end`);
    if (Object.hasOwn(attributes, name[1])) fail('MALFORMED_JUNIT_XML', `${label}:duplicate-attribute`);
    attributes[name[1]] = source.slice(index + 1, end);
    index = end + 1;
  }
  return attributes;
}

function parseJUnitXml(content, label) {
  const xml = content.toString('utf8');
  if (xml.includes('\u0000') || xml.includes('\uFFFD') || /<!DOCTYPE|<!ENTITY/i.test(xml)) {
    fail('MALFORMED_JUNIT_XML', `${label}:unsafe-or-non-utf8`);
  }
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(xml)) {
    fail('MALFORMED_JUNIT_XML', `${label}:entity`);
  }
  const stack = [];
  const containers = [];
  const testcases = [];
  let roots = 0;
  let rootName = null;
  let index = 0;
  function validateText(text, textLabel) {
    if (text.trim() === '') return;
    const parent = stack.at(-1);
    if (!parent || ['testsuite', 'testsuites'].includes(parent.name)) fail('MALFORMED_JUNIT_XML', `${label}:${textLabel}`);
  }
  function countAttribute(attributes, name, containerLabel, required = false) {
    if (attributes[name] === undefined) {
      if (required) fail('MALFORMED_JUNIT_XML', `${containerLabel}:${name}`);
      return 0;
    }
    if (!/^\d+$/.test(attributes[name])) fail('MALFORMED_JUNIT_XML', `${containerLabel}:${name}`);
    return Number(attributes[name]);
  }
  while (index < xml.length) {
    const start = xml.indexOf('<', index);
    if (start === -1) {
      validateText(xml.slice(index), 'trailing-text');
      break;
    }
    validateText(xml.slice(index, start), 'text');
    if (xml.startsWith('<!--', start)) {
      const end = xml.indexOf('-->', start + 4);
      if (end === -1) fail('MALFORMED_JUNIT_XML', `${label}:comment`);
      index = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', start)) {
      const end = xml.indexOf(']]>', start + 9);
      if (end === -1) fail('MALFORMED_JUNIT_XML', `${label}:cdata`);
      validateText(xml.slice(start + 9, end), 'cdata');
      index = end + 3;
      continue;
    }
    if (xml.startsWith('<?', start)) {
      const end = xml.indexOf('?>', start + 2);
      if (end === -1) fail('MALFORMED_JUNIT_XML', `${label}:processing-instruction`);
      index = end + 2;
      continue;
    }
    if (xml.startsWith('<!', start)) fail('MALFORMED_JUNIT_XML', `${label}:declaration`);
    const end = findTagEnd(xml, start + 1);
    const token = xml.slice(start + 1, end).trim();
    if (token.startsWith('/')) {
      const closing = token.slice(1).trim();
      const frame = stack.pop();
      if (!/^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(closing) || frame?.name !== closing) {
        fail('MALFORMED_JUNIT_XML', `${label}:closing-tag`);
      }
    } else {
      const selfClosing = token.endsWith('/');
      const body = (selfClosing ? token.slice(0, -1) : token).trim();
      const match = body.match(/^([A-Za-z_:][A-Za-z0-9_.:-]*)([\s\S]*)$/);
      if (!match) fail('MALFORMED_JUNIT_XML', `${label}:opening-tag`);
      const name = match[1];
      const attributes = parseAttributes(match[2], `${label}:${name}`);
      const parent = stack.at(-1);
      if (stack.length === 0) {
        roots += 1;
        rootName = name;
      } else if (parent.name === 'testsuites' && name !== 'testsuite') {
        fail('MALFORMED_JUNIT_XML', `${label}:testsuites-child`);
      } else if (parent.name === 'testsuite' && !['testcase', 'properties', 'system-out', 'system-err'].includes(name)) {
        fail('MALFORMED_JUNIT_XML', `${label}:testsuite-child`);
      } else if (parent.name === 'testcase' && !['failure', 'error', 'skipped', 'system-out', 'system-err'].includes(name)) {
        fail('MALFORMED_JUNIT_XML', `${label}:testcase-child`);
      }
      const container = ['testsuite', 'testsuites'].includes(name) ? {
        name,
        declared: {
          tests: countAttribute(attributes, 'tests', `${label}:${name}`, true),
          failures: countAttribute(attributes, 'failures', `${label}:${name}`),
          errors: countAttribute(attributes, 'errors', `${label}:${name}`),
          skipped: countAttribute(attributes, 'skipped', `${label}:${name}`),
        },
        actual: { tests: 0, failures: 0, errors: 0, skipped: 0 },
      } : null;
      if (container) containers.push(container);
      let testcase = null;
      if (name === 'testcase') {
        if (parent?.name !== 'testsuite' || !attributes.classname || !attributes.name) {
          fail('MALFORMED_JUNIT_XML', `${label}:testcase-identity`);
        }
        testcase = {
          classname: attributes.classname,
          name: attributes.name,
          outcomes: new Set(),
          containers: stack.filter((frame) => frame.container).map((frame) => frame.container),
        };
        testcase.containers.forEach((activeContainer) => { activeContainer.actual.tests += 1; });
        testcases.push(testcase);
      }
      if (['failure', 'error', 'skipped'].includes(name)) {
        const caseFrame = [...stack].reverse().find((frame) => frame.testcase);
        if (!caseFrame) fail('MALFORMED_JUNIT_XML', `${label}:${name}-outside-testcase`);
        caseFrame.testcase.outcomes.add(name);
      }
      if (!selfClosing) stack.push({ name, container, testcase });
    }
    index = end + 1;
  }
  if (stack.length !== 0 || roots !== 1 || !['testsuite', 'testsuites'].includes(rootName) || testcases.length === 0) {
    fail('MALFORMED_JUNIT_XML', label);
  }
  for (const testcase of testcases) {
    for (const outcome of testcase.outcomes) {
      const key = outcome === 'failure' ? 'failures' : outcome === 'error' ? 'errors' : 'skipped';
      testcase.containers.forEach((container) => { container.actual[key] += 1; });
    }
  }
  for (const container of containers) {
    for (const key of ['tests', 'failures', 'errors', 'skipped']) {
      if (container.declared[key] !== container.actual[key]) fail('JUNIT_SUITE_COUNT_MISMATCH', `${label}:${container.name}:${key}`);
    }
  }
  return { testcases, hasNonPassingTestcase: testcases.some((testcase) => testcase.outcomes.size > 0) };
}

function symbolAppearsInXml(symbol, testcases) {
  return testcases.some((testcase) => symbol === testcase.classname
    || symbol === testcase.name
    || symbol === `${testcase.classname}.${testcase.name}`);
}

function resolveBaseDirectory(baseDirectory) {
  const absolute = nodePath.resolve(baseDirectory);
  let stat;
  try { stat = fs.lstatSync(absolute); } catch { fail('INVALID_BASE_DIRECTORY'); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('INVALID_BASE_DIRECTORY');
  let real;
  try { real = fs.realpathSync(absolute); } catch { fail('INVALID_BASE_DIRECTORY'); }
  return real;
}

function readExecutionReport(baseDirectory, reportPath, label) {
  const resolved = nodePath.resolve(baseDirectory, reportPath);
  const relative = nodePath.relative(baseDirectory, resolved);
  if (relative === '' || relative === '..' || relative.startsWith(`..${nodePath.sep}`) || nodePath.isAbsolute(relative)) {
    fail('EXECUTION_REPORT_ESCAPE', label);
  }
  let current = baseDirectory;
  for (const segment of relative.split(nodePath.sep)) {
    current = nodePath.join(current, segment);
    let segmentStat;
    try { segmentStat = fs.lstatSync(current); } catch { fail('EXECUTION_REPORT_UNREADABLE', label); }
    if (segmentStat.isSymbolicLink()) fail('EXECUTION_REPORT_SYMLINK', label);
  }
  let stat;
  try { stat = fs.lstatSync(resolved); } catch { fail('EXECUTION_REPORT_UNREADABLE', label); }
  if (!stat.isFile()) fail('EXECUTION_REPORT_UNREADABLE', label);
  let real;
  try { real = fs.realpathSync(resolved); } catch { fail('EXECUTION_REPORT_UNREADABLE', label); }
  const realRelative = nodePath.relative(baseDirectory, real);
  if (realRelative === '..' || realRelative.startsWith(`..${nodePath.sep}`) || nodePath.isAbsolute(realRelative)) {
    fail('EXECUTION_REPORT_ESCAPE', label);
  }
  let content;
  try { content = fs.readFileSync(resolved); } catch { fail('EXECUTION_REPORT_UNREADABLE', label); }
  return { resolved: real, stat, content };
}

function validateExecutionEvidence(value, label, scopeSymbols, baseDirectory, reviewStartedAt, requirePassingExecution) {
  value = object(value, label);
  string(value.id, `${label}.id`);
  string(value.command, `${label}.command`);
  if (!Number.isInteger(value.exit_code)) fail('INVALID_EXIT_CODE', `${label}.exit_code`);
  if (!Number.isInteger(value.started_at_epoch_ms) || value.started_at_epoch_ms < 0) fail('INVALID_TIMESTAMP', `${label}.started_at_epoch_ms`);
  path(value.report_path, `${label}.report_path`);
  hash(value.report_sha256, `${label}.report_sha256`);
  if (!Number.isInteger(value.report_mtime_epoch_ms) || value.report_mtime_epoch_ms < 0) fail('INVALID_TIMESTAMP', `${label}.report_mtime_epoch_ms`);
  if (requirePassingExecution && value.exit_code !== 0) fail('PASS_WITH_NONZERO_EXECUTION', label);
  if (requirePassingExecution && value.started_at_epoch_ms < reviewStartedAt) fail('PASS_WITH_PRE_REVIEW_EXECUTION', label);
  if (value.fresh !== true) fail('STALE_EXECUTION_EVIDENCE', label);
  if (value.cache_state !== 'EXECUTED') fail('CACHE_ONLY_EXECUTION_EVIDENCE', label);
  if (!Number.isInteger(value.executed_count) || value.executed_count < 1) fail('ZERO_EXECUTED_EVIDENCE', label);
  const requested = array(value.requested_test_symbols, `${label}.requested_test_symbols`, 1);
  const executed = array(value.executed_test_symbols, `${label}.executed_test_symbols`, 1);
  requested.forEach((symbol) => { string(symbol, `${label}.requested_test_symbols[]`); if (!scopeSymbols.has(symbol)) fail('UNSCOPED_TEST_SYMBOL', symbol); });
  executed.forEach((symbol) => { string(symbol, `${label}.executed_test_symbols[]`); if (!scopeSymbols.has(symbol)) fail('UNSCOPED_TEST_SYMBOL', symbol); });
  unique(requested, `${label}.requested_test_symbols`);
  unique(executed, `${label}.executed_test_symbols`);
  for (const symbol of requested) if (!executed.includes(symbol)) fail('REQUESTED_TEST_NOT_EXECUTED', symbol);
  const artifact = readExecutionReport(baseDirectory, value.report_path, label);
  if (sha256(artifact.content) !== value.report_sha256) fail('EXECUTION_REPORT_HASH_MISMATCH', label);
  // Reports record whole epoch milliseconds; compare the platform mtime after truncating fractional milliseconds.
  const actualMtime = Math.floor(artifact.stat.mtimeMs);
  if (actualMtime !== value.report_mtime_epoch_ms) fail('EXECUTION_REPORT_MTIME_MISMATCH', label);
  if (actualMtime < value.started_at_epoch_ms || actualMtime < reviewStartedAt) fail('STALE_EXECUTION_EVIDENCE', label);
  const junit = parseJUnitXml(artifact.content, label);
  if (junit.testcases.length !== value.executed_count) fail('EXECUTED_COUNT_MISMATCH', label);
  if (requirePassingExecution && junit.hasNonPassingTestcase) fail('PASS_WITH_NONPASSING_JUNIT_TESTCASE', label);
  for (const symbol of requested) if (!symbolAppearsInXml(symbol, junit.testcases)) fail('REQUESTED_TEST_NOT_IN_XML', symbol);
  for (const symbol of executed) if (!symbolAppearsInXml(symbol, junit.testcases)) fail('EXECUTED_TEST_NOT_IN_XML', symbol);
  return { ...value, resolved_report_path: artifact.resolved, observed_testcase_count: junit.testcases.length };
}

function validateExecutionIntegrity(value, evidenceById) {
  value = object(value, 'execution_integrity');
  if (!['PASS', ...NON_PASS_EXECUTION].includes(value.status)) fail('INVALID_EXECUTION_STATUS');
  const ids = array(value.execution_evidence_ids, 'execution_integrity.execution_evidence_ids');
  unique(ids, 'execution_integrity.execution_evidence_ids');
  for (const id of ids) if (!evidenceById.has(id)) fail('UNKNOWN_EXECUTION_REFERENCE', id);
  string(value.reason, 'execution_integrity.reason');
  if (value.status === 'PASS' && ids.length === 0) fail('PASS_WITHOUT_EXECUTION_EVIDENCE');
  if (value.status !== 'PASS' && ids.length !== 0) fail('NON_PASS_EXECUTION_WITH_FRESH_EVIDENCE');
  return value;
}

function validateReport(report, options = {}) {
  object(report, 'report');
  if (report.schema !== SCHEMA) fail('INVALID_SCHEMA');
  if (!VERDICTS.has(report.verdict)) fail('INVALID_VERDICT');
  const evidenceBearing = Array.isArray(report.execution_evidence) && report.execution_evidence.length > 0;
  const requiresBaseDirectory = evidenceBearing || report.verdict === 'PASS';
  if (requiresBaseDirectory && options.baseDirectory === undefined) fail('BASE_DIRECTORY_REQUIRED');
  const baseDirectory = options.baseDirectory === undefined ? null : resolveBaseDirectory(options.baseDirectory);
  validateScope(report.scope);
  validateRevision(report.revision);
  validateFramework(report.framework);
  validateBaseline(report.baseline);
  const scopeSymbols = new Set(report.scope.test_symbols);
  const behaviors = array(report.behavior_inventory, 'behavior_inventory', 1)
    .map((item, index) => validateBehavior(item, `behavior_inventory[${index}]`, scopeSymbols));
  const behaviorIds = behaviors.map((item) => item.id);
  unique(behaviorIds, 'behavior_inventory');
  const behaviorIdSet = new Set(behaviorIds);
  const findings = array(report.findings, 'findings')
    .map((item, index) => validateFinding(item, `findings[${index}]`, behaviorIdSet));
  unique(findings.map((item) => item.id), 'findings');
  const gaps = array(report.coverage_gaps, 'coverage_gaps')
    .map((item, index) => validateCoverageGap(item, `coverage_gaps[${index}]`, behaviorIdSet));
  unique(gaps.map((item) => item.id), 'coverage_gaps');
  validateEnvironmentOwnership(report.environment_ownership);
  const requirePassingExecution = report.verdict === 'PASS';
  const executions = array(report.execution_evidence, 'execution_evidence')
    .map((item, index) => validateExecutionEvidence(
      item,
      `execution_evidence[${index}]`,
      scopeSymbols,
      baseDirectory,
      report.revision.review_started_at_epoch_ms,
      requirePassingExecution,
    ));
  const executionIds = executions.map((item) => item.id);
  unique(executionIds, 'execution_evidence');
  const executionById = new Map(executions.map((item) => [item.id, item]));
  const integrity = validateExecutionIntegrity(report.execution_integrity, executionById);
  if (report.verdict === 'PASS') {
    if (integrity.status !== 'PASS') fail('PASS_WITHOUT_EXECUTION_INTEGRITY');
    if (!['PASS', 'NOT_APPLICABLE'].includes(report.environment_ownership.status)) fail('PASS_WITH_UNSAFE_ENVIRONMENT');
    for (const behavior of behaviors) {
      if (behavior.plausible_fault.status !== 'KILLED') fail('PASS_WITHOUT_KILLED_FAULT', behavior.id);
      const matchingExecution = executions.some((execution) => execution.executed_test_symbols.includes(behavior.test_symbol));
      if (!matchingExecution) fail('PASS_WITHOUT_SELECTED_EXECUTION', behavior.test_symbol);
    }
    const integrityFinding = findings.find((finding) => PASS_BLOCKING_FINDING_KIND.has(finding.kind));
    if (integrityFinding) fail('PASS_WITH_BLOCKING_FINDING', integrityFinding.id);
    const disqualifying = findings.filter((finding) => ['critical', 'high'].includes(finding.severity));
    if (disqualifying.length > 0) fail('PASS_WITH_HIGH_SEVERITY_FINDING', disqualifying[0].id);
  }
  if (report.verdict === 'REVIEWED_WITHOUT_EXECUTION' && integrity.status === 'PASS') {
    fail('REVIEWED_WITHOUT_EXECUTION_HAS_PASSING_EXECUTION');
  }
  if (report.baseline.test_fixture_overlaps.length > 0 && report.verdict === 'PASS') {
    fail('PASS_WITH_DIRTY_TEST_FIXTURE_OVERLAP');
  }
  return { schema: SCHEMA, verdict: report.verdict, behaviors: behaviors.length, findings: findings.length };
}

function readReport(inputPath) {
  let stat;
  try { stat = fs.lstatSync(inputPath); } catch { fail('REPORT_UNREADABLE', inputPath); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('REPORT_UNREADABLE', inputPath);
  let report;
  try { report = JSON.parse(fs.readFileSync(inputPath, 'utf8')); } catch { fail('INVALID_JSON', inputPath); }
  return report;
}

function main() {
  if (process.argv.length !== 3) {
    process.stderr.write('usage: validate-review-report.js <report.json>\n');
    process.exit(64);
  }
  try {
    const reportPath = nodePath.resolve(process.argv[2]);
    const summary = validateReport(readReport(reportPath), { baseDirectory: nodePath.dirname(reportPath) });
    process.stdout.write(`${JSON.stringify({ valid: true, ...summary })}\n`);
  } catch (error) {
    process.stderr.write(`INVALID_REPORT: ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = { validateReport, parseJUnitXml };

if (require.main === module) main();
