#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {
  canonicalJson,
  validateLifecycle,
  validateLedgerFile,
  validateProceedDecisionBinding,
  validateRoutingReceiptBindings,
  validateTaskExecutionLineage,
} = require('./validate-execution-ledger.js');
const {parseTaskDag} = require('./validate-task-dag.js');

function reject(code) {
  process.stderr.write(`${code}\n`);
  process.exit(1);
}

if (process.argv.length !== 9) {
  reject('USAGE_REPORT_CONFIG_HEAD_DIFF_SPEC_HASH_DAG_HASH_LEDGER_PATH');
}
const [
  , , reportPath, runtimeConfigurationId, headSha, diffSha256, specSha256, dagSha256,
  ledgerPath,
] = process.argv;
let report;
try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch { reject('INVALID_REPORT'); }

const continuation = report.continuation;
if (report.terminal_status !== 'partial' || continuation?.status !== 'ready_to_resume' || !continuation.resumable
  || continuation.question !== null) {
  reject('NOT_RESUMABLE_PARTIAL');
}
if (continuation.same_session_only) reject('SUCCESSOR_RUN_RESUME_REQUIRED');
if (report.runtime_configuration_id !== runtimeConfigurationId) reject('RUNTIME_CONFIGURATION_DRIFT');
if (continuation.workspace_snapshot?.head_sha !== headSha) reject('HEAD_DRIFT');
if (continuation.workspace_snapshot?.diff_sha256 !== diffSha256) reject('WORKTREE_DRIFT');

const artifacts = new Map((continuation.preserved_artifacts || []).map((artifact) => [artifact.path, artifact.sha256]));
if (report.clarified_spec?.sha256 !== specSha256 || artifacts.get(report.clarified_spec?.path) !== specSha256) {
  reject('SPEC_DRIFT');
}
if (report.task_dag?.sha256 !== dagSha256 || artifacts.get(report.task_dag?.path) !== dagSha256) {
  reject('DAG_DRIFT');
}
if (report.schema_version !== 'vulpora.orchestration-report/v3') reject('UNSUPPORTED_REPORT_VERSION');
let workspaceRealPath;
try { workspaceRealPath = fs.realpathSync.native(process.cwd()); } catch { reject('WORKSPACE_ROOT_UNREADABLE'); }
function readBoundArtifact(relativePath, expectedSha256, code) {
  if (typeof relativePath !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256 || '')) reject(`${code}_REFERENCE_INVALID`);
  const absolute = path.resolve(workspaceRealPath, relativePath);
  let stat;
  let real;
  let bytes;
  try {
    stat = fs.lstatSync(absolute);
    real = fs.realpathSync.native(absolute);
    bytes = fs.readFileSync(real);
  } catch { reject(`${code}_UNREADABLE`); }
  if (!stat.isFile() || stat.isSymbolicLink() || !real.startsWith(`${workspaceRealPath}${path.sep}`)) {
    reject(`${code}_PATH_INVALID`);
  }
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== expectedSha256) reject(`${code}_HASH_MISMATCH`);
  return bytes;
}
const specBytes = readBoundArtifact(report.clarified_spec.path, specSha256, 'SPEC');
const dagBytes = readBoundArtifact(report.task_dag.path, dagSha256, 'DAG');
const expectedProjectionRelative = `.vulpora/tasks/${report.run_id}/clarity-projection.json`;
if (report.clarity_gate_evidence?.projection_path !== expectedProjectionRelative) reject('CLARITY_PROJECTION_PATH_MISMATCH');
const projectionBytes = readBoundArtifact(
  expectedProjectionRelative,
  report.clarity_gate_evidence?.projection_sha256,
  'CLARITY_PROJECTION',
);
let projection;
try { projection = JSON.parse(projectionBytes.toString('utf8')); } catch { reject('CLARITY_PROJECTION_JSON_INVALID'); }
if (Buffer.from(canonicalJson(projection), 'utf8').compare(projectionBytes) !== 0) reject('CLARITY_PROJECTION_NON_CANONICAL');
const clarityReplay = spawnSync(process.execPath, [path.join(__dirname, 'validate-clarity-gate.js')], {
  input: projectionBytes,
  encoding: 'utf8',
  maxBuffer: 1024 * 1024,
});
if (clarityReplay.error || clarityReplay.status !== 0) reject('CLARITY_PROJECTION_SEMANTIC_INVALID');
const specText = specBytes.toString('utf8');
let spec;
try { spec = JSON.parse(specText); } catch { reject('SPEC_JSON_INVALID'); }
if (canonicalJson(spec) !== specText
  || spec.schema !== 'vulpora.clarified-task-spec/v2'
  || spec.status !== projection.spec_status
  || spec.clarity_projection_path !== expectedProjectionRelative
  || spec.clarity_projection_sha256 !== report.clarity_gate_evidence.projection_sha256
  || canonicalJson(spec.clarity_projection) !== projectionBytes.toString('utf8')
  || Object.hasOwn(spec, 'unknowns') || Object.hasOwn(spec, 'clarity_gate') || Object.hasOwn(spec, 'approval')) {
  reject('SPEC_CLARITY_PROJECTION_DRIFT');
}
if (report.clarified_spec.id !== spec.spec_id) reject('SPEC_REPORT_IDENTITY_DRIFT');
let dag;
try { dag = parseTaskDag(dagBytes.toString('utf8'), spec); } catch { reject('DAG_CONTRACT_INVALID'); }
const reportTaskIds = [...new Set((report.task_results || []).map((result) => result.task_id))].sort();
const dagTaskIds = [...dag.tasks.keys()].sort();
if (canonicalJson(reportTaskIds) !== canonicalJson(dagTaskIds)) reject('REPORT_TASK_INVENTORY_DRIFT');
const completedTaskIds = dagTaskIds.filter((taskId) => report.task_results.some((result) =>
  result.task_id === taskId && result.status === 'verified')).sort();
