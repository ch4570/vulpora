#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {canonicalJson, parseLedger, validateLedgerFile} = require('./validate-execution-ledger.js');

const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PHASES = new Set(['clarify', 'approve', 'split', 'execute', 'integrate', 'verify', 'terminal']);
const TERMINAL_STATUSES = new Set(['complete', 'partial', 'failed', 'cancelled', 'escalated']);
const QUESTION_REASONS = new Set(['clarity_gap', 'destructive', 'external_effect', 'credential', 'authority', 'material_scope']);
const TRANSITIONS = new Map([
  ['clarify', new Set(['clarify', 'approve', 'terminal'])],
  ['approve', new Set(['split', 'terminal'])],
  ['split', new Set(['execute', 'terminal'])],
  ['execute', new Set(['execute', 'integrate', 'terminal'])],
  ['integrate', new Set(['verify', 'terminal'])],
  ['verify', new Set(['verify', 'terminal'])],
  ['terminal', new Set()],
]);
const TASK_STATUS_TRANSITIONS = new Map([
  ['not_run', new Set(['not_run', 'candidate', 'verified', 'failed', 'cancelled', 'blocked'])],
  ['candidate', new Set(['candidate', 'verified', 'failed', 'cancelled', 'blocked'])],
  ['failed', new Set(['failed', 'candidate', 'verified', 'cancelled', 'blocked'])],
  ['verified', new Set(['verified'])],
  ['cancelled', new Set(['cancelled'])],
  ['blocked', new Set(['blocked'])],
]);

function reject(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function exactObject(value, fields, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(code);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) reject(code);
}

function uniqueStrings(value, code) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !ID.test(item))) reject(code);
  if (new Set(value).size !== value.length) reject(code);
  return value;
}

function validateSpec(spec, code) {
  exactObject(spec, ['id', 'revision', 'sha256'], code);
  if (!ID.test(spec.id || '') || !Number.isSafeInteger(spec.revision) || spec.revision < 1 || !SHA256.test(spec.sha256 || '')) {
    reject(code);
  }
}

