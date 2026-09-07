#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');

const VERDICTS = ['PASS', 'PARTIAL', 'INCONCLUSIVE', 'BLOCKED'];
const VERDICT_RANK = Object.freeze({ PASS: 0, PARTIAL: 1, INCONCLUSIVE: 2, BLOCKED: 3 });
const ROUTES = new Set(['AUDIT_ONLY', 'AUTHOR', 'REFACTOR']);
const MUTATION_CAPABILITIES = new Set([
  'configured', 'controlled_allowed', 'replica_only', 'unavailable', 'safety_blocked',
]);
const WRITE_KINDS = new Set(['test', 'fixture', 'report']);
const CLEANUP_SCOPES = new Set(['case', 'namespace', 'disposable_resource']);
const REQUIRED_COMPONENTS = ['agent:test-runner', 'test-quality-review', 'test-refactoring'];
const SHA256 = /^[a-f0-9]{64}$/;

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (!value || Array.isArray(value) || typeof value !== 'object') fail(`${label} must be an object`);
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function string(value, label) {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function integer(value, label) {
  if (!Number.isInteger(value) || value < 0) fail(`${label} must be a non-negative integer`);
  return value;
}

function hash(value, label) {
  if (!SHA256.test(string(value, label))) fail(`${label} must be a lowercase SHA-256 hash`);
}

function relativePath(value, label) {
  const candidate = string(value, label);
  if (path.posix.isAbsolute(candidate) || candidate.split('/').some((part) => part === '' || part === '.' || part === '..') || candidate.includes('\\')) {
    fail(`${label} must be a normalized relative path`);
  }
  return candidate;
}

function isoTime(value, label) {
  const parsed = Date.parse(string(value, label));
  if (Number.isNaN(parsed)) fail(`${label} must be an ISO-compatible timestamp`);
  return parsed;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateEntry(entry, label) {
  object(entry, label);
  relativePath(entry.path, `${label}.path`);
  hash(entry.byte_hash, `${label}.byte_hash`);
  string(entry.mode, `${label}.mode`);
  if (!['regular', 'binary', 'symlink', 'submodule'].includes(entry.entry_type)) {
    fail(`${label}.entry_type must preserve the native entry type`);
  }
  if (!['present', 'renamed', 'deleted', 'mode_changed'].includes(entry.state)) {
    fail(`${label}.state must record present, renamed, deleted, or mode_changed`);
  }
  if (entry.state === 'renamed') relativePath(entry.rename_from, `${label}.rename_from`);
}

function isAllowedWrite(entry) {
  const candidate = entry.path;
  if (entry.kind === 'test') {
    return /^(src\/test\/|test\/|tests\/|__tests__\/)/.test(candidate);
  }
  if (entry.kind === 'fixture') {
    return /^(src\/test\/(resources|fixtures)\/|src\/testFixtures\/|test\/(resources|fixtures)\/|tests\/(fixtures|resources)\/|__tests__\/fixtures\/|__fixtures__\/|fixtures\/test\/)/.test(candidate);
  }
  return /^(test-quality-reports\/|\.vulpora\/test-quality-reports\/)/.test(candidate);
}

function matchesGlob(candidate, glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`).test(candidate);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function verifiedBaseDir(baseDir) {
  if (typeof baseDir !== 'string' || baseDir.length === 0) fail('artifact-bearing validation requires baseDir');
  const absolute = path.resolve(baseDir);
  let stat;
  try { stat = fs.lstatSync(absolute); } catch { fail('baseDir is unreadable'); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('baseDir must be a non-symlink directory');
  return fs.realpathSync(absolute);
}

function resolveArtifact(baseDir, candidate, label, expectedHash) {
  const relative = relativePath(candidate, label);
  const absolute = path.resolve(baseDir, relative);
  if (!absolute.startsWith(`${baseDir}${path.sep}`)) fail(`${label} escapes the workflow report directory`);
  let cursor = baseDir;
  for (const segment of relative.split('/')) {
    cursor = path.join(cursor, segment);
    let segmentStat;
    try { segmentStat = fs.lstatSync(cursor); } catch { fail(`${label} is unreadable`); }
    if (segmentStat.isSymbolicLink()) fail(`${label} has a symlink ancestor`);
  }
  let stat;
  try { stat = fs.lstatSync(absolute); } catch { fail(`${label} is unreadable`); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a non-symlink regular file`);
  const real = fs.realpathSync(absolute);
  if (!real.startsWith(`${baseDir}${path.sep}`)) fail(`${label} realpath escapes the workflow report directory`);
  const bytes = fs.readFileSync(absolute);
  if (expectedHash && sha256(bytes) !== expectedHash) fail(`${label} SHA-256 does not match report evidence`);
  return { absolute, bytes, stat };
}

function resolveWorkspacePath(repositoryRoot, candidate, label) {
  if (!path.isAbsolute(repositoryRoot)) fail('repository_root must be an absolute path for artifact-backed validation');
  let rootStat;
  try { rootStat = fs.lstatSync(repositoryRoot); } catch { fail('repository_root is unreadable'); }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('repository_root must be a non-symlink directory');
  const root = fs.realpathSync(repositoryRoot);
  const relative = relativePath(candidate, label);
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(`${root}${path.sep}`)) fail(`${label} escapes repository_root`);
  let cursor = root;
  for (const segment of relative.split('/')) {
    cursor = path.join(cursor, segment);
    let stat;
    try { stat = fs.lstatSync(cursor); } catch { fail(`${label} is not present for postflight verification`); }
    if (stat.isSymbolicLink()) fail(`${label} has a symlink ancestor`);
  }
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a non-symlink regular repository file`);
}

function validateComponentReport(componentId, artifact) {
  if (!['test-quality-review', 'test-refactoring'].includes(componentId)) return;
  const validator = path.resolve(__dirname, '..', '..', componentId, 'scripts',
    componentId === 'test-quality-review' ? 'validate-review-report.js' : 'validate-refactoring-report.js');
  const result = childProcess.spawnSync(process.execPath, [validator, artifact.absolute], { encoding: 'utf8' });
  if (result.error || result.status !== 0) fail(`${componentId} component report failed its sibling validator: ${(result.stderr || '').trim()}`);
}

function junitTestcaseSymbols(bytes, label) {
  const source = bytes.toString('utf8');
  if (!/^\s*<testsuites?\b/.test(source) || /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(source)) {
    fail(`${label} is not strict JUnit XML`);
  }
  if (/<(?:failure|error|skipped)\b/i.test(source)) fail(`${label} contains failed, errored, or skipped testcases`);
  const testcases = [];
  const stack = [];
  const tags = /<([^>]+)>/g;
  let cursor = 0;
  let documentRoots = 0;
  let match;
  while ((match = tags.exec(source)) !== null) {
    if (source.slice(cursor, match.index).trim() !== '') fail(`${label} is not strict JUnit XML`);
    cursor = tags.lastIndex;
    const token = match[1].trim();
    if (token.startsWith('?xml ') || token.startsWith('!--')) continue;
    if (token.startsWith('/')) {
      const name = token.slice(1).trim();
      if (!/^(testsuites?|testcase)$/.test(name) || stack.pop() !== name) fail(`${label} is not strict JUnit XML`);
      continue;
    }
    const selfClosing = token.endsWith('/');
    const body = selfClosing ? token.slice(0, -1).trim() : token;
    const nameMatch = body.match(/^(testsuites?|testcase)\b(.*)$/);
    if (!nameMatch || (stack.length === 0 && (!['testsuite', 'testsuites'].includes(nameMatch[1]) || documentRoots !== 0)) || (stack.length > 0 && nameMatch[1] === 'testsuites')) {
      fail(`${label} is not strict JUnit XML`);
    }
    const name = nameMatch[1];
    if (stack.length === 0) documentRoots += 1;
    if (name === 'testcase') {
    const attributes = new Map();
    const attribute = /([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/g;
    let attributeMatch;
      while ((attributeMatch = attribute.exec(nameMatch[2])) !== null) attributes.set(attributeMatch[1], attributeMatch[3]);
    const className = attributes.get('classname');
    const name = attributes.get('name');
    if (!className || !name) fail(`${label} testcase is missing JUnit classname or name`);
    testcases.push(`${className}#${name}`);
    }
    if (!selfClosing) stack.push(name);
  }
  if (source.slice(cursor).trim() !== '' || stack.length !== 0 || documentRoots !== 1) fail(`${label} is not strict JUnit XML`);
  if (testcases.length === 0) fail(`${label} contains no JUnit testcase elements`);
  return testcases;
}