const pendingTaskIds = dagTaskIds.filter((taskId) => !completedTaskIds.includes(taskId)).sort();
if (canonicalJson([...continuation.completed_task_ids].sort()) !== canonicalJson(completedTaskIds)
  || canonicalJson([...continuation.pending_task_ids].sort()) !== canonicalJson(pendingTaskIds)) {
  reject('CONTINUATION_TASK_FRONTIER_DRIFT');
}
const remainingCriteria = [...dag.coverage].filter(([criterionId, taskIds]) => taskIds.some((taskId) =>
  !report.task_results.some((result) => result.task_id === taskId && result.status === 'verified'
    && result.acceptance_evidence.some((evidence) => evidence.acceptance_criterion_id === criterionId))))
  .map(([criterionId]) => criterionId).sort();
if (canonicalJson([...continuation.remaining_acceptance_criterion_ids].sort()) !== canonicalJson(remainingCriteria)) {
  reject('CONTINUATION_ACCEPTANCE_FRONTIER_DRIFT');
}
const expectedLedgerRelative = `.vulpora/tasks/${report.run_id}/execution-ledger.jsonl`;
if (report.execution_ledger?.path !== expectedLedgerRelative) reject('LEDGER_REPORT_PATH_MISMATCH');
let providedLedgerRealPath;
let expectedLedgerRealPath;
try {
  providedLedgerRealPath = fs.realpathSync.native(path.resolve(ledgerPath));
  expectedLedgerRealPath = fs.realpathSync.native(path.resolve(process.cwd(), expectedLedgerRelative));
} catch {
  reject('LEDGER_DESIGNATED_PATH_UNREADABLE');
}
if (providedLedgerRealPath !== expectedLedgerRealPath) {
  reject('LEDGER_ARGUMENT_PATH_MISMATCH');
}
let ledger;
try { ledger = validateLedgerFile(ledgerPath, report.run_id); } catch { reject('LEDGER_REPLAY_FAILED'); }
try { validateLifecycle(ledger.records, 'active'); } catch { reject('LEDGER_LIFECYCLE_INVALID'); }
try { validateProceedDecisionBinding(ledger.records, spec); } catch { reject('PROCEED_DECISION_LEDGER_DRIFT'); }
if (report.execution_ledger?.head_sha256 !== ledger.headSha256) reject('LEDGER_HEAD_DRIFT');
if (report.execution_ledger?.record_count !== ledger.records.length) reject('LEDGER_COUNT_DRIFT');
const expectedProjectionRef = `file-sha256:${report.clarity_gate_evidence.projection_sha256}:${expectedProjectionRelative}`;
const projectionFreeze = ledger.records.find((record) => record.phase === 'approve'
  && record.event_type === 'clarity_projection_frozen' && record.source_type === 'filesystem_digest'
  && record.status === 'passed' && record.source_ref === expectedProjectionRef);
if (!projectionFreeze) reject('CLARITY_PROJECTION_LEDGER_DRIFT');
const clarityCheck = report.verification.find((check) => Array.isArray(check.argv)
  && check.argv.at(-1)?.endsWith('validate-clarity-gate.js'));
if (!clarityCheck || clarityCheck.stdin_sha256 !== report.clarity_gate_evidence.projection_sha256
  || clarityCheck.exit_code !== 0 || clarityCheck.outcome !== 'pass') reject('CLARITY_VALIDATION_REPORT_MISSING');
const clarityCommandDigest = crypto.createHash('sha256')
  .update(canonicalJson({argv:clarityCheck.argv, stdin_sha256:clarityCheck.stdin_sha256})).digest('hex');
const clarityCommand = ledger.records.find((record) => record.phase === 'approve'
  && record.event_type === 'command_finished' && record.source_type === 'runtime_result'
  && record.status === 'passed' && record.source_ref === `command-sha256:${clarityCommandDigest}:exit:0`);
const clarityValidated = ledger.records.find((record) => record.phase === 'approve'
  && record.event_type === 'clarity_gate_validated' && record.source_type === 'runtime_result'
  && record.status === 'passed'
  && record.source_ref === `clarity-command-sha256:${clarityCommandDigest}:projection-sha256:${report.clarity_gate_evidence.projection_sha256}`);
