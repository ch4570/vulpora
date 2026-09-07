#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
VALIDATOR="$ROOT/scripts/validate-refactoring-report.js"
FIXTURES="$ROOT/tests/fixtures"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-test-refactoring.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

require() {
  local file="$1" text="$2"
  grep -Fq -- "$text" "$file" || { echo "missing '$text' in $file" >&2; exit 1; }
}

test -s "$ROOT/SKILL.md"
test -s "$ROOT/agents/openai.yaml"
test -f "$VALIDATOR"
require "$ROOT/SKILL.md" 'TST-19'
require "$ROOT/SKILL.md" 'TST-20'
require "$ROOT/SKILL.md" 'USER_CHANGE_OVERLAP'
require "$ROOT/SKILL.md" 'one finding/smell at a time'
require "$ROOT/SKILL.md" 'AUDIT_ONLY'
require "$ROOT/SKILL.md" 'src/test/**'
require "$ROOT/SKILL.md" 'controlled mutation'
require "$ROOT/agents/openai.yaml" 'workflow_contract: "vulpora.test-refactoring/v1"'
require "$ROOT/agents/openai.yaml" 'test-authoring'

node - "$FIXTURES" "$WORK" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const [fixtures, out] = process.argv.slice(2);
const read = (relative) => JSON.parse(fs.readFileSync(path.join(fixtures, relative), 'utf8'));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const write = (relative, value) => fs.writeFileSync(path.join(out, relative), JSON.stringify(value, null, 2));
fs.mkdirSync(path.join(out, 'artifacts'), { recursive: true });
fs.mkdirSync(path.join(out, 'src/main/kotlin/example'), { recursive: true });
fs.mkdirSync(path.join(out, 'build/test-results/test'), { recursive: true });

const review = read('../../../test-quality-review/tests/fixtures/valid/review-report.json');
const findingPaths = {
  'TQR-17': 'src/test/kotlin/example/OrderServiceTest.kt',
  'TQR-23': 'tests/test_order.py',
  'TQR-44': 'src/test/kotlin/example/FeedTest.kt',
  'TQR-STRONG-1': 'src/test/kotlin/example/FeedQueryControllerTest.kt',
};
review.findings = ['TQR-17', 'TQR-23', 'TQR-44', 'TQR-STRONG-1'].map((id) => ({
  id,
  kind: 'improvement',
  severity: 'low',
  confidence: 'high',
  rule_ids: ['TST-6'],
  path: findingPaths[id],
  line: 18,
  observable_contract: 'The public contract rejects a negative price.',
  plausible_fault: 'A removed validation guard accepts a negative price.',
  evidence: [{ path: 'src/test/kotlin/example/PriceCalculatorTest.kt', line: 18, summary: 'The selected test names the rejected public behavior.' }],
  recommendation: 'Keep the observable contract assertion.',
  behavior_id: 'BEH-PRICE-NEGATIVE',
}));
const reviewStarted = Date.now() - 100;
const reviewXmlPath = 'build/test-results/test/TEST-example.PriceCalculatorTest.xml';
const reviewXml = '<testsuite tests="1" failures="0" errors="0" skipped="0"><testcase classname="example.PriceCalculatorTest" name="rejectsNegativePrice"/></testsuite>\n';
fs.writeFileSync(path.join(out, reviewXmlPath), reviewXml);
const reviewXmlStat = fs.statSync(path.join(out, reviewXmlPath));
Object.assign(review.execution_evidence[0], {
  started_at_epoch_ms: reviewStarted,
  report_path: reviewXmlPath,
  report_sha256: sha(Buffer.from(reviewXml)),
  report_mtime_epoch_ms: Math.floor(reviewXmlStat.mtimeMs),
  fresh: true,
  cache_state: 'EXECUTED',
  executed_count: 1,
  requested_test_symbols: ['example.PriceCalculatorTest.rejectsNegativePrice'],
  executed_test_symbols: ['example.PriceCalculatorTest.rejectsNegativePrice'],
});
write('review-report.json', review);
const reviewHash = sha(fs.readFileSync(path.join(out, 'review-report.json')));
fs.writeFileSync(path.join(out, 'bad-review.json'), '{}\n');
fs.symlinkSync('review-report.json', path.join(out, 'review-link.json'));
const targetPath = 'src/main/kotlin/example/OrderService.kt';
fs.writeFileSync(path.join(out, targetPath), 'package example\nclass OrderService\n');
const targetHash = sha(fs.readFileSync(path.join(out, targetPath)));