function validateComponents(report, baseDir) {
  const components = array(report.component_inventory, 'component_inventory');
  const ids = components.map((component, index) => {
    object(component, `component_inventory[${index}]`);
    string(component.id, `component_inventory[${index}].id`);
    relativePath(component.path, `component_inventory[${index}].path`);
    hash(component.digest, `component_inventory[${index}].digest`);
    if (baseDir) resolveArtifact(baseDir, component.path, `component_inventory[${index}].path`, component.digest);
    return component.id;
  }).sort();
  if (!sameJson(ids, REQUIRED_COMPONENTS)) {
    fail('component_inventory must contain exactly test-quality-review, test-refactoring, and agent:test-runner');
  }
}

function validateComponentEvidence(report, baseDir) {
  if (!Object.hasOwn(report, 'component_evidence')) {
    fail('component_evidence must bind each referenced component report by path and digest');
  }
  const evidence = array(report.component_evidence, 'component_evidence');
  const evidenceById = new Map();
  const reportsById = new Map();
  evidence.forEach((entry, index) => {
    object(entry, `component_evidence[${index}]`);
    const id = string(entry.id, `component_evidence[${index}].id`);
    if (![...REQUIRED_COMPONENTS, 'test-authoring'].includes(id)) fail('component evidence references an unknown component');
    if (evidenceById.has(id)) fail('component_evidence must not duplicate component IDs');
    relativePath(entry.report_path, `component_evidence[${index}].report_path`);
    hash(entry.report_digest, `component_evidence[${index}].report_digest`);
    const artifact = baseDir ? resolveArtifact(baseDir, entry.report_path, 'component evidence report', entry.report_digest) : null;
    if (artifact) validateComponentReport(id, artifact);
    if (artifact) {
      let componentReport;
      try { componentReport = JSON.parse(artifact.bytes.toString('utf8')); } catch { fail('component evidence report is not JSON'); }
      reportsById.set(id, componentReport);
    }
    evidenceById.set(id, entry);
  });
  for (const component of REQUIRED_COMPONENTS) {
    if (!evidenceById.has(component)) fail(`component_evidence is missing ${component} report evidence`);
  }

  const results = array(report.component_finding_results, 'component_finding_results');
  const resultById = new Map();
  results.forEach((entry, index) => {
    object(entry, `component_finding_results[${index}]`);
    const id = string(entry.id, `component_finding_results[${index}].id`);
    const findingId = string(entry.finding_id, `component_finding_results[${index}].finding_id`);
    const component = string(entry.component, `component_finding_results[${index}].component`);
    const source = evidenceById.get(component);
    if (!source) fail('component finding result must reference bound component report evidence');
    if (!array(source.finding_result_ids, `component_evidence.${component}.finding_result_ids`).includes(id)) {
      fail('component finding result ID is not listed by its bound component evidence');
    }
    if (resultById.has(id)) fail('component finding result IDs must be unique');
    resultById.set(id, { findingId, component });
  });
  return { evidenceById, resultById, reportsById };
}

