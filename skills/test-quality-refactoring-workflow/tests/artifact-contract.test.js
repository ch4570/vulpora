'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const validator = path.join(root, 'scripts/validate-workflow-report.js');
const fixture = path.join(__dirname, 'fixtures', 'valid', 'refactor-pass.json');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-workflow-artifacts-'));
const reportPath = path.join(work, 'workflow.json');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
const write = (relative, content) => {
  const target = path.join(work, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return { path: relative, digest: sha256(fs.readFileSync(target)) };
};

function invoke(report) {
  fs.writeFileSync(reportPath, JSON.stringify(report));
  return spawnSync(process.execPath, [validator, reportPath], { encoding: 'utf8' });
}

function materialize() {
  const report = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  const findingId = 'TQR-17';
  const testPath = 'src/test/kotlin/example/OrderServiceTest.kt';
  const testSymbol = 'example.OrderServiceTest#rejectsZeroQuantity';
  report.repository_root = work;
  write(testPath, 'package example\nclass OrderServiceTest\n');
  report.workflow_write_scope[0].finding_id = findingId;
  report.workflow_write_scope[0].path = testPath;
  report.routing.finding_routes[0].finding_id = findingId;
  report.routing.finding_routes[0].review_path = testPath;
  report.postflight.workflow_owned_entries[0].finding_id = findingId;
  report.postflight.workflow_owned_entries[0].path = testPath;
  for (const result of report.component_finding_results) result.finding_id = findingId;
  report.execution.selected.expected_symbols = [testSymbol];
  report.execution.selected.fresh_xml[0].testcases = [{ symbol: testSymbol }];
  for (const component of report.component_inventory) {
    const artifact = write(`components/${component.id.replace(':', '-')}.md`, `${component.id} definition\n`);
    component.path = artifact.path;
    component.digest = artifact.digest;
  }

  const review = JSON.parse(fs.readFileSync(path.resolve(root, '..', 'test-quality-review', 'tests', 'fixtures', 'valid', 'review-report.json'), 'utf8'));
  review.findings = [{
    id: findingId, kind: 'improvement', severity: 'low', confidence: 'high', rule_ids: ['TST-6'], path: testPath, line: 18,
    observable_contract: 'The public contract rejects zero quantity.', plausible_fault: 'A clearer assertion would make failures more diagnosable.',
    evidence: [{ path: testPath, line: 18, summary: 'The selected test protects the public rejection.' }],
    recommendation: 'Keep the observable assertion.',
  }];
  const reviewXml = write('test-quality-reports/build/test-results/test/TEST-example.PriceCalculatorTest.xml', '<testsuite tests="1"><testcase classname="example.PriceCalculatorTest" name="rejectsNegativePrice"/></testsuite>\n');
  const reviewXmlStat = fs.statSync(path.join(work, reviewXml.path));
  review.execution_evidence[0].report_path = reviewXml.path.replace('test-quality-reports/', '');
  review.execution_evidence[0].report_sha256 = reviewXml.digest;
  review.execution_evidence[0].report_mtime_epoch_ms = Math.floor(reviewXmlStat.mtimeMs);
  review.execution_evidence[0].started_at_epoch_ms = Math.floor(reviewXmlStat.mtimeMs) - 1000;
  const reviewArtifact = write('test-quality-reports/review.json', JSON.stringify(review));
  const followUp = clone(review);
  followUp.findings = [];
  const followUpArtifact = write('test-quality-reports/follow-up-review.json', JSON.stringify(followUp));
  const refactoring = JSON.parse(fs.readFileSync(path.resolve(root, '..', 'test-refactoring', 'tests', 'fixtures', 'valid', 'refactoring-report.json'), 'utf8'));
  refactoring.input.finding_ids = [findingId];
  refactoring.workflow_write_scope[0].finding_id = findingId;
  refactoring.workflow_write_scope[0].path = testPath;
  refactoring.smell_iterations[0].finding_id = findingId;
  refactoring.finding_results[0].finding_id = findingId;
  refactoring.changes[0].finding_id = findingId;
  refactoring.changes[0].path = testPath;
  refactoring.workspace_baseline.head = 'abc1234';
  refactoring.workspace_baseline.index_tree = 'def4567';
  refactoring.input.review_report_path = 'review.json';
  refactoring.input.review_report_sha256 = reviewArtifact.digest;
  const target = write('test-quality-reports/src/main/kotlin/example/OrderService.kt', 'package example\nclass OrderService\n');
  refactoring.mutation_capability.tool = 'controlled-mutation';
  refactoring.mutation_capability.target = target.path.replace('test-quality-reports/', '');
  refactoring.mutation_capability.restoration.original_byte_hash = target.digest;
  refactoring.mutation_capability.restoration.restored_byte_hash = target.digest;
  const refEvidence = (name, symbols, result = 'PASS') => {
    const cases = symbols.map((symbol) => {
      const divider = symbol.lastIndexOf('.');
      return `<testcase classname="${symbol.slice(0, divider)}" name="${symbol.slice(divider + 1)}">${result === 'FAIL' ? '<failure message="mutant survived assertion"/>' : ''}</testcase>`;
    }).join('');
    const artifact = write(`test-quality-reports/artifacts/${name}.xml`, `<testsuite>${cases}</testsuite>\n`);
    const stat = fs.statSync(path.join(work, artifact.path));
    return { command: './gradlew :app:test', exit_code: result === 'PASS' ? 0 : 1, executed_count: symbols.length, fresh: true, cache_state: 'EXECUTED',
      started_at_epoch_ms: Math.floor(stat.mtimeMs) - 1000, report_mtime_epoch_ms: Math.floor(stat.mtimeMs),
      report_path: artifact.path.replace('test-quality-reports/', ''), report_sha256: artifact.digest,
      executed_test_symbols: symbols, selected_test_symbols: symbols };
  };
  Object.assign(refactoring.baseline, refEvidence('baseline', ['example.OrderServiceTest.rejectsZeroQuantity']));
  refactoring.baseline.completed_before_first_edit = true;
  for (const rung of refactoring.verification_ladder) {
    if (rung.status === 'PASS') Object.assign(rung, refEvidence(rung.rung, rung.rung === 'selected' ? ['example.OrderServiceTest.rejectsZeroQuantity'] : ['example.OrderServiceTest.rejectsZeroQuantity']));
  }
  refactoring.negative_proof.failing_before_execution = refEvidence('negative-before', ['example.OrderServiceTest.rejectsZeroQuantity'], 'FAIL');
  refactoring.negative_proof.failing_after_execution = refEvidence('negative-after', ['example.OrderServiceTest.rejectsZeroQuantity'], 'FAIL');
  refactoring.negative_proof.restored_green_execution = refEvidence('negative-green', ['example.OrderServiceTest.rejectsZeroQuantity']);
  const refactoringArtifact = write('test-quality-reports/refactoring.json', JSON.stringify(refactoring));
  const xmlRelative = 'build/test-results/test/TEST-ExampleTest.xml';
  const xml = write(xmlRelative, '<testsuite tests="1"><testcase classname="example.OrderServiceTest" name="rejectsZeroQuantity"/></testsuite>\n');
  const xmlStat = fs.statSync(path.join(work, xmlRelative));
  report.execution.started_at = new Date(xmlStat.mtimeMs - 1000).toISOString();
  report.execution.selected.fresh_xml[0].path = xml.path;
  report.execution.selected.fresh_xml[0].byte_hash = xml.digest;
  report.execution.selected.fresh_xml[0].mtime = xmlStat.mtime.toISOString();
  const runnerArtifact = write('test-quality-reports/runner.json', JSON.stringify({
    schema: 'vulpora.test-runner/v1', verdict: 'PASS', selected: { exit_code: 0, executed_count: 1, test_symbols: [testSymbol], xml_paths: [xmlRelative] },
  }));
  for (const evidence of report.component_evidence) {
    const artifact = evidence.id === 'test-quality-review' ? reviewArtifact
      : evidence.id === 'test-refactoring' ? refactoringArtifact : runnerArtifact;
    evidence.report_path = artifact.path;
    evidence.report_digest = artifact.digest;
  }
  report.post_review.original_report_path = reviewArtifact.path;
  report.post_review.original_report_digest = reviewArtifact.digest;
  report.post_review.follow_up_report_path = followUpArtifact.path;
  report.post_review.follow_up_report_digest = followUpArtifact.digest;
  for (const rung of report.execution.verification_ladder) {
    if (rung.status === 'PASS') {
      const artifact = write(`test-quality-reports/workflow-${rung.kind}.json`, JSON.stringify({ rung: rung.kind }));
      rung.artifact_path = artifact.path;
      rung.artifact_digest = artifact.digest;
    }
  }
  const proof = write('test-quality-reports/negative-proof.json', '{"fault":"killed"}\n');
  report.negative_proof.artifact_path = proof.path;
  report.negative_proof.artifact_digest = proof.digest;
  const diff = write('test-quality-reports/postflight.json', JSON.stringify({ workflow_owned_entries: report.postflight.workflow_owned_entries, prohibited_paths: [] }));
  report.postflight.diff_evidence.path = diff.path;
  report.postflight.diff_evidence.digest = diff.digest;
  return report;
}

try {
  let report = materialize();
  let result = invoke(report);
  assert.equal(result.status, 0, result.stderr);

  const phantomComponent = clone(report);
  phantomComponent.component_evidence[0].report_path = 'test-quality-reports/missing.json';
  result = invoke(phantomComponent);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /component evidence report is unreadable/);

  const randomComponent = clone(report);
  write(randomComponent.component_evidence[0].report_path, '{"forged":true}\n');
  result = invoke(randomComponent);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /component evidence report SHA-256 does not match/);
  report = materialize();

  const phantomXml = clone(report);
  phantomXml.execution.selected.fresh_xml[0].path = 'build/test-results/test/TEST-missing.xml';
  result = invoke(phantomXml);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fresh_xml\[0\] is unreadable/);

  const parsedXmlMismatch = clone(report);
  const changed = write(parsedXmlMismatch.execution.selected.fresh_xml[0].path, '<testsuite tests="1"><testcase classname="example.ExampleTest" name="differentCase"/></testsuite>\n');
  parsedXmlMismatch.execution.selected.fresh_xml[0].byte_hash = changed.digest;
  parsedXmlMismatch.execution.selected.fresh_xml[0].mtime = fs.statSync(path.join(work, changed.path)).mtime.toISOString();
  result = invoke(parsedXmlMismatch);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /testcase metadata does not match parsed JUnit XML/);
  report = materialize();

  const missingPostReview = clone(report);
  missingPostReview.post_review.follow_up_report_path = 'test-quality-reports/missing-follow-up.json';
  result = invoke(missingPostReview);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /post-review follow-up report is unreadable/);

  const nonPassingPostReview = clone(report);
  const nonPassingReview = clone(JSON.parse(fs.readFileSync(path.join(work, report.post_review.follow_up_report_path), 'utf8')));
  nonPassingReview.verdict = 'PARTIAL';
  const nonPassingArtifact = write(report.post_review.follow_up_report_path, JSON.stringify(nonPassingReview));
  nonPassingPostReview.post_review.follow_up_report_digest = nonPassingArtifact.digest;
  result = invoke(nonPassingPostReview);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /post-review follow-up report must have PASS verdict/);
  report = materialize();

  const arbitraryVerdictInputs = clone(report);
  arbitraryVerdictInputs.verdict_inputs[0].status = 'PARTIAL';
  arbitraryVerdictInputs.verdict = 'PARTIAL';
  result = invoke(arbitraryVerdictInputs);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /verdict_inputs must match bound component report verdicts/);

  const failedJUnit = clone(report);
  const failedXml = write(failedJUnit.execution.selected.fresh_xml[0].path, '<testsuite tests="1" failures="1"><testcase classname="example.OrderServiceTest" name="rejectsZeroQuantity"><failure message="failure"/></testcase></testsuite>\n');
  failedJUnit.execution.selected.fresh_xml[0].byte_hash = failedXml.digest;
  failedJUnit.execution.selected.fresh_xml[0].mtime = fs.statSync(path.join(work, failedXml.path)).mtime.toISOString();
  result = invoke(failedJUnit);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contains failed, errored, or skipped testcases/);
  report = materialize();

  const multipleRoots = clone(report);
  const multipleRootsXml = write(multipleRoots.execution.selected.fresh_xml[0].path, '<testsuite><testcase classname="example.OrderServiceTest" name="rejectsZeroQuantity"/></testsuite><testsuite><testcase classname="example.OrderServiceTest" name="rejectsZeroQuantity"/></testsuite>\n');
  multipleRoots.execution.selected.fresh_xml[0].byte_hash = multipleRootsXml.digest;
  multipleRoots.execution.selected.fresh_xml[0].mtime = fs.statSync(path.join(work, multipleRootsXml.path)).mtime.toISOString();
  multipleRoots.execution.selected.executed_count = 2;
  multipleRoots.component_evidence.find((entry) => entry.id === 'agent:test-runner').report_digest = write('test-quality-reports/runner.json', JSON.stringify({
    schema: 'vulpora.test-runner/v1', verdict: 'PASS', selected: { exit_code: 0, executed_count: 2, test_symbols: multipleRoots.execution.selected.expected_symbols, xml_paths: [multipleRoots.execution.selected.fresh_xml[0].path] },
  })).digest;
  result = invoke(multipleRoots);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not strict JUnit XML/);
  report = materialize();

  const symlinkedXml = clone(report);
  const target = path.join(work, 'build/test-results/test/TEST-ExampleTest.xml');
  const link = path.join(work, 'build/test-results/test/TEST-link.xml');
  fs.symlinkSync(target, link);
  symlinkedXml.execution.selected.fresh_xml[0].path = 'build/test-results/test/TEST-link.xml';
  result = invoke(symlinkedXml);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fresh_xml\[0\] has a symlink ancestor/);

  const symlinkedWorkspacePath = clone(report);
  const workspaceTarget = path.join(work, 'workspace-target');
  fs.mkdirSync(workspaceTarget, { recursive: true });
  fs.writeFileSync(path.join(workspaceTarget, 'OrderServiceTest.kt'), 'package example\n');
  const workspaceLink = path.join(work, 'src/test/kotlin/link');
  fs.mkdirSync(path.dirname(workspaceLink), { recursive: true });
  fs.symlinkSync(workspaceTarget, workspaceLink);
  const linkedPath = 'src/test/kotlin/link/OrderServiceTest.kt';
  symlinkedWorkspacePath.workflow_write_scope[0].path = linkedPath;
  symlinkedWorkspacePath.postflight.workflow_owned_entries[0].path = linkedPath;
  result = invoke(symlinkedWorkspacePath);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /workflow_write_scope path has a symlink ancestor/);

  process.stdout.write(JSON.stringify({ outcome: 'pass', artifact_cases: 12, checks: ['component-path', 'component-hash', 'xml-path', 'xml-parser', 'multi-root-xml', 'junit-failure', 'post-review', 'bound-verdicts', 'xml-symlink', 'workspace-symlink'] }) + '\n');
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