function evidence(name, symbols, result = 'PASS') {
  const started = Date.now() - 100;
  const relative = `artifacts/${name}.xml`;
  const testcases = symbols.map((symbol) => {
    const split = symbol.lastIndexOf('.');
    const failure = result === 'FAIL' ? '<failure message="controlled mutant survived assertion"/>' : '';
    return `<testcase classname="${symbol.slice(0, split)}" name="${symbol.slice(split + 1)}">${failure}</testcase>`;
  }).join('');
  fs.writeFileSync(path.join(out, relative), `<testsuite>${testcases}</testsuite>\n`);
  const stat = fs.statSync(path.join(out, relative));
  return {
    command: `./gradlew :app:test --tests ${symbols[0]}`,
    exit_code: result === 'PASS' ? 0 : 1,
    executed_count: symbols.length,
    fresh: true,
    cache_state: 'EXECUTED',
    started_at_epoch_ms: started,
    report_path: relative,
    report_sha256: sha(fs.readFileSync(path.join(out, relative))),
    report_mtime_epoch_ms: Math.floor(stat.mtimeMs),
    executed_test_symbols: symbols,
  };
}

function materialize(name, template) {
  const report = structuredClone(template);
  report.input.review_report_path = 'review-report.json';
  report.input.review_report_sha256 = reviewHash;
  report.input.finding_owned_fixture_paths = [];
  report.workspace_baseline.head = 'a'.repeat(40);
  report.workspace_baseline.index_tree = 'b'.repeat(40);
  report.workspace_baseline.user_changes = report.workspace_baseline.user_changes.map((entry) => ({
    ...entry,
    byte_hash: entry.byte_hash === null ? null : 'c'.repeat(64),
  }));
  report.postflight.user_changes = structuredClone(report.workspace_baseline.user_changes);
  if (report.profile.mode === 'AUTO_REFACTOR') {
    const symbols = report.baseline.selected_test_symbols;
    Object.assign(report.baseline, evidence(`${name}-baseline`, symbols));
    for (const rung of report.verification_ladder) {
      if (rung.status === 'PASS') {
        const rungSymbols = rung.rung === 'selected' ? rung.selected_test_symbols : symbols;
        Object.assign(rung, evidence(`${name}-${rung.rung}`, rungSymbols));
        if (rung.rung === 'selected') rung.selected_test_symbols = symbols;
      }
    }
  }
  if (report.mutation_capability.status === 'controlled_allowed') {
    report.mutation_capability.tool = 'repository-controlled-mutation-protocol';
    report.mutation_capability.target = targetPath;
    report.mutation_capability.restoration.original_byte_hash = targetHash;
    report.mutation_capability.restoration.restored_byte_hash = targetHash;
  }
  if (report.negative_proof.status === 'PASS') {
    const symbols = report.baseline.selected_test_symbols;
    report.negative_proof.failing_before_execution = {
      ...evidence(`${name}-negative-before`, symbols, 'FAIL'),
      selected_test_symbols: symbols,
    };
    report.negative_proof.failing_after_execution = {
      ...evidence(`${name}-negative-after`, symbols, 'FAIL'),
      selected_test_symbols: symbols,
    };
    report.negative_proof.restored_green_execution = {
      ...evidence(`${name}-negative-green`, symbols),
      selected_test_symbols: symbols,
    };
  }
  write(`${name}.json`, report);
}

materialize('refactoring-report', read('valid/refactoring-report.json'));
materialize('audit-only-report', read('valid/audit-only-report.json'));
materialize('user-change-overlap-blocked', read('valid/user-change-overlap-blocked.json'));
materialize('no-churn-report', read('valid/no-churn-report.json'));
NODE

node "$VALIDATOR" "$WORK/refactoring-report.json" > "$WORK/valid.out"
node "$VALIDATOR" "$WORK/audit-only-report.json" > "$WORK/audit.out"
node "$VALIDATOR" "$WORK/user-change-overlap-blocked.json" > "$WORK/blocked.out"
node "$VALIDATOR" "$WORK/no-churn-report.json" > "$WORK/no-churn.out"
grep -Fq '"outcome":"pass"' "$WORK/valid.out"
grep -Fq '"finding_count":1' "$WORK/audit.out"