function validateBaseline(report) {
  const baseline = object(report.baseline, 'baseline');
  if (baseline.schema !== 'vulpora.test-quality-workspace-baseline/v1') {
    fail('baseline.schema must be vulpora.test-quality-workspace-baseline/v1');
  }
  string(baseline.head, 'baseline.head');
  string(baseline.index_tree, 'baseline.index_tree');
  hash(baseline.staged_patch_hash, 'baseline.staged_patch_hash');
  hash(baseline.unstaged_patch_hash, 'baseline.unstaged_patch_hash');
  const users = array(baseline.user_entries, 'baseline.user_entries');
  users.forEach((entry, index) => validateEntry(entry, `baseline.user_entries[${index}]`));
  const artifacts = array(baseline.prior_artifacts, 'baseline.prior_artifacts');
  artifacts.forEach((artifact, index) => {
    object(artifact, `baseline.prior_artifacts[${index}]`);
    relativePath(artifact.path, `baseline.prior_artifacts[${index}].path`);
    hash(artifact.byte_hash, `baseline.prior_artifacts[${index}].byte_hash`);
    isoTime(artifact.mtime, `baseline.prior_artifacts[${index}].mtime`);
  });
  return baseline;
}

function validateWriteScope(report, baseline) {
  const scope = array(report.workflow_write_scope, 'workflow_write_scope');
  const seen = new Set();
  scope.forEach((entry, index) => {
    object(entry, `workflow_write_scope[${index}]`);
    string(entry.finding_id, `workflow_write_scope[${index}].finding_id`);
    relativePath(entry.path, `workflow_write_scope[${index}].path`);
    if (!WRITE_KINDS.has(entry.kind)) fail(`workflow_write_scope[${index}].kind is invalid`);
    if (!isAllowedWrite(entry)) fail(`workflow_write_scope[${index}] is outside the test/fixture/report allowlist`);
    const key = `${entry.finding_id}\u0000${entry.path}`;
    if (seen.has(key)) fail('workflow_write_scope must not duplicate finding/path entries');
    seen.add(key);
  });

  const userPaths = new Set(baseline.user_entries.flatMap((entry) => entry.state === 'renamed' ? [entry.path, entry.rename_from] : [entry.path]));
  const overlaps = scope.filter((entry) => userPaths.has(entry.path));
  return { scope, overlaps };
}

