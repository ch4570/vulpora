'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validate, validateStructure } = require('../scripts/validate-workflow-report.js');

const fixtures = path.join(__dirname, 'fixtures');
const load = (group, name) => JSON.parse(fs.readFileSync(path.join(fixtures, group, name), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

function accepts(group, name) {
  assert.doesNotThrow(() => validateStructure(load(group, name)), `${group}/${name} should validate`);
}

function rejects(group, name, pattern) {
  assert.throws(() => validateStructure(load(group, name)), pattern, `${group}/${name} should be rejected`);
}

accepts('valid', 'refactor-pass.json');
accepts('valid', 'affected-module-partial.json');
rejects('invalid', 'forbidden-production-write-scope.json', /outside the test\/fixture\/report allowlist/);
rejects('invalid', 'user-change-overlap.json', /user change overlap must route to read-only audit/);
rejects('invalid', 'stale-selected-xml.json', /fresh XML must be newer/);

const valid = load('valid', 'refactor-pass.json');

assert.throws(() => validate(valid), /baseDir/,
  'exported validate must reject artifact-bearing reports without a report-directory base');

const scopeDrift = clone(valid);
scopeDrift.execution.selected.unexpected_symbols = ['example.HelperTest#alsoRan'];
scopeDrift.execution.selected.fresh_xml[0].testcases.push({ symbol: 'example.HelperTest#alsoRan' });
assert.throws(() => validateStructure(scopeDrift), /unexpected XML testcases require AFFECTED_MODULE/);

const verdictPromotion = clone(valid);
verdictPromotion.verdict_inputs[1].status = 'BLOCKED';
assert.throws(() => validateStructure(verdictPromotion), /verdict must equal the strongest/);

const mutationRestore = clone(valid);
mutationRestore.mutation_capability.restoration.restored_byte_hash = '9999999999999999999999999999999999999999999999999999999999999999';
assert.throws(() => validateStructure(mutationRestore), /exact hash and diff restoration/);

const userDiffChanged = clone(valid);
userDiffChanged.postflight.user_entries[0].mode = '100755';
assert.throws(() => validateStructure(userDiffChanged), /preserve every user-owned entry/);

const broadCleanup = clone(valid);
broadCleanup.postflight.cleanup_actions = [{ scope: 'namespace', owned: true, command: 'FLUSHDB' }];
assert.throws(() => validateStructure(broadCleanup), /broad cleanup command is forbidden/);

const auditWrite = clone(valid);
auditWrite.routing.route = 'AUDIT_ONLY';
assert.throws(() => validateStructure(auditWrite), /AUDIT_ONLY cannot reserve repository write scope/);

const emptyRoutes = clone(valid);
emptyRoutes.routing.finding_routes = [];
assert.throws(() => validateStructure(emptyRoutes), /REFACTOR and AUTHOR require non-empty finding_routes/);

const emptySelectedEvidence = clone(valid);
emptySelectedEvidence.execution.selected.expected_symbols = [];
emptySelectedEvidence.execution.selected.expected_xml_globs = [];
emptySelectedEvidence.execution.selected.fresh_xml = [];
assert.throws(() => validateStructure(emptySelectedEvidence), /selected PASS requires non-empty expected symbols, XML globs, and fresh XML/);

const noOwnedEntries = clone(valid);
noOwnedEntries.postflight.workflow_owned_entries = [];
assert.throws(() => validateStructure(noOwnedEntries), /COMPLETE edit route requires workflow-owned entries/);

const unlinkedOwnedEntry = clone(valid);
unlinkedOwnedEntry.postflight.workflow_owned_entries[0].finding_id = 'FIND-OTHER';
assert.throws(() => validateStructure(unlinkedOwnedEntry), /correspond exactly to frozen write scope and declared findings/);

const mismatchedFindingRoute = clone(valid);
mismatchedFindingRoute.routing.finding_routes[0].finding_id = 'FIND-OTHER';
assert.throws(() => validateStructure(mismatchedFindingRoute), /link exactly to frozen workflow_write_scope finding IDs/);

const unboundResolution = clone(valid);
unboundResolution.routing.finding_routes[0].resolution_result_id = 'review:FIND-ORACLE-001';
assert.throws(() => validateStructure(unboundResolution), /resolution_result_id must bind its exact routed component finding result/);

const undercountedExecution = clone(valid);
undercountedExecution.execution.selected.executed_count = 1;
undercountedExecution.execution.selected.expected_symbols.push('example.ExampleTest#rejectsSecondFault');
undercountedExecution.execution.selected.fresh_xml[0].testcases.push({ symbol: 'example.ExampleTest#rejectsSecondFault' });
assert.throws(() => validateStructure(undercountedExecution), /executed_count cannot be less than observed selected XML testcases/);

const absentPostReview = clone(valid);
delete absentPostReview.post_review;
assert.throws(() => validateStructure(absentPostReview), /post_review must reconcile every final verdict/);

const partialWithoutPostReview = load('valid', 'affected-module-partial.json');
delete partialWithoutPostReview.post_review;
assert.throws(() => validateStructure(partialWithoutPostReview), /post_review must reconcile every final verdict/);

const absentComponentEvidence = clone(valid);
delete absentComponentEvidence.component_evidence;
assert.throws(() => validateStructure(absentComponentEvidence), /component_evidence must bind each referenced component report/);

const userOverlap = clone(valid);
userOverlap.baseline.user_entries[0].path = 'src/test/kotlin/example/ExampleTest.kt';
assert.throws(() => validateStructure(userOverlap), /user change overlap must route to read-only audit/);

const renamedUserOverlap = clone(valid);
renamedUserOverlap.baseline.user_entries[2].rename_from = 'src/test/kotlin/example/ExampleTest.kt';
assert.throws(() => validateStructure(renamedUserOverlap), /user change overlap must route to read-only audit/);

process.stdout.write(JSON.stringify({ outcome: 'pass', validator_cases: 23, assertions: ['fresh-xml', 'scope-drift', 'verdict-precedence', 'restoration', 'user-diff', 'cleanup', 'finding-route', 'component-result-linkage', 'owned-write', 'post-review', 'component-evidence', 'executed-count', 'rename-overlap'] }) + '\n');