function sameValue(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function sameRecordedNodeInvocation(recordedArgv, runtimeArgv) {
  if (!Array.isArray(recordedArgv) || recordedArgv.length !== runtimeArgv.length
    || !/(?:^|\/)node(?:\.exe)?$/.test(recordedArgv[0] || '')
    || path.basename(recordedArgv[0] || '') !== path.basename(runtimeArgv[0] || '')) return false;
  let recordedScript;
  let runtimeScript;
  try {
    recordedScript = fs.realpathSync.native(path.resolve(process.cwd(), recordedArgv[1] || ''));
    runtimeScript = fs.realpathSync.native(runtimeArgv[1] || '');
  } catch {
    return false;
  }
  return recordedScript === runtimeScript && sameValue(recordedArgv.slice(2), runtimeArgv.slice(2));
}

function readState(statePath, code) {
  let stat;
  let bytes;
  try {
    stat = fs.lstatSync(statePath);
    bytes = fs.readFileSync(statePath);
  } catch {
    reject(code);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) reject(code);
  let state;
  try { state = JSON.parse(bytes.toString('utf8')); } catch { reject(code); }
  if (Buffer.from(canonicalJson(state), 'utf8').compare(bytes) !== 0) reject(`${code}_NON_CANONICAL`);
  return {state, bytes};
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stateReference(statePath, runId, bytes, workspaceRoot = process.cwd()) {
  let workspace;
  let realStatePath;
  try {
    workspace = fs.realpathSync.native(workspaceRoot);
    realStatePath = fs.realpathSync.native(statePath);
  } catch {
    reject('RUN_CONTROL_STATE_PATH_INVALID');
  }
  const relative = path.relative(workspace, realStatePath).split(path.sep).join('/');
  const match = relative.match(new RegExp(`^\\.vulpora/tasks/${escapeRegex(runId)}/run-control-(\\d{4})\\.json$`));
  if (!match) reject('RUN_CONTROL_STATE_PATH_INVALID');
  return {
    index: Number(match[1]),
    path: relative,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

function validateState(state) {
  exactObject(state, [
    'schema', 'run_id', 'current_phase', 'next_phase', 'spec', 'next_spec', 'question', 'tasks',
    'acceptance_criteria', 'acceptance_evidence', 'terminal_status', 'successor',
  ], 'INVALID_STATE_FIELDS');
  if (state.schema !== 'vulpora.start-task-run-control/v1') reject('INVALID_STATE_SCHEMA');
  if (!ID.test(state.run_id || '')) reject('INVALID_RUN_ID');
  if (!PHASES.has(state.current_phase) || !PHASES.has(state.next_phase)) reject('INVALID_PHASE');
  if (!TRANSITIONS.get(state.current_phase).has(state.next_phase)) reject('PHASE_TRANSITION_FORBIDDEN');

  const noSpecYet = state.spec === null && state.next_spec === null;
  if ((state.spec === null) !== (state.next_spec === null)) reject('PARTIAL_SPEC_STATE');
  if (noSpecYet) {
    if (state.current_phase !== 'clarify' || !['clarify', 'terminal'].includes(state.next_phase)) {
      reject('SPEC_REQUIRED_FOR_PHASE');
    }
  } else {
    validateSpec(state.spec, 'INVALID_SPEC');
    validateSpec(state.next_spec, 'INVALID_NEXT_SPEC');
    if (!sameValue(state.spec, state.next_spec)) reject('FROZEN_SPEC_DRIFT');
  }

  exactObject(state.question, ['requested', 'reason', 'blocker_signature', 'asked_signatures'], 'INVALID_QUESTION_FIELDS');
  if (typeof state.question.requested !== 'boolean') reject('INVALID_QUESTION_REQUEST');
  uniqueStrings(state.question.asked_signatures, 'INVALID_ASKED_SIGNATURES');
  if (state.question.requested) {
    if (state.current_phase !== 'clarify' || state.next_phase !== 'clarify') reject('QUESTION_HARD_WAIT_REQUIRED');
    if (!QUESTION_REASONS.has(state.question.reason)) reject('QUESTION_REASON_NOT_MATERIAL');
    if (typeof state.question.blocker_signature !== 'string' || !ID.test(state.question.blocker_signature)) reject('INVALID_BLOCKER_SIGNATURE');
    if (state.question.asked_signatures.includes(state.question.blocker_signature)) reject('REPEATED_QUESTION_FORBIDDEN');
  } else if (state.question.reason !== null || state.question.blocker_signature !== null) {
    reject('QUESTION_METADATA_WITHOUT_REQUEST');
  }

  const acceptanceCriteria = uniqueStrings(state.acceptance_criteria, 'INVALID_ACCEPTANCE_CRITERIA');
  if (!Array.isArray(state.tasks) || !Array.isArray(state.acceptance_evidence)) reject('INVALID_EXECUTION_COLLECTIONS');
  const tasks = new Map();
  for (const task of state.tasks) {
    exactObject(task, ['id', 'status', 'acceptance_criterion_ids'], 'INVALID_TASK_FIELDS');
    if (!ID.test(task.id || '') || tasks.has(task.id)) reject('INVALID_TASK_ID');
    if (!TASK_STATUS_TRANSITIONS.has(task.status)) reject('INVALID_TASK_STATUS');
    const criterionIds = uniqueStrings(task.acceptance_criterion_ids, 'INVALID_TASK_ACCEPTANCE_CRITERIA');
    if (criterionIds.some((criterionId) => !acceptanceCriteria.includes(criterionId))) reject('TASK_ACCEPTANCE_CRITERION_UNKNOWN');
    tasks.set(task.id, task);
  }

  const evidenceKeys = new Set();
  for (const evidence of state.acceptance_evidence) {
    exactObject(evidence, ['acceptance_criterion_id', 'task_id', 'verification_outcome', 'observed_ref'], 'INVALID_ACCEPTANCE_EVIDENCE_FIELDS');
    const task = tasks.get(evidence.task_id);
    if (!task || !acceptanceCriteria.includes(evidence.acceptance_criterion_id)
      || !task.acceptance_criterion_ids.includes(evidence.acceptance_criterion_id)) reject('ACCEPTANCE_EVIDENCE_UNBOUND');
    if (!['pass', 'failed'].includes(evidence.verification_outcome)) reject('INVALID_ACCEPTANCE_EVIDENCE_OUTCOME');
    if (typeof evidence.observed_ref !== 'string'
      || !/^(command|file)-sha256:[a-f0-9]{64}(?::[^\r\n]+)?$/.test(evidence.observed_ref)) reject('INVALID_ACCEPTANCE_EVIDENCE_REF');
    const key = canonicalJson(evidence);
    if (evidenceKeys.has(key)) reject('DUPLICATE_ACCEPTANCE_EVIDENCE');
    evidenceKeys.add(key);
  }
  if (['clarify', 'approve'].includes(state.current_phase)
    && (tasks.size > 0 || acceptanceCriteria.length > 0 || state.acceptance_evidence.length > 0)) {
    reject('EXECUTION_STATE_BEFORE_SPLIT');
  }
  if (['execute', 'integrate', 'verify'].includes(state.current_phase)
    && (tasks.size === 0 || acceptanceCriteria.length === 0)) reject('EXECUTION_INVENTORY_MISSING');

  if (state.next_phase === 'terminal') {
    if (!TERMINAL_STATUSES.has(state.terminal_status)) reject('TERMINAL_STATUS_REQUIRED');
  } else if (state.terminal_status !== null) {
    reject('EARLY_TERMINAL_STATUS');
  }
  if (state.terminal_status === 'complete') {
    if (state.current_phase !== 'verify') reject('COMPLETE_FROM_WRONG_PHASE');
    if (tasks.size === 0 || acceptanceCriteria.length === 0) reject('COMPLETE_WITH_EMPTY_PLAN');
    if ([...tasks.values()].some((task) => task.status !== 'verified')) reject('COMPLETE_WITH_UNVERIFIED_TASK');
    for (const criterionId of acceptanceCriteria) {
      const passed = state.acceptance_evidence.some((evidence) => evidence.acceptance_criterion_id === criterionId
        && evidence.verification_outcome === 'pass' && tasks.get(evidence.task_id)?.status === 'verified');
      if (!passed) reject('COMPLETE_AC_EVIDENCE_MISSING');
    }
  }
  if (state.terminal_status === 'partial' && !['execute', 'integrate', 'verify'].includes(state.current_phase)) {
    reject('PARTIAL_WITHOUT_EXECUTED_SUBSET');
  }
  if (state.successor !== null) {
    exactObject(state.successor, ['reason', 'revision', 'supersedes_sha256'], 'INVALID_SUCCESSOR');
    if (state.successor.reason !== 'normative_change' || state.next_phase !== 'terminal'
      || state.terminal_status !== 'cancelled' || !['execute', 'integrate', 'verify'].includes(state.current_phase)
      || state.spec === null || state.successor.revision !== state.spec.revision + 1
      || state.successor.supersedes_sha256 !== state.spec.sha256) reject('INVALID_SUCCESSOR');
  }
  return {evidenceKeys};
}

function validateProgress(previous, next, previousValidated) {
  if (previous.run_id !== next.run_id) reject('RUN_ID_DRIFT');
  if (previous.next_phase !== next.current_phase) reject('CONTROL_PHASE_DISCONTINUITY');
  const answeredQuestionWithFirstSpec = previous.next_spec === null && next.spec !== null
    && previous.current_phase === 'clarify' && previous.next_phase === 'clarify'
    && previous.question.requested && next.current_phase === 'clarify' && next.next_phase === 'approve'
    && !next.question.requested;
  if (!answeredQuestionWithFirstSpec && !sameValue(previous.next_spec, next.spec)) reject('FROZEN_SPEC_DRIFT');

  const asked = [...previous.question.asked_signatures];
  if (previous.question.requested) asked.push(previous.question.blocker_signature);
  if (!sameValue(asked, next.question.asked_signatures)) reject('QUESTION_HISTORY_RESET');

  if (previous.acceptance_criteria.length > 0 && !sameValue(previous.acceptance_criteria, next.acceptance_criteria)) {
    reject('ACCEPTANCE_INVENTORY_DRIFT');
  }
  if (previous.tasks.length > 0) {
    if (previous.tasks.length !== next.tasks.length) reject('TASK_INVENTORY_DRIFT');
    for (const previousTask of previous.tasks) {
      const nextTask = next.tasks.find((task) => task.id === previousTask.id);
      if (!nextTask || !sameValue(previousTask.acceptance_criterion_ids, nextTask.acceptance_criterion_ids)) reject('TASK_INVENTORY_DRIFT');
      if (!TASK_STATUS_TRANSITIONS.get(previousTask.status).has(nextTask.status)) reject('TASK_STATUS_REGRESSION');
    }
  } else if (next.tasks.length > 0 && next.current_phase !== 'split') {
    reject('TASK_INVENTORY_INTRODUCED_OUTSIDE_SPLIT');
  }
  for (const evidenceKey of previousValidated.evidenceKeys) {
    if (!next.acceptance_evidence.some((evidence) => canonicalJson(evidence) === evidenceKey)) reject('ACCEPTANCE_EVIDENCE_REMOVED');
  }
}

function validateRunControlHistory(records, workspaceRoot, runId, expectedTerminalStatus = null) {
  let rootRealPath;
  try {
    const stat = fs.lstatSync(workspaceRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink()) reject('RUN_CONTROL_WORKSPACE_INVALID');
    rootRealPath = fs.realpathSync.native(workspaceRoot);
  } catch (error) {
    if (error?.code === 'RUN_CONTROL_WORKSPACE_INVALID') throw error;
    reject('RUN_CONTROL_WORKSPACE_INVALID');
  }
  const frozenStates = records.filter((record) => record.event_type === 'run_control_state_frozen');
  if (expectedTerminalStatus === 'complete' && frozenStates.length < 6) reject('COMPLETE_RUN_CONTROL_HISTORY_MISSING');

  let previous = null;
  let previousValidated = null;
  let finalState = null;
  frozenStates.forEach((record, index) => {
    const statePattern = new RegExp(`^file-sha256:([a-f0-9]{64}):(\\.vulpora/tasks/${escapeRegex(runId)}/run-control-(\\d{4})\\.json)$`);
    const match = record.source_ref.match(statePattern);
    if (!match || record.phase === 'terminal' || record.source_type !== 'filesystem_digest'
      || record.status !== 'passed' || Number(match[3]) !== index + 1) reject('RUN_CONTROL_LEDGER_SEQUENCE_INVALID');
    const absolute = path.resolve(rootRealPath, match[2]);
    const relative = path.relative(rootRealPath, absolute);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) reject('RUN_CONTROL_STATE_PATH_INVALID');
    const currentFile = readState(absolute, 'RUN_CONTROL_STATE_UNREADABLE');
    const reference = stateReference(absolute, runId, currentFile.bytes, rootRealPath);
    if (reference.index !== index + 1 || reference.sha256 !== match[1]
      || currentFile.state.run_id !== runId || currentFile.state.current_phase !== record.phase) {
      reject('RUN_CONTROL_STATE_LEDGER_DRIFT');
    }
    const currentValidated = validateState(currentFile.state);
    if (previous === null) {
      if (currentFile.state.current_phase !== 'clarify'
        || currentFile.state.question.asked_signatures.length !== 0) reject('INVALID_CONTROL_GENESIS');
    } else {
      validateProgress(previous, currentFile.state, previousValidated);
    }
    previous = currentFile.state;
    previousValidated = currentValidated;
    finalState = currentFile.state;
  });

  if (expectedTerminalStatus !== null
    && (!finalState || finalState.next_phase !== 'terminal'
      || finalState.terminal_status !== expectedTerminalStatus)) reject('RUN_CONTROL_TERMINAL_STATE_MISMATCH');
  return {frozenStates, finalState};
}

function main() {
  if (process.argv.length !== 7) reject('USAGE_PREVIOUS_NEXT_LEDGER_HEAD_COUNT');
  const [, , previousPath, nextPath, ledgerPath, expectedHead, expectedCountText] = process.argv;
  if (!SHA256.test(expectedHead || '') || !/^[1-9]\d*$/.test(expectedCountText || '')) reject('INVALID_LEDGER_ANCHOR');

  const nextFile = readState(nextPath, 'NEXT_STATE_UNREADABLE');
  validateState(nextFile.state);
  const nextReference = stateReference(nextPath, nextFile.state.run_id, nextFile.bytes);
  let ledger;
  try {
    ledger = validateLedgerFile(ledgerPath, nextFile.state.run_id, {requireCompleteCommands:false});
  } catch { reject('LEDGER_REPLAY_FAILED'); }
  const expectedCount = Number(expectedCountText);
  let anchoredRecords = ledger.records;
  if (ledger.headSha256 !== expectedHead || ledger.records.length !== expectedCount) {
    const selfCommandSha256 = process.env.VULPORA_COMMAND_SHA256;
    let selfCommandArgv;
    try { selfCommandArgv = JSON.parse(process.env.VULPORA_COMMAND_ARGV_JSON || 'null'); } catch { reject('LEDGER_ANCHOR_MISMATCH'); }
    const argvMatches = sameRecordedNodeInvocation(selfCommandArgv, process.argv);
    const commandDigestMatches = argvMatches
      && crypto.createHash('sha256').update(canonicalJson({argv:selfCommandArgv, stdin_sha256:null})).digest('hex') === selfCommandSha256;
    const last = ledger.records.at(-1);
    if (!SHA256.test(selfCommandSha256 || '') || !commandDigestMatches || ledger.records.length !== expectedCount + 1
      || last?.previous_sha256 !== expectedHead || last?.event_type !== 'command_started'
      || last?.status !== 'started' || last?.source_type !== 'runtime_result'
      || last?.phase !== nextFile.state.current_phase
      || last?.source_ref !== `command-sha256:${selfCommandSha256}:started`) reject('LEDGER_ANCHOR_MISMATCH');
    anchoredRecords = ledger.records.slice(0, -1);
  }
  try {
    parseLedger(`${anchoredRecords.map((record) => canonicalJson(record)).join('\n')}\n`, {requireCompleteCommands:true});
  } catch { reject('LEDGER_REPLAY_FAILED'); }

  const frozenStates = anchoredRecords.filter((record) => record.event_type === 'run_control_state_frozen');
  frozenStates.forEach((record, index) => {
    const statePattern = new RegExp(`^file-sha256:([a-f0-9]{64}):(\\.vulpora/tasks/${escapeRegex(nextFile.state.run_id)}/run-control-(\\d{4})\\.json)$`);
    const match = record.source_ref.match(statePattern);
    if (!match || record.phase === 'terminal' || record.source_type !== 'filesystem_digest'
      || record.status !== 'passed' || Number(match[3]) !== index + 1) reject('RUN_CONTROL_LEDGER_SEQUENCE_INVALID');
  });

  if (previousPath === '-') {
    if (frozenStates.length !== 0 || nextReference.index !== 1 || nextFile.state.current_phase !== 'clarify'
      || nextFile.state.question.asked_signatures.length !== 0) reject('INVALID_CONTROL_GENESIS');
  } else {
    const previousFile = readState(previousPath, 'PREVIOUS_STATE_UNREADABLE');
    const previousValidated = validateState(previousFile.state);
    const previousReference = stateReference(previousPath, previousFile.state.run_id, previousFile.bytes);
    const latest = frozenStates.at(-1);
    const expectedRef = `file-sha256:${previousReference.sha256}:${previousReference.path}`;
    if (!latest || latest.source_ref !== expectedRef || previousReference.index !== frozenStates.length
      || nextReference.index !== previousReference.index + 1) reject('PREVIOUS_STATE_NOT_LEDGER_BOUND');
    validateProgress(previousFile.state, nextFile.state, previousValidated);
  }
  if (frozenStates.some((record) => record.source_ref.endsWith(`:${nextReference.path}`))) reject('NEXT_STATE_ALREADY_FROZEN');

  process.stdout.write(`${JSON.stringify({
    outcome: 'pass',
    run_id: nextFile.state.run_id,
    transition: `${nextFile.state.current_phase}->${nextFile.state.next_phase}`,
    next_state_ref: `file-sha256:${nextReference.sha256}:${nextReference.path}`,
    next_state_index: nextReference.index,
  })}\n`);
}

module.exports = {
  readState,
  stateReference,
  validateProgress,
  validateRunControlHistory,
  validateState,
};

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error?.code || error?.message || 'RUN_CONTROL_VALIDATION_FAILED'}\n`);
    process.exit(1);
  }
}