function validateRouting(report, writeScope, overlaps, componentEvidence) {
  const routing = object(report.routing, 'routing');
  if (!ROUTES.has(routing.route)) fail('routing.route must be AUDIT_ONLY, AUTHOR, or REFACTOR');
  if (!['NOT_APPLICABLE', 'NOT_STARTED', 'COMPLETE', 'BLOCKED'].includes(routing.edit_status)) {
    fail('routing.edit_status is invalid');
  }
  const routes = array(routing.finding_routes, 'routing.finding_routes');
  routes.forEach((entry, index) => {
    object(entry, `routing.finding_routes[${index}]`);
    string(entry.finding_id, `routing.finding_routes[${index}].finding_id`);
    if (!ROUTES.has(entry.route)) fail(`routing.finding_routes[${index}].route is invalid`);
  });
  const requiresCompletedLinkage = routing.edit_status === 'COMPLETE' || report.verdict === 'PASS';
  if (routing.route === 'AUDIT_ONLY' && writeScope.length !== 0 && overlaps.length === 0) {
    fail('AUDIT_ONLY cannot reserve repository write scope without USER_CHANGE_OVERLAP');
  }
  if (routing.route === 'AUDIT_ONLY' && routing.edit_status === 'COMPLETE') {
    fail('AUDIT_ONLY cannot complete an edit route');
  }
  if (routing.route !== 'AUDIT_ONLY' && requiresCompletedLinkage && writeScope.length === 0) {
    fail('REFACTOR and AUTHOR PASS/COMPLETE routes require a frozen workflow_write_scope');
  }
  if (routing.route !== 'AUDIT_ONLY' && requiresCompletedLinkage && routes.length === 0) {
    fail('REFACTOR and AUTHOR require non-empty finding_routes');
  }
  if (routes.length > 0) {
    const scopeIds = new Set(writeScope.map((entry) => entry.finding_id));
    const routeIds = new Set(routes.map((entry) => entry.finding_id));
    if (scopeIds.size !== routeIds.size || [...scopeIds].some((id) => !routeIds.has(id))) {
      fail('finding_routes must link exactly to frozen workflow_write_scope finding IDs');
    }
    routes.forEach((entry, index) => {
      if (routing.route === 'AUDIT_ONLY' || entry.route !== routing.route) fail('each finding route must match the selected workflow route');
      relativePath(entry.review_path, `routing.finding_routes[${index}].review_path`);
      const reviewId = string(entry.review_result_id, `routing.finding_routes[${index}].review_result_id`);
      const resolutionId = string(entry.resolution_result_id, `routing.finding_routes[${index}].resolution_result_id`);
      const review = componentEvidence.resultById.get(reviewId);
      const resolution = componentEvidence.resultById.get(resolutionId);
      const expectedResolution = routing.route === 'REFACTOR' ? 'test-refactoring' : 'test-authoring';
      if (!review || review.component !== 'test-quality-review' || review.findingId !== entry.finding_id) {
        fail('finding route review_result_id must bind its exact review finding result');
      }
      if (!resolution || resolution.component !== expectedResolution || resolution.findingId !== entry.finding_id) {
        fail('finding route resolution_result_id must bind its exact routed component finding result');
      }
      if (!componentEvidence.evidenceById.has(expectedResolution)) {
        fail('finding route resolution component lacks report evidence');
      }
    });
  }
  if (overlaps.length > 0) {
    if (routing.route !== 'AUDIT_ONLY' || routing.edit_status !== 'BLOCKED') {
      fail('a user change overlap must route to read-only audit with BLOCKED edit status');
    }
    if (!array(report.reason_codes, 'reason_codes').includes('USER_CHANGE_OVERLAP')) {
      fail('a user change overlap must include USER_CHANGE_OVERLAP');
    }
  }
  return routing;
}

function validateMutation(report) {
  const mutation = object(report.mutation_capability, 'mutation_capability');
  if (!MUTATION_CAPABILITIES.has(mutation.status)) fail('mutation_capability.status is invalid');
  if (!(typeof mutation.tool === 'string' || mutation.tool === null)) fail('mutation_capability.tool must be string or null');
  if (!(typeof mutation.target === 'string' || mutation.target === null)) fail('mutation_capability.target must be string or null');
  const authority = object(mutation.authority, 'mutation_capability.authority');
  if (typeof authority.clean_target !== 'boolean' || typeof authority.no_user_overlap !== 'boolean' || typeof authority.isolated !== 'boolean') {
    fail('mutation_capability.authority must prove clean_target, no_user_overlap, and isolated');
  }
  const restoration = object(mutation.restoration, 'mutation_capability.restoration');
  if (!['PASS', 'NOT_RUN', 'NOT_APPLICABLE'].includes(restoration.status)) fail('mutation restoration status is invalid');
  if (restoration.status === 'PASS') {
    hash(restoration.original_byte_hash, 'mutation_capability.restoration.original_byte_hash');
    hash(restoration.restored_byte_hash, 'mutation_capability.restoration.restored_byte_hash');
    if (restoration.original_byte_hash !== restoration.restored_byte_hash || restoration.diff_exact !== true) {
      fail('controlled mutation restoration must prove exact hash and diff restoration');
    }
  }
  if (mutation.status === 'controlled_allowed') {
    if (!mutation.tool || !mutation.target || !authority.clean_target || !authority.no_user_overlap || !authority.isolated || restoration.status !== 'PASS') {
      fail('controlled_allowed requires tool, target, clean isolated authority, and exact restoration');
    }
  }
  if (mutation.status === 'configured' && !mutation.tool) fail('configured mutation capability requires a tool');
  if (mutation.status === 'replica_only' && (!mutation.target || !authority.isolated)) fail('replica_only requires an isolated replica target');
  if (mutation.status === 'unavailable' && (mutation.tool !== null || mutation.target !== null)) fail('unavailable mutation capability cannot claim a tool or target');
  return mutation;
}