expect_failure() {
  local name="$1" expected="$2"
  if node "$VALIDATOR" "$WORK/$name.json" > "$WORK/$name.out" 2> "$WORK/$name.err"; then
    echo "$name unexpectedly validated" >&2
    exit 1
  fi
  if ! grep -Fqx "$expected" "$WORK/$name.err"; then
    echo "$name returned: $(cat "$WORK/$name.err")" >&2
    exit 1
  fi
}

if node "$VALIDATOR" "$FIXTURES/invalid/not-json.json" > /dev/null 2> "$WORK/not-json.err"; then
  echo 'invalid JSON unexpectedly validated' >&2
  exit 1
fi
grep -Fqx 'INVALID_JSON' "$WORK/not-json.err"
if node "$VALIDATOR" "$FIXTURES/invalid/missing-required-field.json" > /dev/null 2> "$WORK/missing.err"; then
  echo 'missing fields unexpectedly validated' >&2
  exit 1
fi
grep -Fqx 'MISSING_REQUIRED_FIELD' "$WORK/missing.err"

node - "$WORK/refactoring-report.json" "$WORK/audit-only-report.json" "$WORK" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const [source, auditSource, out] = process.argv.slice(2);
const valid = JSON.parse(fs.readFileSync(source, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditSource, 'utf8'));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const setArtifact = (execution, name, xml) => {
  const relative = `artifacts/${name}.xml`;
  fs.writeFileSync(`${out}/${relative}`, xml);
  const stat = fs.statSync(`${out}/${relative}`);
  execution.report_path = relative;
  execution.report_sha256 = sha(fs.readFileSync(`${out}/${relative}`));
  execution.report_mtime_epoch_ms = Math.floor(stat.mtimeMs);
};
const write = (name, mutate) => {
  const report = structuredClone(valid);
  mutate(report);
  fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(report, null, 2));
};
write('weakening', (r) => { r.changes[0].classification = 'weakening'; });
write('production-path', (r) => {
  r.workflow_write_scope[0].path = 'src/main/kotlin/example/OrderService.kt';
  r.workflow_write_scope[0].kind = 'test';
  r.changes[0].path = 'src/main/kotlin/example/OrderService.kt';
  r.postflight.workflow_changed_paths = ['src/main/kotlin/example/OrderService.kt'];
});
write('out-of-scope-finding', (r) => { r.changes[0].finding_id = 'TQR-OTHER'; });
write('missing-restoration', (r) => { r.mutation_capability.restoration.restored_byte_hash = 'different-sha'; });
write('overlap-not-blocked', (r) => {
  r.workspace_baseline.user_changes = [{ path: r.workflow_write_scope[0].path, state: 'unstaged', byte_hash: 'd'.repeat(64), mode: '100644' }];
  r.postflight.user_changes = structuredClone(r.workspace_baseline.user_changes);
});
write('audit-edits', (r) => {
  r.profile = { language: 'node', runtime: 'node', framework: 'node:test', mode: 'AUDIT_ONLY', evidence: ['package.json uses node:test'] };
});
write('stale-selected', (r) => { r.verification_ladder[0].fresh = false; });
write('unrun-boundary', (r) => { r.verification_ladder[2].applicable = true; });
write('baseline-after-edit', (r) => { r.baseline.completed_before_first_edit = false; });
write('missing-review', (r) => { r.input.review_report_path = 'does-not-exist.json'; });
write('wrong-review-hash', (r) => { r.input.review_report_sha256 = 'a'.repeat(64); });
write('uppercase-review-hash', (r) => { r.input.review_report_sha256 = r.input.review_report_sha256.toUpperCase(); });
write('invalid-review', (r) => {
  r.input.review_report_path = 'bad-review.json';
  r.input.review_report_sha256 = sha(fs.readFileSync(`${out}/bad-review.json`));
});
write('finding-absent-from-review', (r) => { r.input.finding_ids = ['TQR-NOT-IN-REVIEW']; });
write('symlink-review', (r) => {
  r.input.review_report_path = 'review-link.json';
  r.input.review_report_sha256 = sha(fs.readFileSync(`${out}/review-report.json`));
});
write('stale-artifact', (r) => { r.verification_ladder[0].started_at_epoch_ms = r.verification_ladder[0].report_mtime_epoch_ms + 1; });
write('cache-only-artifact', (r) => { r.verification_ladder[0].cache_state = 'CACHE_ONLY'; });
write('zero-executed-artifact', (r) => { r.verification_ladder[0].executed_count = 0; });
write('missing-executed-symbol', (r) => {
  r.verification_ladder[0].executed_test_symbols = ['example.OrderServiceTest.missingCase'];
  r.verification_ladder[0].selected_test_symbols = ['example.OrderServiceTest.missingCase'];
});
write('missing-execution-artifact', (r) => { r.verification_ladder[0].report_path = 'artifacts/missing.xml'; });
write('wrong-execution-hash', (r) => { r.verification_ladder[0].report_sha256 = 'b'.repeat(64); });
write('controlled-without-tool', (r) => { r.mutation_capability.tool = null; });
write('controlled-capability-bad-restoration', (r) => {
  r.negative_proof = { status: 'NOT_RUN', method: 'preexisting_red', plausible_fault: 'A known red run was not captured.', selected_test_observation: 'NOT_RUN', restored_green: 'NOT_RUN' };
  r.mutation_capability.restoration.restored_byte_hash = 'c'.repeat(64);
});
write('finding-path-mismatch', (r) => {
  r.workflow_write_scope[0].path = 'src/test/kotlin/example/FeedTest.kt';
  r.changes[0].path = 'src/test/kotlin/example/FeedTest.kt';
  r.postflight.workflow_changed_paths = ['src/test/kotlin/example/FeedTest.kt'];
});
write('finding-owned-fixture', (r) => {
  const fixture = 'src/test/resources/example/order-invalid.json';
  r.input.finding_owned_fixture_paths = [{ finding_id: 'TQR-17', path: fixture }];
  r.workflow_write_scope[0] = { finding_id: 'TQR-17', path: fixture, kind: 'fixture' };
  r.changes[0].path = fixture;
  r.postflight.workflow_changed_paths = [fixture];
});
write('unowned-fixture', (r) => {
  const fixture = 'src/test/resources/example/order-invalid.json';
  r.workflow_write_scope[0] = { finding_id: 'TQR-17', path: fixture, kind: 'fixture' };
  r.changes[0].path = fixture;
  r.postflight.workflow_changed_paths = [fixture];
});
write('malformed-junit', (r) => {
  setArtifact(r.verification_ladder[0], 'malformed-junit', '<testsuite><testcase classname="example.OrderServiceTest" name="rejectsZeroQuantity"></testsuite>');
});
write('failure-junit-pass', (r) => {
  setArtifact(r.verification_ladder[0], 'failure-junit', '<testsuite><testcase classname="example.OrderServiceTest" name="rejectsZeroQuantity"><failure/></testcase></testsuite>');
});
write('error-junit-pass', (r) => {
  setArtifact(r.verification_ladder[0], 'error-junit', '<testsuite><testcase classname="example.OrderServiceTest" name="rejectsZeroQuantity"><error/></testcase></testsuite>');
});
write('skipped-junit-pass', (r) => {
  setArtifact(r.verification_ladder[0], 'skipped-junit', '<testsuite><testcase classname="example.OrderServiceTest" name="rejectsZeroQuantity"><skipped/></testcase></testsuite>');
});
fs.symlinkSync('artifacts', `${out}/linked-artifacts`);
write('symlink-execution-ancestor', (r) => { r.verification_ladder[0].report_path = 'linked-artifacts/refactoring-report-selected.xml'; });
fs.symlinkSync('src', `${out}/linked-src`);
write('symlink-mutation-ancestor', (r) => { r.mutation_capability.target = 'linked-src/main/kotlin/example/OrderService.kt'; });
write('invalid-user-hash', (r) => {
  r.workspace_baseline.user_changes = [{ path: r.workflow_write_scope[0].path, state: 'unstaged', byte_hash: 'D'.repeat(64), mode: '100644' }];
  r.postflight.user_changes = structuredClone(r.workspace_baseline.user_changes);
});
write('invalid-user-mode', (r) => {
  r.workspace_baseline.user_changes = [{ path: r.workflow_write_scope[0].path, state: 'unstaged', byte_hash: 'd'.repeat(64), mode: '644' }];
  r.postflight.user_changes = structuredClone(r.workspace_baseline.user_changes);
});
write('invalid-user-state', (r) => {
  r.workspace_baseline.user_changes = [{ path: r.workflow_write_scope[0].path, state: 'edited', byte_hash: 'd'.repeat(64), mode: '100644' }];
  r.postflight.user_changes = structuredClone(r.workspace_baseline.user_changes);
});
write('negative-proof-evidence-missing', (r) => { delete r.negative_proof.failing_before_execution; });
write('negative-proof-not-red', (r) => { r.negative_proof.failing_after_execution.exit_code = 0; });
write('rename-overlap-not-blocked', (r) => {
  r.workspace_baseline.user_changes = [{ path: 'src/test/kotlin/example/OrderServiceTestRenamed.kt', state: 'rename', byte_hash: 'd'.repeat(64), mode: '100644', rename_from: r.workflow_write_scope[0].path }];
  r.postflight.user_changes = structuredClone(r.workspace_baseline.user_changes);
});
const auditOverlap = structuredClone(audit);
auditOverlap.workspace_baseline.user_changes = [{ path: auditOverlap.workflow_write_scope[0].path, state: 'unstaged', byte_hash: 'd'.repeat(64), mode: '100644' }];
auditOverlap.postflight.user_changes = structuredClone(auditOverlap.workspace_baseline.user_changes);
fs.writeFileSync(`${out}/audit-overlap.json`, JSON.stringify(auditOverlap, null, 2));
NODE