if (!clarityCommand || !clarityValidated || projectionFreeze.sequence >= clarityCommand.sequence
  || clarityCommand.sequence >= clarityValidated.sequence) reject('CLARITY_VALIDATION_LEDGER_MISSING');
for (const [artifact, phase] of [[report.clarified_spec, 'approve'], [report.task_dag, 'split']]) {
  const expectedRef = `file-sha256:${artifact.sha256}:${artifact.path}`;
  if (!ledger.records.some((record) => record.phase === phase && record.event_type === 'artifact_frozen'
    && record.source_type === 'filesystem_digest' && record.status === 'passed'
    && record.source_ref === expectedRef)) reject('FROZEN_ARTIFACT_LEDGER_DRIFT');
}
try { validateRoutingReceiptBindings(report, workspaceRealPath, ledger.records); } catch (error) {
  reject(error && error.code ? error.code : 'ROUTING_RECEIPT_REPLAY_FAILED');
}
try { validateTaskExecutionLineage(report, dag); } catch { reject('TASK_EXECUTION_LINEAGE_INVALID'); }
let finalState;
try {
  const {validateRunControlHistory} = require('./validate-run-control.js');
  finalState = validateRunControlHistory(ledger.records, workspaceRealPath, report.run_id, 'partial').finalState;
} catch { reject('RUN_CONTROL_REPLAY_FAILED'); }
if (finalState.spec?.id !== spec.spec_id || finalState.spec?.sha256 !== specSha256
  || canonicalJson([...finalState.acceptance_criteria].sort()) !== canonicalJson([...dag.coverage.keys()].sort())
  || canonicalJson(finalState.tasks.map((task) => task.id).sort()) !== canonicalJson(dagTaskIds)) {
  reject('RUN_CONTROL_ARTIFACT_BINDING_DRIFT');
}
for (const taskState of finalState.tasks) {
  const task = dag.tasks.get(taskState.id);
  if (!task || canonicalJson([...taskState.acceptance_criterion_ids].sort())
    !== canonicalJson([...task.acceptanceCriterionIds].sort())) reject('RUN_CONTROL_TASK_BINDING_DRIFT');
  const reportVerified = report.task_results.some((result) => result.task_id === taskState.id && result.status === 'verified');
  if ((taskState.status === 'verified') !== reportVerified) reject('RUN_CONTROL_TASK_STATUS_DRIFT');
}
const reportEvidence = [];
for (const result of report.task_results.filter((candidate) => candidate.status === 'verified')) {
  for (const evidence of result.acceptance_evidence) {
    const check = report.verification[evidence.verification_index];
    if (!check || check.outcome !== 'pass' || check.exit_code !== 0 || evidence.outcome !== 'pass') {
      reject('PARTIAL_ACCEPTANCE_EVIDENCE_INVALID');
    }
    const digest = crypto.createHash('sha256')
      .update(canonicalJson({argv:check.argv, stdin_sha256:check.stdin_sha256})).digest('hex');
    if (evidence.observed_ref !== `command-sha256:${digest}`
      || !ledger.records.some((record) => record.phase === 'verify'
        && record.event_type === 'command_finished' && record.status === 'passed'
        && record.source_ref === `${evidence.observed_ref}:exit:0`)) {
      reject('PARTIAL_ACCEPTANCE_EVIDENCE_UNOBSERVED');
    }
    reportEvidence.push(canonicalJson({
      acceptance_criterion_id:evidence.acceptance_criterion_id,
      observed_ref:evidence.observed_ref,
      outcome:evidence.outcome,
      task_id:result.task_id,
    }));
  }
}
const stateEvidence = finalState.acceptance_evidence.filter((evidence) => evidence.verification_outcome === 'pass')
  .map((evidence) => canonicalJson({
    acceptance_criterion_id:evidence.acceptance_criterion_id,
    observed_ref:evidence.observed_ref,
    outcome:evidence.verification_outcome,
    task_id:evidence.task_id,
  }));
if (canonicalJson(stateEvidence.sort()) !== canonicalJson(reportEvidence.sort())) {
  reject('PARTIAL_RUN_CONTROL_EVIDENCE_DRIFT');
}
for (const evidence of finalState.acceptance_evidence.filter((candidate) => candidate.verification_outcome === 'failed')) {
  const observed = evidence.observed_ref.startsWith('command-sha256:')
    && ledger.records.some((record) => record.event_type === 'command_finished'
      && ['failed', 'timeout'].includes(record.status)
      && record.source_ref.startsWith(`${evidence.observed_ref}:`));
  if (!observed) reject('PARTIAL_FAILED_EVIDENCE_UNOBSERVED');
}

process.stdout.write(JSON.stringify({
  outcome: 'pass',
  resume_from: continuation.resume_from,
  completed_task_ids: continuation.completed_task_ids,
  pending_task_ids: continuation.pending_task_ids,
  remaining_acceptance_criterion_ids: continuation.remaining_acceptance_criterion_ids,
  ledger_head_sha256: ledger.headSha256,
  ledger_record_count: ledger.records.length,
}) + '\n');