function validateExecution(report, baseDir) {
  const execution = object(report.execution, 'execution');
  const startedAt = isoTime(execution.started_at, 'execution.started_at');
  const selected = object(execution.selected, 'execution.selected');
  if (!['PASS', 'FAIL', 'NOT_RUN'].includes(selected.status)) fail('execution.selected.status is invalid');
  integer(selected.exit_code, 'execution.selected.exit_code');
  integer(selected.executed_count, 'execution.selected.executed_count');
  const expectedSymbols = array(selected.expected_symbols, 'execution.selected.expected_symbols');
  const expectedGlobs = array(selected.expected_xml_globs, 'execution.selected.expected_xml_globs');
  expectedSymbols.forEach((symbol, index) => string(symbol, `execution.selected.expected_symbols[${index}]`));
  expectedGlobs.forEach((glob, index) => string(glob, `execution.selected.expected_xml_globs[${index}]`));
  const freshXml = array(selected.fresh_xml, 'execution.selected.fresh_xml');
  if (selected.status === 'PASS' && (expectedSymbols.length === 0 || expectedGlobs.length === 0 || freshXml.length === 0)) {
    fail('selected PASS requires non-empty expected symbols, XML globs, and fresh XML');
  }
  const observed = new Set();
  let observedSelectedCases = 0;
  let actualExecutedCases = 0;
  freshXml.forEach((xml, index) => {
    object(xml, `execution.selected.fresh_xml[${index}]`);
    const xmlPath = relativePath(xml.path, `execution.selected.fresh_xml[${index}].path`);
    if (!expectedGlobs.some((glob) => matchesGlob(xmlPath, glob))) fail('fresh XML path does not match the frozen expected XML glob');
    hash(xml.byte_hash, `execution.selected.fresh_xml[${index}].byte_hash`);
    if (isoTime(xml.mtime, `execution.selected.fresh_xml[${index}].mtime`) < startedAt) fail('fresh XML must be newer than the selected-run start time');
    const declaredSymbols = array(xml.testcases, `execution.selected.fresh_xml[${index}].testcases`).map((testcase, testcaseIndex) => {
      object(testcase, `execution.selected.fresh_xml[${index}].testcases[${testcaseIndex}]`);
      string(testcase.symbol, `execution.selected.fresh_xml[${index}].testcases[${testcaseIndex}].symbol`);
      return testcase.symbol;
    });
    const artifact = baseDir ? resolveArtifact(baseDir, xmlPath, `execution.selected.fresh_xml[${index}]`, xml.byte_hash) : null;
    const actualSymbols = artifact ? junitTestcaseSymbols(artifact.bytes, `execution.selected.fresh_xml[${index}]`) : declaredSymbols;
    if (artifact && artifact.stat.mtime.toISOString() !== xml.mtime) fail('fresh XML mtime does not match filesystem evidence');
    if (artifact && !sameJson([...actualSymbols].sort(), [...declaredSymbols].sort())) {
      fail('fresh XML testcase metadata does not match parsed JUnit XML');
    }
    actualSymbols.forEach((symbol) => {
      observed.add(symbol);
      if (expectedSymbols.includes(symbol)) observedSelectedCases += 1;
    });
    actualExecutedCases += actualSymbols.length;
  });
  const missing = expectedSymbols.filter((symbol) => !observed.has(symbol));
  if (missing.length > 0 && selected.status !== 'NOT_RUN') fail('an expected symbol absent from fresh XML must be NOT_RUN');
  if (selected.status === 'PASS' && (selected.exit_code !== 0 || selected.executed_count === 0 || freshXml.length === 0 || missing.length > 0)) {
    fail('selected PASS requires zero exit, executed tests, and matching fresh XML');
  }
  const unexpected = array(selected.unexpected_symbols, 'execution.selected.unexpected_symbols');
  unexpected.forEach((symbol, index) => string(symbol, `execution.selected.unexpected_symbols[${index}]`));
  const observedUnexpected = [...observed].filter((symbol) => !expectedSymbols.includes(symbol)).sort();
  if (!sameJson([...new Set(unexpected)].sort(), observedUnexpected)) fail('unexpected_symbols must bind exactly to fresh XML testcase evidence');
  if (selected.executed_count < observedSelectedCases) fail('selected executed_count cannot be less than observed selected XML testcases');
  if (baseDir && selected.executed_count !== actualExecutedCases) fail('selected executed_count must equal parsed JUnit XML testcase count');
  if (!['SELECTED_ONLY', 'AFFECTED_MODULE'].includes(selected.run_scope)) fail('execution.selected.run_scope is invalid');
  if (unexpected.length > 0 && selected.run_scope !== 'AFFECTED_MODULE') fail('unexpected XML testcases require AFFECTED_MODULE scope');
  if (unexpected.length === 0 && selected.run_scope === 'AFFECTED_MODULE' && selected.scope_drift_reason !== 'MODULE_FILTER_EXPANDED') {
    fail('AFFECTED_MODULE without unexpected XML requires MODULE_FILTER_EXPANDED reason');
  }

  const ladder = array(execution.verification_ladder, 'execution.verification_ladder');
  const kinds = new Set();
  ladder.forEach((rung, index) => {
    object(rung, `execution.verification_ladder[${index}]`);
    if (!['selected', 'module', 'boundary', 'repository'].includes(rung.kind)) fail('verification ladder kind is invalid');
    if (kinds.has(rung.kind)) fail('verification ladder must not duplicate rungs');
    kinds.add(rung.kind);
    if (!['PASS', 'FAIL', 'NOT_RUN'].includes(rung.status)) fail('verification ladder status is invalid');
    if (typeof rung.required !== 'boolean') fail('verification ladder required must be boolean');
    if (rung.status === 'NOT_RUN') string(rung.reason, `verification_ladder[${index}].reason`);
    if (rung.status === 'PASS') {
      relativePath(rung.artifact_path, `verification_ladder[${index}].artifact_path`);
      hash(rung.artifact_digest, `verification_ladder[${index}].artifact_digest`);
      if (baseDir) resolveArtifact(baseDir, rung.artifact_path, `verification_ladder[${index}]`, rung.artifact_digest);
    }
  });
  if (!kinds.has('selected')) fail('verification ladder must include selected rung');
  return { execution, selected, ladder };
}