node "$VALIDATOR" "$WORK/finding-owned-fixture.json" > "$WORK/finding-owned-fixture.out"

expect_failure weakening WEAKENING_BLOCKED
expect_failure production-path FINDING_PATH_MISMATCH
expect_failure out-of-scope-finding CHANGE_OUTSIDE_FINDING_SCOPE
expect_failure missing-restoration MUTATION_RESTORATION_MISSING
expect_failure overlap-not-blocked USER_CHANGE_OVERLAP
expect_failure audit-edits AUDIT_ONLY_MUST_NOT_EDIT
expect_failure stale-selected INVALID_VERIFICATION_EXECUTION
expect_failure unrun-boundary APPLICABLE_RUNG_NOT_RUN
expect_failure baseline-after-edit BASELINE_NOT_FIRST
expect_failure missing-review REVIEW_REPORT_UNREADABLE
expect_failure wrong-review-hash REVIEW_REPORT_SHA256_MISMATCH
expect_failure uppercase-review-hash REVIEW_REPORT_SHA256_INVALID
expect_failure invalid-review REVIEW_REPORT_INVALID
expect_failure finding-absent-from-review FINDING_NOT_IN_REVIEW
expect_failure symlink-review REVIEW_REPORT_UNREADABLE
expect_failure stale-artifact INVALID_VERIFICATION_EXECUTION
expect_failure cache-only-artifact INVALID_VERIFICATION_EXECUTION
expect_failure zero-executed-artifact INVALID_VERIFICATION_EXECUTION
expect_failure missing-executed-symbol EXECUTED_TEST_SYMBOL_MISSING
expect_failure missing-execution-artifact EXECUTION_REPORT_UNREADABLE
expect_failure wrong-execution-hash EXECUTION_REPORT_EVIDENCE_MISMATCH
expect_failure controlled-without-tool INVALID_MUTATION_CAPABILITY
expect_failure controlled-capability-bad-restoration MUTATION_RESTORATION_MISSING
expect_failure finding-path-mismatch FINDING_PATH_MISMATCH
expect_failure unowned-fixture FINDING_PATH_MISMATCH
expect_failure malformed-junit MALFORMED_JUNIT_XML
expect_failure failure-junit-pass PASS_EXECUTION_NOT_GREEN
expect_failure error-junit-pass PASS_EXECUTION_NOT_GREEN
expect_failure skipped-junit-pass PASS_EXECUTION_NOT_GREEN
expect_failure symlink-execution-ancestor EXECUTION_REPORT_UNREADABLE
expect_failure symlink-mutation-ancestor MUTATION_TARGET_UNREADABLE
expect_failure invalid-user-hash INVALID_WORKSPACE_BASELINE
expect_failure invalid-user-mode INVALID_WORKSPACE_BASELINE
expect_failure invalid-user-state INVALID_WORKSPACE_BASELINE
expect_failure negative-proof-evidence-missing NEGATIVE_PROOF_EVIDENCE_MISSING
expect_failure negative-proof-not-red FAIL_EXECUTION_NOT_RED
expect_failure rename-overlap-not-blocked USER_CHANGE_OVERLAP
expect_failure audit-overlap USER_CHANGE_OVERLAP

echo 'test-refactoring contract: PASS'