function sameSet(left, right) {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function reconcileComponentReports(report, routing, writeScope, componentEvidence, execution, baseDir) {
  if (!baseDir) return;
  const review = componentEvidence.reportsById.get('test-quality-review');
  const runner = componentEvidence.reportsById.get('agent:test-runner');
  if (!review || !runner) fail('component report evidence is incomplete');
  if (runner.schema !== 'vulpora.test-runner/v1' || !VERDICTS.includes(runner.verdict)) fail('agent:test-runner report has no supported schema');
  const runnerSelected = object(runner.selected, 'agent:test-runner.selected');
  if (runnerSelected.exit_code !== execution.selected.exit_code || runnerSelected.executed_count !== execution.selected.executed_count) {
    fail('agent:test-runner selected execution facts do not match workflow evidence');
  }
  const runnerSymbols = array(runnerSelected.test_symbols, 'agent:test-runner.selected.test_symbols');
  if (!sameSet(runnerSymbols, execution.selected.expected_symbols)) fail('agent:test-runner selected symbols do not match workflow evidence');
  const runnerXml = array(runnerSelected.xml_paths, 'agent:test-runner.selected.xml_paths');
  if (!sameSet(runnerXml, execution.selected.fresh_xml.map((xml) => xml.path))) fail('agent:test-runner XML paths do not match workflow evidence');
  const sourceToComponent = new Map([
    ['test-quality-review', 'test-quality-review'],
    ['test-refactoring', 'test-refactoring'],
    ['test-runner', 'agent:test-runner'],
  ]);
  const inputs = array(report.verdict_inputs, 'verdict_inputs');
  if (inputs.length !== sourceToComponent.size || new Set(inputs.map((input) => input.source)).size !== inputs.length) {
    fail('verdict_inputs must contain exactly one bound result per direct component');
  }
  for (const input of inputs) {
    const component = sourceToComponent.get(input.source);
    const componentReport = component && componentEvidence.reportsById.get(component);
    if (!componentReport || input.status !== componentReport.verdict) {
      fail('verdict_inputs must match bound component report verdicts');
    }
  }

  const routes = routing.finding_routes;
  const reviewFindings = array(review.findings, 'test-quality-review.findings');
  for (const route of routes) {
    const finding = reviewFindings.find((entry) => entry && entry.id === route.finding_id);
    if (!finding || finding.path !== route.review_path) fail('original review finding/path does not bind the workflow route');
  }
  if (routing.route !== 'REFACTOR' || report.verdict !== 'PASS') return;
  const refactoring = componentEvidence.reportsById.get('test-refactoring');
  if (!refactoring || refactoring.verdict !== 'PASS') fail('REFACTOR PASS requires a PASS refactoring component report');
  const findingIds = routes.map((route) => route.finding_id);
  if (!sameSet(array(object(refactoring.input, 'test-refactoring.input').finding_ids, 'test-refactoring.input.finding_ids'), findingIds)) {
    fail('refactoring component selected finding IDs do not match workflow routes');
  }
  const results = array(refactoring.finding_results, 'test-refactoring.finding_results');
  if (!sameSet(results.map((result) => result.finding_id), findingIds)) {
    fail('refactoring component finding result IDs do not match selected workflow findings');
  }
  for (const findingId of findingIds) {
    if (!results.some((result) => result.finding_id === findingId && result.outcome === 'RESOLVED')) {
      fail('refactoring component finding results do not resolve every selected finding');
    }
  }
  const expectedChanges = writeScope.map((entry) => `${entry.finding_id}\u0000${entry.path}`).sort();
  const actualChanges = array(refactoring.changes, 'test-refactoring.changes')
    .map((change) => `${change.finding_id}\u0000${change.path}`).sort();
  if (!sameJson(actualChanges, expectedChanges)) fail('refactoring component changed paths do not match frozen workflow write scope');
  if (!refactoring.negative_proof || refactoring.negative_proof.status !== 'PASS') {
    fail('REFACTOR PASS requires refactoring component negative proof');
  }
}

function validatePostflight(report, baseline, writeScope, routing) {
  const postflight = object(report.postflight, 'postflight');
  const users = array(postflight.user_entries, 'postflight.user_entries');
  users.forEach((entry, index) => validateEntry(entry, `postflight.user_entries[${index}]`));
  if (!sameJson(users, baseline.user_entries)) fail('postflight must preserve every user-owned entry byte-for-byte and mode-for-mode');
  const owned = array(postflight.workflow_owned_entries, 'postflight.workflow_owned_entries');
  const allowedPaths = new Set(writeScope.map((entry) => entry.path));
  owned.forEach((entry, index) => {
    object(entry, `postflight.workflow_owned_entries[${index}]`);
    relativePath(entry.path, `postflight.workflow_owned_entries[${index}].path`);
    string(entry.finding_id, `postflight.workflow_owned_entries[${index}].finding_id`);
    if (!allowedPaths.has(entry.path)) fail('workflow-owned path is outside frozen workflow_write_scope');
  });
  if (routing.edit_status === 'COMPLETE') {
    if (owned.length === 0) fail('COMPLETE edit route requires workflow-owned entries');
    const scopeKeys = new Set(writeScope.map((entry) => `${entry.finding_id}\u0000${entry.path}`));
    const ownedKeys = new Set(owned.map((entry) => `${entry.finding_id}\u0000${entry.path}`));
    if (ownedKeys.size !== owned.length || scopeKeys.size !== ownedKeys.size || [...scopeKeys].some((key) => !ownedKeys.has(key))) {
      fail('COMPLETE workflow-owned entries must correspond exactly to frozen write scope and declared findings');
    }
  }
  const prohibited = array(postflight.prohibited_paths, 'postflight.prohibited_paths');
  if (prohibited.length !== 0) fail('workflow must not create production/build/dependency/CI changes');
  object(postflight.diff_evidence, 'postflight.diff_evidence');
  relativePath(postflight.diff_evidence.path, 'postflight.diff_evidence.path');
  hash(postflight.diff_evidence.digest, 'postflight.diff_evidence.digest');
  const cleanup = array(postflight.cleanup_actions, 'postflight.cleanup_actions');
  cleanup.forEach((action, index) => {
    object(action, `postflight.cleanup_actions[${index}]`);
    if (!CLEANUP_SCOPES.has(action.scope)) fail('broad cleanup is forbidden');
    if (action.owned !== true) fail('cleanup must prove disposable case/namespace/resource ownership');
    const command = typeof action.command === 'string' ? action.command : '';
    if (/\b(FLUSHDB|TRUNCATE|DROP\s+(DATABASE|SCHEMA)|DELETE\s+FROM\s+\*)\b/i.test(command)) fail('broad cleanup command is forbidden');
  });
  return owned;
}

function validateVerdict(report, routing, overlaps, mutation, execution, owned, baseDir) {
  const inputs = array(report.verdict_inputs, 'verdict_inputs');
  if (inputs.length === 0) fail('verdict_inputs must preserve component and workflow evidence');
  let strongest = 'PASS';
  inputs.forEach((input, index) => {
    object(input, `verdict_inputs[${index}]`);
    string(input.source, `verdict_inputs[${index}].source`);
    if (!VERDICTS.includes(input.status)) fail('verdict input status is invalid');
    if (VERDICT_RANK[input.status] > VERDICT_RANK[strongest]) strongest = input.status;
  });
  if (!VERDICTS.includes(report.verdict)) fail('verdict is invalid');
  if (report.verdict !== strongest) fail('verdict must equal the strongest verdict input: BLOCKED > INCONCLUSIVE > PARTIAL > PASS');
  const reasons = array(report.reason_codes, 'reason_codes');
  reasons.forEach((reason, index) => string(reason, `reason_codes[${index}]`));
  if (overlaps.length > 0 && (report.verdict !== 'BLOCKED' || owned.length !== 0)) {
    fail('USER_CHANGE_OVERLAP requires blocked verdict and no workflow-owned repository write');
  }
  if (mutation.status === 'safety_blocked' && report.verdict !== 'BLOCKED') fail('safety-blocked mutation capability requires BLOCKED verdict');
  if (routing.route === 'AUDIT_ONLY' && owned.length !== 0) fail('AUDIT_ONLY cannot have workflow-owned repository writes');
  const proof = object(report.negative_proof, 'negative_proof');
  if (!['PASS', 'FAIL', 'NOT_RUN', 'NOT_APPLICABLE'].includes(proof.status)) fail('negative_proof.status is invalid');
  if (proof.status === 'PASS') {
    string(proof.plausible_fault, 'negative_proof.plausible_fault');
    if (proof.before !== 'KILLED' || proof.after !== 'KILLED' || proof.green_after_restore !== true) {
      fail('negative proof PASS requires the same fault killed before/after and a green restoration rerun');
    }
    relativePath(proof.artifact_path, 'negative_proof.artifact_path');
    hash(proof.artifact_digest, 'negative_proof.artifact_digest');
    if (baseDir) resolveArtifact(baseDir, proof.artifact_path, 'negative proof artifact', proof.artifact_digest);
  }
  if (!Object.hasOwn(report, 'post_review')) fail('post_review must reconcile every final verdict');
  const review = object(report.post_review, 'post_review');
  if (review.reconciled !== true || typeof review.new_same_or_higher_severity !== 'boolean') {
    fail('post_review must record a completed reconciliation and severity comparison');
  }
  hash(review.original_report_digest, 'post_review.original_report_digest');
  hash(review.follow_up_report_digest, 'post_review.follow_up_report_digest');
  relativePath(review.original_report_path, 'post_review.original_report_path');
  relativePath(review.follow_up_report_path, 'post_review.follow_up_report_path');
  if (baseDir) {
    const original = resolveArtifact(baseDir, review.original_report_path, 'post-review original report', review.original_report_digest);
    const followUp = resolveArtifact(baseDir, review.follow_up_report_path, 'post-review follow-up report', review.follow_up_report_digest);
    let followUpReport;
    try { followUpReport = JSON.parse(followUp.bytes.toString('utf8')); } catch { fail('post-review follow-up report is not JSON'); }
    if (followUpReport.verdict !== 'PASS') fail('post-review follow-up report must have PASS verdict');
  }
  if (report.verdict === 'PASS') {
    if (routing.route === 'AUDIT_ONLY') fail('AUDIT_ONLY cannot claim workflow PASS');
    if (proof.status !== 'PASS' || execution.selected.status !== 'PASS') fail('PASS requires selected fresh execution and negative proof');
    if (mutation.status === 'unavailable' || mutation.status === 'safety_blocked') fail('PASS cannot rely on unavailable or safety-blocked mutation proof');
    if (execution.ladder.some((rung) => rung.required && rung.status !== 'PASS')) fail('PASS requires every required verification rung to pass');
    if (review.new_same_or_higher_severity !== false) fail('PASS requires no new same-or-higher-severity post-review finding');
  }
}

function validateStructure(report) {
  return validateInternal(report, undefined);
}

function validate(report, { baseDir } = {}) {
  return validateInternal(report, verifiedBaseDir(baseDir));
}

function validateInternal(report, baseDir) {
  object(report, 'report');
  if (report.schema !== 'vulpora.test-quality-refactoring-workflow/v1') fail('unsupported workflow report schema');
  string(report.repository_root, 'repository_root');
  object(report.revision, 'revision');
  string(report.revision.head, 'revision.head');
  string(report.revision.index_tree, 'revision.index_tree');
  validateComponents(report, baseDir);
  const componentEvidence = validateComponentEvidence(report, baseDir);
  const baseline = validateBaseline(report);
  const { scope, overlaps } = validateWriteScope(report, baseline);
  const routing = validateRouting(report, scope, overlaps, componentEvidence);
  const mutation = validateMutation(report);
  const execution = validateExecution(report, baseDir);
  const owned = validatePostflight(report, baseline, scope, routing);
  if (baseDir) {
    for (const entry of scope) resolveWorkspacePath(report.repository_root, entry.path, 'workflow_write_scope path');
    for (const entry of owned) resolveWorkspacePath(report.repository_root, entry.path, 'postflight workflow-owned path');
    const diff = resolveArtifact(baseDir, report.postflight.diff_evidence.path, 'postflight diff evidence', report.postflight.diff_evidence.digest);
    let diffEvidence;
    try { diffEvidence = JSON.parse(diff.bytes.toString('utf8')); } catch { fail('postflight diff evidence is not JSON'); }
    const observed = array(diffEvidence.workflow_owned_entries, 'postflight diff evidence.workflow_owned_entries');
    const forbidden = array(diffEvidence.prohibited_paths, 'postflight diff evidence.prohibited_paths');
    if (!sameJson(observed, owned) || forbidden.length !== 0) fail('postflight diff evidence does not prove exact owned and prohibited paths');
  }
  reconcileComponentReports(report, routing, scope, componentEvidence, execution, baseDir);
  validateVerdict(report, routing, overlaps, mutation, execution, owned, baseDir);
}

function main() {
  const [reportPath] = process.argv.slice(2);
  if (!reportPath || process.argv.length !== 3) {
    console.error('usage: validate-workflow-report.js <report.json>');
    process.exitCode = 2;
    return;
  }
  let report;
  try {
    const absoluteReportPath = path.resolve(reportPath);
    const reportBaseDir = verifiedBaseDir(path.dirname(absoluteReportPath));
    const reportArtifact = resolveArtifact(reportBaseDir, path.basename(absoluteReportPath), 'workflow report', null);
    report = JSON.parse(reportArtifact.bytes.toString('utf8'));
    validate(report, { baseDir: reportBaseDir });
    process.stdout.write(`${JSON.stringify({ outcome: 'pass', schema: report.schema, verdict: report.verdict })}\n`);
  } catch (error) {
    process.stderr.write(`invalid workflow report: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { validate, validateStructure };
