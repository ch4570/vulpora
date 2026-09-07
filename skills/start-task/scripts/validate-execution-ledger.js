#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const pathModule = require('node:path');
const {parseTaskDag} = require('./validate-task-dag.js');

const INPUT_FIELDS = [
  'event_type',
  'message',
  'phase',
  'run_id',
  'source_ref',
  'source_type',
  'status',
];
const RECORD_FIELDS = [
  'event_sha256',
  'event_type',
  'message',
  'phase',
  'previous_sha256',
  'recorded_at',
  'run_id',
  'sequence',
  'source_ref',
  'source_type',
  'status',
];
const SHA256 = /^[a-f0-9]{64}$/;
const ZERO_SHA256 = '0'.repeat(64);
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TOKEN = /^[a-z][a-z0-9_:-]{0,63}$/;
const UTC_ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PHASES = new Set(['clarify', 'approve', 'split', 'execute', 'integrate', 'verify', 'terminal']);
const STATUSES = new Set(['started', 'passed', 'failed', 'blocked', 'cancelled', 'reported', 'timeout']);
const SOURCE_TYPES = new Set([
  'runtime_result',
  'filesystem_digest',
  'user_decision',
  'agent_claim',
]);
const PHASE_ORDER = ['clarify', 'approve', 'split', 'execute', 'integrate', 'verify', 'terminal'];

function fail(code, detail) {
  const suffix = detail === undefined ? '' : `:${String(detail).replace(/[\r\n]/g, ' ')}`;
  const error = new Error(`${code}${suffix}`);
  error.code = code;
  throw error;
}

function validateClarificationFallbackEvents(records) {
  const starts = records.filter((record) => record.event_type === 'clarification_fallback_started');
  const finishes = records.filter((record) => record.event_type === 'clarification_fallback_finished');
  if (starts.length === 0 && finishes.length === 0) return null;
  if (starts.length !== 1 || finishes.length !== 1) fail('INVALID_CLARIFICATION_FALLBACK_COUNT');
  const [started] = starts;
  const [finished] = finishes;
  if (started.phase !== 'clarify' || finished.phase !== 'clarify'
    || started.status !== 'reported' || finished.status !== 'reported'
    || started.source_type !== 'agent_claim' || finished.source_type !== 'agent_claim'
    || started.source_ref !== finished.source_ref
    || !/^fallback:requirement-dialogue:(unavailable|no_progress_at_yield|host_disconnect|terminal_timeout|invalid_result)$/.test(started.source_ref || '')
    || started.sequence >= finished.sequence) fail('INVALID_CLARIFICATION_FALLBACK_PAIR');
  const projectionFreeze = records.find((record) => record.event_type === 'clarity_projection_frozen');
  if (projectionFreeze && finished.sequence >= projectionFreeze.sequence) {
    fail('CLARIFICATION_FALLBACK_AFTER_PROJECTION_FREEZE');
  }
  return {started, finished, reason: started.source_ref.split(':').at(-1)};
}

const CLARIFICATION_ROUND_EVENT_TYPES = new Set([
  'clarification_round_started',
  'clarification_heartbeat',
  'clarification_host_yielded',
  'clarification_round_finished',
  'clarification_round_stalled',
]);

function validateClarificationRounds(records, sessionRef, expectedTerminalStatuses) {
  const prefix = `${sessionRef}:round:`;
  const events = records.filter((record) => CLARIFICATION_ROUND_EVENT_TYPES.has(record.event_type)
    && typeof record.source_ref === 'string' && record.source_ref.startsWith(prefix));
  if (events.length === 0) fail('CLARIFICATION_ROUND_EVIDENCE_MISSING', sessionRef);
  let current = null;
  let nextRound = 0;
  let previousStatus = null;
  let firstSequence = null;
  let lastSequence = null;
  const rounds = [];
  for (const event of events) {
    if (event.phase !== 'clarify' || event.status !== 'reported' || event.source_type !== 'agent_claim') {
      fail('INVALID_CLARIFICATION_ROUND_EVENT', event.sequence);
    }
    const suffix = event.source_ref.slice(prefix.length);
    let match;
    if (event.event_type === 'clarification_round_started') {
      match = suffix.match(/^(\d+):input-sha256:([a-f0-9]{64})$/);
      if (!match || current || Number(match[1]) !== nextRound
        || (previousStatus !== null && previousStatus !== 'needs_input')) {
        fail('INVALID_CLARIFICATION_ROUND_START', event.sequence);
      }
      current = {
        round: nextRound,
        inputSha256: match[2],
        progressSinceYield: false,
        awaitingStall: false,
        nextYield: 1,
        startedSequence: event.sequence,
      };
      if (firstSequence === null) firstSequence = event.sequence;
      continue;
    }
    if (!current) fail('CLARIFICATION_ROUND_EVENT_WITHOUT_START', event.sequence);
    const roundPrefix = `${current.round}:`;
    if (!suffix.startsWith(roundPrefix)) fail('CLARIFICATION_ROUND_ID_DRIFT', event.sequence);
    const detail = suffix.slice(roundPrefix.length);
    if (event.event_type === 'clarification_heartbeat') {
      if (!/^heartbeat-sha256:[a-f0-9]{64}$/.test(detail) || current.awaitingStall) {
        fail('INVALID_CLARIFICATION_HEARTBEAT', event.sequence);
      }
      current.progressSinceYield = true;
      continue;
    }
    if (event.event_type === 'clarification_host_yielded') {
      match = detail.match(/^yield:(\d+)$/);
      if (!match || Number(match[1]) !== current.nextYield || current.awaitingStall) {
        fail('INVALID_CLARIFICATION_HOST_YIELD', event.sequence);
      }
      current.nextYield += 1;
      current.awaitingStall = !current.progressSinceYield;
      current.progressSinceYield = false;
      continue;
    }
    if (event.event_type === 'clarification_round_stalled') {
      match = detail.match(/^stalled:(no_progress_at_yield|host_disconnect|terminal_timeout)$/);
      if (!match || (match[1] === 'no_progress_at_yield' && !current.awaitingStall)) {
        fail('INVALID_CLARIFICATION_STALL', event.sequence);
      }
      rounds.push({round: current.round, status: 'stalled', reason: match[1]});
      previousStatus = 'stalled';
      current = null;
      nextRound += 1;
      lastSequence = event.sequence;
      continue;
    }
    if (event.event_type === 'clarification_round_finished') {
      match = detail.match(/^output-sha256:([a-f0-9]{64}):score:(\d{1,3}):status:(needs_input|ready|escalated|invalid_result)$/);
      if (!match || current.awaitingStall || Number(match[2]) > 100) {
        fail('INVALID_CLARIFICATION_ROUND_FINISH', event.sequence);
      }
      rounds.push({round: current.round, status: match[3], score: Number(match[2]), outputSha256: match[1]});
      previousStatus = match[3];
      current = null;
      nextRound += 1;
      lastSequence = event.sequence;
      continue;
    }
    fail('UNKNOWN_CLARIFICATION_ROUND_EVENT', event.sequence);
  }
  if (current) fail('CLARIFICATION_ROUND_WITHOUT_TERMINAL_EVENT', current.round);
  if (!expectedTerminalStatuses.includes(previousStatus)) {
    fail('CLARIFICATION_ROUND_TERMINAL_STATUS_MISMATCH', previousStatus);
  }
  return {firstSequence, lastSequence, rounds, terminalStatus: previousStatus};
}

function rejectOrphanClarificationRounds(records, sessionRefs) {
  const prefixes = sessionRefs.map((sessionRef) => `${sessionRef}:round:`);
  const orphan = records.find((record) => CLARIFICATION_ROUND_EVENT_TYPES.has(record.event_type)
    && !prefixes.some((prefix) => record.source_ref?.startsWith(prefix)));
  if (orphan) fail('ORPHAN_CLARIFICATION_ROUND_EVENT', orphan.sequence);
}

function validateClarificationPath(records, report) {
  if (!report || !Array.isArray(report.children)) fail('COMPLETE_CHILD_REPORT_INVALID');
  const requirementChildren = report.children.filter((child) => child?.agent_id === 'requirement-dialogue');
  const splitterChildren = report.children.filter((child) => child?.agent_id === 'task-splitter');
  if (requirementChildren.length > 1) fail('COMPLETE_DUPLICATE_CLARIFICATION_CHILD');
  if (splitterChildren.length !== 1) fail('COMPLETE_REQUIRED_CHILD_MISSING', 'task-splitter');
  const fallback = validateClarificationFallbackEvents(records);
  const requirementChild = requirementChildren[0];
  if (!requirementChild) {
    if (!fallback) fail('COMPLETE_CLARIFICATION_PATH_MISSING');
    const fallbackRounds = validateClarificationRounds(records, fallback.started.source_ref, ['ready']);
    if (!(fallback.started.sequence < fallbackRounds.firstSequence
      && fallbackRounds.lastSequence < fallback.finished.sequence)) {
      fail('CLARIFICATION_FALLBACK_ROUND_ORDER_INVALID');
    }
    rejectOrphanClarificationRounds(records, [fallback.started.source_ref]);
    return {mode: 'leader-inline-fallback', reason: fallback.reason, rounds: fallbackRounds.rounds};
  }
  if (typeof requirementChild.native_child_id !== 'string' || requirementChild.native_child_id.length === 0) {
    fail('COMPLETE_REQUIRED_CHILD_MISSING', 'requirement-dialogue');
  }
  const sourceRef = `child:requirement-dialogue:${requirementChild.native_child_id}`;
  const dispatched = records.find((record) => record.event_type === 'child_dispatched' && record.source_ref === sourceRef);
  const finished = records.find((record) => record.event_type === 'child_finished' && record.source_ref === sourceRef);
  if (!dispatched || !finished || dispatched.sequence >= finished.sequence
    || dispatched.phase !== 'clarify' || finished.phase !== 'clarify'
    || dispatched.status !== 'reported' || finished.status !== 'reported'
    || dispatched.source_type !== 'agent_claim' || finished.source_type !== 'agent_claim') {
    fail('COMPLETE_CHILD_LEDGER_MISMATCH', 'requirement-dialogue');
  }
  if (requirementChild.outcome === 'pass') {
    if (fallback) fail('CLARIFICATION_FALLBACK_AFTER_SUCCESSFUL_CHILD');
    const nativeRounds = validateClarificationRounds(records, sourceRef, ['ready']);
    if (!(dispatched.sequence < nativeRounds.firstSequence && nativeRounds.lastSequence < finished.sequence)) {
      fail('CLARIFICATION_NATIVE_ROUND_ORDER_INVALID');
    }
    rejectOrphanClarificationRounds(records, [sourceRef]);
    return {mode: 'native-child', reason: null, rounds: nativeRounds.rounds};
  }
  if (!fallback || fallback.started.sequence <= finished.sequence) {
    fail('COMPLETE_FAILED_CHILD_WITHOUT_FALLBACK');
  }
  const nativeRounds = validateClarificationRounds(records, sourceRef, ['stalled', 'invalid_result', 'escalated']);
  const fallbackRounds = validateClarificationRounds(records, fallback.started.source_ref, ['ready']);
  if (!(dispatched.sequence < nativeRounds.firstSequence && nativeRounds.lastSequence < finished.sequence
    && fallback.started.sequence < fallbackRounds.firstSequence
    && fallbackRounds.lastSequence < fallback.finished.sequence)) {
    fail('CLARIFICATION_FALLBACK_ROUND_ORDER_INVALID');
  }
  rejectOrphanClarificationRounds(records, [sourceRef, fallback.started.source_ref]);
  return {mode: 'leader-inline-fallback', reason: fallback.reason, rounds: fallbackRounds.rounds};
}

function reject(error) {
  process.stderr.write(`${error && error.message ? error.message : 'LEDGER_VALIDATION_FAILED'}\n`);
  process.exit(1);
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('NON_CANONICAL_NUMBER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail('NON_CANONICAL_OBJECT');
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`;
  }
  fail('NON_JSON_VALUE');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function requireExactFields(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    fail(code);
  }
}

function requireString(value, field, maxLength, options = {}) {
  if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0) {
    fail('INVALID_STRING', field);
  }
  if (Buffer.byteLength(value, 'utf8') > maxLength) fail('STRING_TOO_LARGE', field);
  if (options.token && !TOKEN.test(value)) fail('INVALID_TOKEN', field);
  if (options.noControl && /[\u0000-\u001f\u007f\u2028\u2029]/.test(value)) {
    fail('CONTROL_CHARACTER', field);
  }
}

function validateEventFields(event, expectedFields = INPUT_FIELDS, options = {}) {
  requireExactFields(event, expectedFields, 'INVALID_EVENT_FIELDS');
  requireString(event.run_id, 'run_id', 128);
  if (!RUN_ID.test(event.run_id)) fail('INVALID_RUN_ID');
  requireString(event.phase, 'phase', 64, {token: true});
  requireString(event.event_type, 'event_type', 64, {token: true});
  requireString(event.status, 'status', 64, {token: true});
  requireString(event.source_type, 'source_type', 64, {token: true});
  requireString(event.source_ref, 'source_ref', 1024, {noControl: true});
  requireString(event.message, 'message', 8192, {noControl: true});
  if (!PHASES.has(event.phase)) fail('INVALID_PHASE');
  if (!STATUSES.has(event.status)) fail('INVALID_STATUS');
  if (!SOURCE_TYPES.has(event.source_type)) fail('INVALID_SOURCE_TYPE');
  if (event.source_type === 'agent_claim' && event.status !== 'reported') fail('INVALID_AGENT_CLAIM_STATUS');
  if (event.source_type === 'user_decision' && event.status !== 'reported') fail('INVALID_USER_DECISION_STATUS');
  if (event.source_type === 'filesystem_digest') {
    if (event.status !== 'passed') fail('INVALID_FILESYSTEM_DIGEST_STATUS');
    if (!options.callerInput && !/^file-sha256:[a-f0-9]{64}:[^\r\n]+$/.test(event.source_ref)) {
      fail('INVALID_FILESYSTEM_DIGEST_REF');
    }
  }
  if (event.source_type === 'runtime_result') {
    if (event.event_type === 'clarity_gate_validated') {
      if (event.status !== 'passed'
        || !/^clarity-command-sha256:[a-f0-9]{64}:projection-sha256:[a-f0-9]{64}$/.test(event.source_ref)) {
        fail('INVALID_CLARITY_RUNTIME_RESULT');
      }
    } else {
      if (!['command_started', 'command_finished'].includes(event.event_type)) fail('INVALID_RUNTIME_RESULT_EVENT');
      if (!/^command-sha256:[a-f0-9]{64}:(started|exit:-?\d+|timeout|signal:[A-Za-z0-9]+)$/.test(event.source_ref)) {
        fail('INVALID_RUNTIME_RESULT_REF');
      }
    }
  }
}

function parseLedger(text, options = {}) {
  if (typeof text !== 'string' || text.length === 0) fail('EMPTY_LEDGER');
  if (!text.endsWith('\n')) fail('TRUNCATED_LEDGER');

  const lines = text.slice(0, -1).split('\n');
  if (lines.some((line) => line.length === 0)) fail('EMPTY_LEDGER_RECORD');

  const records = [];
  let runId = null;
  let previousHash = null;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    let record;
    try {
      record = JSON.parse(lines[index]);
    } catch {
      fail('MALFORMED_LEDGER_RECORD', lineNumber);
    }

    requireExactFields(record, RECORD_FIELDS, 'INVALID_LEDGER_FIELDS');
    validateEventFields(record, RECORD_FIELDS);
    if (canonicalJson(record) !== lines[index]) fail('NON_CANONICAL_LEDGER_RECORD', lineNumber);
    if (!Number.isSafeInteger(record.sequence) || record.sequence !== lineNumber) {
      fail('SEQUENCE_MISMATCH', lineNumber);
    }
    let canonicalRecordedAt = null;
    if (typeof record.recorded_at === 'string' && UTC_ISO_8601.test(record.recorded_at)) {
      const timestamp = Date.parse(record.recorded_at);
      if (Number.isFinite(timestamp)) canonicalRecordedAt = new Date(timestamp).toISOString();
    }
    if (canonicalRecordedAt !== record.recorded_at) {
      fail('INVALID_RECORDED_AT', lineNumber);
    }
    if (index === 0) {
      if (record.previous_sha256 !== ZERO_SHA256) fail('INVALID_GENESIS_LINK');
      runId = record.run_id;
    } else {
      if (record.previous_sha256 !== previousHash) fail('PREVIOUS_SHA256_MISMATCH', lineNumber);
      if (record.run_id !== runId) fail('RUN_ID_MISMATCH', lineNumber);
    }
    if (typeof record.event_sha256 !== 'string' || !SHA256.test(record.event_sha256)) {
      fail('INVALID_EVENT_SHA256', lineNumber);
    }

    const unsignedRecord = {...record};
    delete unsignedRecord.event_sha256;
    const expectedHash = sha256(canonicalJson(unsignedRecord));
    if (record.event_sha256 !== expectedHash) fail('EVENT_SHA256_MISMATCH', lineNumber);

    previousHash = record.event_sha256;
    records.push(record);
  }

  const pendingCommands = new Map();
  for (const record of records) {
    if (record.event_type === 'command_started') {
      const digest = record.source_ref.match(/^command-sha256:([a-f0-9]{64}):started$/)?.[1];
      if (!digest || record.status !== 'started' || pendingCommands.has(digest)) fail('INVALID_COMMAND_START');
      pendingCommands.set(digest, record.sequence);
    }
    if (record.event_type === 'command_finished') {
      const match = record.source_ref.match(/^command-sha256:([a-f0-9]{64}):(exit:(-?\d+)|timeout|signal:[A-Za-z0-9]+)$/);
      if (!match || !pendingCommands.has(match[1])) fail('COMMAND_FINISH_WITHOUT_START');
      if (match[2] === 'exit:0' && record.status !== 'passed') fail('COMMAND_ZERO_EXIT_NOT_PASSED');
      if (match[2] !== 'exit:0' && !['failed', 'timeout'].includes(record.status)) fail('COMMAND_FAILURE_STATUS_MISMATCH');
      pendingCommands.delete(match[1]);
    }
  }
  if (options.requireCompleteCommands && pendingCommands.size > 0) fail('COMMAND_START_WITHOUT_FINISH');

  return {
    records,
    runId,
    headSha256: previousHash,
  };
}

function validateLedgerFile(path, expectedRunId, options = {}) {
  let stat;
  try {
    stat = fs.lstatSync(path);
  } catch (error) {
    fail(error && error.code === 'ENOENT' ? 'LEDGER_NOT_FOUND' : 'LEDGER_STAT_FAILED');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('LEDGER_NOT_REGULAR_FILE');

  const noFollow = fs.constants.O_NOFOLLOW || 0;
  let fd;
  try {
    fd = fs.openSync(path, fs.constants.O_RDONLY | noFollow);
  } catch (error) {
    fail('LEDGER_OPEN_FAILED', error && error.code);
  }

  let text;
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.dev !== stat.dev || before.ino !== stat.ino) {
      fail('LEDGER_CHANGED_BEFORE_VALIDATION');
    }
    text = fs.readFileSync(fd, 'utf8');
    const afterRead = fs.fstatSync(fd);
    if (afterRead.size !== before.size || afterRead.mtimeMs !== before.mtimeMs
      || Buffer.byteLength(text, 'utf8') !== before.size) {
      fail('LEDGER_CHANGED_DURING_VALIDATION');
    }
  } finally {
    fs.closeSync(fd);
  }
  const result = parseLedger(text, {requireCompleteCommands: options.requireCompleteCommands !== false});
  if (expectedRunId !== undefined && result.runId !== expectedRunId) fail('EXPECTED_RUN_ID_MISMATCH');
  return result;
}

function validateLifecycle(records, profile) {
  let lastPhase = -1;
  for (const record of records) {
    const phaseIndex = PHASE_ORDER.indexOf(record.phase);
    if (phaseIndex < lastPhase) fail('PHASE_ORDER_REGRESSION', record.sequence);
    lastPhase = phaseIndex;
  }
  const allSpecCommits = records.filter((record) => record.event_type === 'spec_committed');
  const specCommits = allSpecCommits.filter((record) => record.phase === 'approve'
    && record.event_type === 'spec_committed'
    && record.source_type === 'user_decision'
    && record.status === 'reported'
    && /^(task-input|answer)-sha256:[a-f0-9]{64}$/.test(record.source_ref));
  const allSpecFreezes = records.filter((record) => record.event_type === 'artifact_frozen'
    && record.source_ref.endsWith('/clarified-spec.yaml'));
  const allDagFreezes = records.filter((record) => record.event_type === 'artifact_frozen'
    && record.source_ref.endsWith('/task-dag.yaml'));
  const runId = records[0]?.run_id;
  const specFreezes = allSpecFreezes.filter((record) => record.phase === 'approve'
    && record.source_type === 'filesystem_digest' && record.status === 'passed'
    && /^file-sha256:[a-f0-9]{64}:/.test(record.source_ref)
    && record.source_ref.endsWith(`:.vulpora/tasks/${runId}/clarified-spec.yaml`));
  const dagFreezes = allDagFreezes.filter((record) => record.phase === 'split'
    && record.source_type === 'filesystem_digest' && record.status === 'passed'
    && /^file-sha256:[a-f0-9]{64}:/.test(record.source_ref)
    && record.source_ref.endsWith(`:.vulpora/tasks/${runId}/task-dag.yaml`));
  if (allSpecCommits.length > 1 || allSpecFreezes.length > 1 || allDagFreezes.length > 1) fail('FROZEN_CONTRACT_REWRITTEN');
  if (allSpecFreezes.length !== specFreezes.length || allDagFreezes.length !== dagFreezes.length) {
    fail('INVALID_ARTIFACT_FREEZE_EVIDENCE');
  }
  if (allSpecCommits.length === 1 && specCommits.length !== 1) fail('INVALID_SPEC_COMMIT_EVENT');
  if (specFreezes.length === 1) {
    if (specFreezes[0].phase !== 'approve') fail('FROZEN_SPEC_REOPENED');
    const freezeSequence = specFreezes[0].sequence;
    if (records.some((record) => record.sequence > freezeSequence
      && ['spec_scope_changed', 'spec_reopened'].includes(record.event_type))) fail('FROZEN_SPEC_REOPENED');
  }
  if (dagFreezes.length === 1 && dagFreezes[0].phase !== 'split') fail('FROZEN_DAG_REOPENED');

  const questionEvents = records.filter((record) => record.event_type === 'question_requested');
  const questionRefs = new Set();
  for (const record of questionEvents) {
    if (record.phase !== 'clarify' || record.source_type !== 'agent_claim' || record.status !== 'reported'
      || !/^blocker:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.source_ref)
      || questionRefs.has(record.source_ref)) fail('INVALID_QUESTION_EVENT');
    questionRefs.add(record.source_ref);
  }

  const reachedPhases = new Set(records.map((record) => record.phase));
  if (reachedPhases.has('split') || reachedPhases.has('execute') || reachedPhases.has('integrate')
    || reachedPhases.has('verify') || reachedPhases.has('terminal')) {
    if (specCommits.length !== 1 || specFreezes.length !== 1) fail('MISSING_SPEC_COMMIT_EVIDENCE');
    const projectionFreezes = records.filter((record) => record.phase === 'approve'
      && record.event_type === 'clarity_projection_frozen' && record.source_type === 'filesystem_digest'
      && record.status === 'passed');
    const clarityValidations = records.filter((record) => record.phase === 'approve'
      && record.event_type === 'clarity_gate_validated' && record.source_type === 'runtime_result'
      && record.status === 'passed');
    if (projectionFreezes.length !== 1 || clarityValidations.length !== 1) fail('MISSING_PRE_EXECUTION_CLARITY_EVIDENCE');
    const projectionMatch = projectionFreezes[0].source_ref.match(
      /^file-sha256:([a-f0-9]{64}):(\.vulpora\/tasks\/([^/]+)\/clarity-projection\.json)$/,
    );
    const validationMatch = clarityValidations[0].source_ref.match(
      /^clarity-command-sha256:([a-f0-9]{64}):projection-sha256:([a-f0-9]{64})$/,
    );
    const clarityCommand = validationMatch && records.find((record) => record.phase === 'approve'
      && record.event_type === 'command_finished' && record.source_type === 'runtime_result'
      && record.status === 'passed' && record.source_ref === `command-sha256:${validationMatch[1]}:exit:0`);
    const firstDownstream = records.find((record) => PHASE_ORDER.indexOf(record.phase) >= PHASE_ORDER.indexOf('split'));
    if (!projectionMatch || !validationMatch || !clarityCommand || projectionMatch[1] !== validationMatch[2]
      || projectionMatch[3] !== records[0].run_id
      || !(specCommits[0].sequence < projectionFreezes[0].sequence
        && projectionFreezes[0].sequence < clarityCommand.sequence
        && clarityCommand.sequence < clarityValidations[0].sequence
        && clarityValidations[0].sequence < specFreezes[0].sequence
        && specFreezes[0].sequence < firstDownstream.sequence)) {
      fail('INVALID_PRE_EXECUTION_CLARITY_ORDER');
    }
  }
  if (reachedPhases.has('execute') || reachedPhases.has('integrate') || reachedPhases.has('verify')
    || reachedPhases.has('terminal')) {
    if (dagFreezes.length !== 1) fail('MISSING_FROZEN_DAG');
  }
  if (profile !== 'complete') return;
  if (specCommits.length !== 1) fail('MISSING_SPEC_COMMIT_EVIDENCE');
  if (specFreezes.length !== 1 || dagFreezes.length !== 1) fail('MISSING_FROZEN_ARTIFACT_EVENTS');
  const eventTypes = new Set(records.map((record) => record.event_type));
  for (const required of [
    'run_initialized', 'clarity_gate_validated', 'clarity_projection_frozen', 'artifact_frozen', 'integration_recorded',
    'verification_recorded', 'terminal_recorded', 'run_control_state_frozen',
  ]) {
    if (!eventTypes.has(required)) fail('MISSING_COMPLETE_EVENT', required);
  }
  if (records.filter((record) => record.event_type === 'artifact_frozen').length < 2) {
    fail('MISSING_FROZEN_ARTIFACT_EVENTS');
  }
  for (const phase of PHASE_ORDER) {
    const phaseRecords = records.filter((record) => record.phase === phase);
    const starts = phaseRecords.filter((record) => record.event_type === 'phase_started');
    const finishes = phaseRecords.filter((record) => record.event_type === 'phase_finished');
    if (starts.length !== 1) fail('INVALID_PHASE_START_COUNT', phase);
    if (finishes.length !== 1) fail('INVALID_PHASE_FINISH_COUNT', phase);
    if (phaseRecords[0] !== starts[0] || phaseRecords.at(-1) !== finishes[0]
      || starts[0].sequence >= finishes[0].sequence) {
      fail('INVALID_PHASE_BOUNDARY_ORDER', phase);
    }
  }

  const artifactRecords = records.filter((record) => record.event_type === 'artifact_frozen'
    && record.source_type === 'filesystem_digest'
    && record.status === 'passed');
  if (new Set(artifactRecords.map((record) => record.source_ref)).size < 2) {
    fail('MISSING_OBSERVED_FROZEN_ARTIFACTS');
  }

  const passedCommands = records.filter((record) => record.event_type === 'command_finished'
    && record.source_type === 'runtime_result'
    && record.status === 'passed'
    && /:exit:0$/.test(record.source_ref));
  if (!passedCommands.some((record) => record.phase === 'approve')) fail('MISSING_OBSERVED_CLARITY_VALIDATION');
  if (!passedCommands.some((record) => record.phase === 'verify')) fail('MISSING_OBSERVED_VERIFICATION');

  const pendingChildren = new Map();
  const completedChildren = new Set();
  for (const record of records) {
    if (record.event_type === 'child_dispatched') {
      if (pendingChildren.has(record.source_ref) || completedChildren.has(record.source_ref)) {
        fail('DUPLICATE_CHILD_DISPATCH', record.source_ref);
      }
      pendingChildren.set(record.source_ref, record.sequence);
    }
    if (record.event_type === 'child_finished') {
      const startedAt = pendingChildren.get(record.source_ref);
      if (startedAt === undefined || startedAt >= record.sequence) fail('CHILD_FINISH_WITHOUT_DISPATCH', record.source_ref);
      pendingChildren.delete(record.source_ref);
      completedChildren.add(record.source_ref);
    }
  }
  if (pendingChildren.size > 0) fail('CHILD_DISPATCH_WITHOUT_FINISH');
  const hasRequirementChild = [...completedChildren].some((ref) => ref.startsWith('child:requirement-dialogue:'));
  const hasTaskSplitterChild = [...completedChildren].some((ref) => ref.startsWith('child:task-splitter:'));
  const fallback = validateClarificationFallbackEvents(records);
  if (!hasTaskSplitterChild || (!hasRequirementChild && !fallback)) fail('MISSING_REQUIRED_CHILD_EVIDENCE');
}

function validateNextPhaseEvent(records, event) {
  // Legacy fixtures may omit phase boundaries. initialize-run.js marks audited runs
  // with clarify/phase_started, which enables strict pre-write transition checks.
  if (records[0]?.phase !== 'clarify' || records[0]?.event_type !== 'phase_started') return;
  const last = records.at(-1);
  const currentIndex = PHASE_ORDER.indexOf(last.phase);
  const nextIndex = PHASE_ORDER.indexOf(event.phase);
  if (last.event_type === 'phase_finished') {
    if (nextIndex !== currentIndex + 1 || event.event_type !== 'phase_started') {
      fail('NEXT_PHASE_START_REQUIRED');
    }
    return;
  }
  if (nextIndex !== currentIndex) fail('CURRENT_PHASE_NOT_FINISHED');
  if (event.event_type === 'phase_started') fail('DUPLICATE_PHASE_START');
}

function readRegularJson(path, code) {
  let stat;
  try { stat = fs.lstatSync(path); } catch { fail(code); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(code);
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { fail(code); }
}

function receiptKey(value) {
  return `${value?.task_id || ''}\u0000${value?.attempt_id || ''}`;
}

function executionChildren(report) {
  return report.children.filter((child) => !['requirement-dialogue', 'task-splitter'].includes(child?.agent_id));
}

function validateRoutingAction(attempt) {
  const failure = attempt.failure_class;
  const mutation = attempt.mutation_state;
  const action = attempt.action;
  const knownMutation = ['effect_none', 'known_effect'].includes(mutation);
  const permitted = {
    success: failure === null && knownMutation,
    retry_same_route: failure === 'transient_effect_none' && mutation === 'effect_none',
    failover_same_tier: ['route_health', 'provider_health'].includes(failure) && knownMutation,
    escalate_capability_tier: failure === 'capability_insufficient' && knownMutation,
    repair: failure === 'deterministic_implementation_failure' && knownMutation,
    block: knownMutation && [
      'transient_effect_none', 'route_health', 'provider_health', 'capability_insufficient',
      'deterministic_implementation_failure', 'authentication', 'quota', 'missing_tool', 'authority', 'budget',
    ].includes(failure),
    reconcile: mutation === 'unknown' || failure === 'unknown_mutation_state',
    stop: knownMutation && (failure === 'unclassified'
      || (failure === 'transient_effect_none' && mutation === 'known_effect')),
  };
  if (permitted[action] !== true) fail('ROUTING_ACTION_FAILURE_MISMATCH', receiptKey(attempt));
}

function validateRoutingLineage(report) {
  if (!Array.isArray(report.routing_attempts)) fail('ROUTING_ATTEMPTS_REQUIRED');
  if (!Array.isArray(report.children) || !Array.isArray(report.task_results)) {
    fail('ROUTING_LINEAGE_REPORT_INVALID');
  }
  const attempts = new Map();
  for (const attempt of report.routing_attempts) {
    const key = receiptKey(attempt);
    if (!attempt?.task_id || !attempt?.attempt_id || attempts.has(key)) fail('ROUTING_ATTEMPT_ID_INVALID', key);
    validateRoutingAction(attempt);
    attempts.set(key, attempt);
  }

  const routedChildren = executionChildren(report);
  if (attempts.size !== routedChildren.length) fail('ROUTING_ATTEMPT_CHILD_COUNT_MISMATCH');
  const resultKeys = new Set();
  for (const result of report.task_results) {
    if (result?.schema !== 'vulpora.task-result/v2') fail('ROUTING_RESULT_VERSION_MISMATCH');
    const key = receiptKey(result);
    if (resultKeys.has(key)) fail('ROUTING_RESULT_DUPLICATE', key);
    resultKeys.add(key);
  }
  for (const child of routedChildren) {
    const handoff = child?.handoff;
    const key = receiptKey(handoff);
    const attempt = attempts.get(key);
    if (handoff?.schema !== 'vulpora.subagent-handoff/v2'
      || handoff?.result_schema !== 'vulpora.task-result/v2'
      || child.inheritance_used !== false) {
      fail('ROUTING_EXECUTION_HANDOFF_INVALID', key);
    }
    if (!attempt || !resultKeys.has(key)) fail('ROUTING_EXECUTION_BINDING_MISSING', key);
    if (canonicalJson(handoff.dispatch_receipt) !== canonicalJson(attempt.dispatch_receipt)) {
      fail('ROUTING_DISPATCH_REFERENCE_MISMATCH', key);
    }
    const result = report.task_results.find((candidate) => receiptKey(candidate) === key);
    if (result.mutation_state !== attempt.mutation_state) fail('ROUTING_RESULT_MUTATION_MISMATCH', key);
    const successfulAttempt = attempt.failure_class === null && attempt.action === 'success';
    if (result.status === 'verified' && !successfulAttempt) fail('ROUTING_RESULT_OUTCOME_MISMATCH', key);
    if (!successfulAttempt && Array.isArray(result.acceptance_evidence)
      && result.acceptance_evidence.some((evidence) => evidence?.outcome === 'pass')) {
      fail('ROUTING_FAILED_RESULT_HAS_PASSING_EVIDENCE', key);
    }
    if (child.runtime_reported_model !== attempt.runtime_reported_model) {
      fail('ROUTING_RUNTIME_MODEL_MISMATCH', key);
    }
  }
  for (const key of attempts.keys()) {
    if (!resultKeys.has(key)) fail('ROUTING_RESULT_MISSING', key);
  }
}

function validateTaskExecutionLineage(report, dag) {
  const children = executionChildren(report);
  for (const task of dag.tasks.values()) {
    const taskChildren = children.filter((child) => child?.handoff?.task_id === task.id);
    const taskAttempts = report.routing_attempts.filter((attempt) => attempt.task_id === task.id);
    const executedResults = report.task_results.filter((result) => result.task_id === task.id && result.status !== 'not_run');
    if (task.executionKind === 'native-subagent') {
      for (const result of executedResults) {
        const key = receiptKey(result);
        if (!taskChildren.some((child) => receiptKey(child.handoff) === key)
          || !taskAttempts.some((attempt) => receiptKey(attempt) === key)) fail('NATIVE_TASK_RESULT_LINEAGE_MISSING', key);
      }
    } else if (taskChildren.length > 0 || taskAttempts.length > 0) {
      fail('INLINE_TASK_HAS_CHILD_ROUTE', task.id);
    }
  }
}

function readBoundReceipt(rootRealPath, reference, expectedRunId, kind) {
  const expectedPrefix = `.vulpora/tasks/${expectedRunId}/routing/`;
  const receiptPath = /^\.vulpora\/tasks\/[A-Za-z0-9][A-Za-z0-9._-]+\/routing\/[A-Za-z0-9][A-Za-z0-9._-]+\.json$/;
  if (!reference || reference.immutable !== true || typeof reference.path !== 'string'
    || !reference.path.startsWith(expectedPrefix) || !receiptPath.test(reference.path)
    || !SHA256.test(reference.sha256 || '')) {
    fail(`ROUTING_${kind}_REFERENCE_INVALID`);
  }
  const absolute = pathModule.resolve(rootRealPath, reference.path);
  let stat;
  let realPath;
  let bytes;
  try {
    stat = fs.lstatSync(absolute);
    realPath = fs.realpathSync.native(absolute);
    bytes = fs.readFileSync(realPath);
  } catch {
    fail(`ROUTING_${kind}_RECEIPT_UNREADABLE`);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || !realPath.startsWith(`${rootRealPath}${pathModule.sep}`)) {
    fail(`ROUTING_${kind}_RECEIPT_PATH_INVALID`);
  }
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== reference.sha256) {
    fail(`ROUTING_${kind}_RECEIPT_HASH_MISMATCH`);
  }
  let receipt;
  try { receipt = JSON.parse(bytes.toString('utf8')); } catch { fail(`ROUTING_${kind}_RECEIPT_JSON_INVALID`); }
  if (canonicalJson(receipt) !== bytes.toString('utf8')) fail(`ROUTING_${kind}_RECEIPT_NON_CANONICAL`);
  return receipt;
}

function routingScalar(values, missingCode, mismatchCode, key) {
  const supplied = values.filter((value) => value !== undefined);
  if (supplied.length === 0) return null;
  if (supplied.some((value) => typeof value !== 'string' || value.length === 0 || value === 'unavailable')) {
    fail(missingCode, key);
  }
  if (new Set(supplied).size !== 1) fail(mismatchCode, key);
  return supplied[0];
}

function validateRoutingBudget(value, fields, key) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== fields.length
    || fields.some((field) => !Number.isSafeInteger(value[field]) || value[field] < 0)) {
    fail('ROUTING_BUDGET_INVALID', key);
  }
}

function validateRoutingBudgetSequence(entries, records) {
  const remainingFields = ['relative_units', 'estimated_tokens', 'attempts', 'route_hops'];
  const previousByTask = new Map();
  // Frozen ledger order is authoritative. Standalone receipt validation uses
  // the report's chronological attempt order, not lexicographic attempt IDs.
  const ordered = records ? [...entries].sort((left, right) => left.ledgerIndex - right.ledgerIndex) : entries;
  for (const {attempt, selectedModel, selectedEffort} of ordered) {
    const key = receiptKey(attempt);
    validateRoutingBudget(attempt.budget_debit, ['relative_units', 'estimated_tokens'], key);
    validateRoutingBudget(attempt.budget_remaining, remainingFields, key);
    const previous = previousByTask.get(attempt.task_id);
    if (previous) {
      for (const field of ['relative_units', 'estimated_tokens']) {
        if (BigInt(previous.attempt.budget_remaining[field])
          !== BigInt(attempt.budget_remaining[field]) + BigInt(attempt.budget_debit[field])) {
          fail('ROUTING_BUDGET_DEBIT_SEQUENCE_MISMATCH', key);
        }
      }
      if (previous.attempt.budget_remaining.attempts < 1
        || attempt.budget_remaining.attempts !== previous.attempt.budget_remaining.attempts - 1) {
        fail('ROUTING_ATTEMPT_BUDGET_SEQUENCE_MISMATCH', key);
      }
      const hopDifference = previous.attempt.budget_remaining.route_hops - attempt.budget_remaining.route_hops;
      const hopActions = ['failover_same_tier', 'escalate_capability_tier'];
      // v1 receipts do not say whether a hop is reserved at the preceding
      // decision or charged when the replacement finishes. Enforce monotonicity
      // and reject unrelated hop charges without inventing that missing timing.
      if (hopDifference < 0 || hopDifference > 1 || (hopDifference !== 0
        && !hopActions.includes(previous.attempt.action) && !hopActions.includes(attempt.action))) {
        fail('ROUTING_HOP_BUDGET_SEQUENCE_MISMATCH', key);
      }
      if (['retry_same_route', 'repair'].includes(previous.attempt.action)
        && (selectedModel !== previous.selectedModel || selectedEffort !== previous.selectedEffort)) {
        fail('ROUTING_SAME_ROUTE_CHANGED', key);
      }
    }
    previousByTask.set(attempt.task_id, {attempt, selectedModel, selectedEffort});
  }
}

function validateRoutingReceiptBindings(report, workspaceRoot, records) {
  validateRoutingLineage(report);
  let rootRealPath;
  try { rootRealPath = fs.realpathSync.native(workspaceRoot); } catch { fail('WORKSPACE_ROOT_INVALID'); }
  const boundAttempts = [];
  for (const attempt of report.routing_attempts) {
    const key = receiptKey(attempt);
    const dispatch = readBoundReceipt(rootRealPath, attempt.dispatch_receipt, report.run_id, 'DISPATCH');
    const outcome = readBoundReceipt(rootRealPath, attempt.attempt_receipt, report.run_id, 'ATTEMPT');
    if (dispatch.schema !== 'vulpora.routing-dispatch-receipt/v1'
      || dispatch.run_id !== report.run_id || dispatch.task_id !== attempt.task_id
      || dispatch.attempt_id !== attempt.attempt_id || dispatch.immutable !== true) {
      fail('ROUTING_DISPATCH_RECEIPT_IDENTITY_MISMATCH', key);
    }
    const expectedBinding = sha256(canonicalJson({
      attempt_id: attempt.attempt_id,
      dispatch_receipt: attempt.dispatch_receipt,
    }));
    const child = executionChildren(report).find((candidate) => receiptKey(candidate.handoff) === key);
    if (child?.handoff?.route_binding_sha256 !== expectedBinding) fail('ROUTING_BINDING_SHA256_MISMATCH', key);
    const outcomeRuntimeModel = outcome.runtime_reported_model ?? 'unavailable';
    if (outcome.schema !== 'vulpora.routing-attempt-receipt/v1'
      || outcome.run_id !== report.run_id || outcome.task_id !== attempt.task_id
      || outcome.attempt_id !== attempt.attempt_id || outcome.immutable !== true
      || canonicalJson(outcome.dispatch_receipt) !== canonicalJson(attempt.dispatch_receipt)
      || outcome.mutation_state !== attempt.mutation_state
      || outcome.failure_class !== attempt.failure_class
      || outcome.action !== attempt.action
      || canonicalJson(outcome.budget_debit) !== canonicalJson(attempt.budget_debit)
      || canonicalJson(outcome.budget_remaining) !== canonicalJson(attempt.budget_remaining)
      || outcomeRuntimeModel !== attempt.runtime_reported_model) {
      fail('ROUTING_ATTEMPT_RECEIPT_MISMATCH', key);
    }
    const selectedModel = routingScalar([dispatch.selected_model, dispatch.selected_route?.model_id],
      'ROUTING_DISPATCH_MODEL_MISSING', 'ROUTING_DISPATCH_MODEL_CONFLICT', key);
    if (selectedModel === null) fail('ROUTING_DISPATCH_MODEL_MISSING', key);
    if (attempt.runtime_reported_model !== 'unavailable'
      && attempt.runtime_reported_model !== selectedModel) {
      fail('ROUTING_RUNTIME_DISPATCH_MODEL_MISMATCH', key);
    }
    const selectedEffort = routingScalar([
      dispatch.selected_reasoning_effort, dispatch.reasoning_effort, dispatch.selected_route?.reasoning_effort,
    ], 'ROUTING_DISPATCH_REASONING_MISSING', 'ROUTING_DISPATCH_REASONING_CONFLICT', key);
    // Legacy minimal receipts have no effort fields and remain model-only
    // evidence. Once either side supplies effort, both sides must bind exactly.
    if (selectedEffort !== null || outcome.runtime_reported_reasoning_effort !== undefined) {
      if (selectedEffort === null) fail('ROUTING_DISPATCH_REASONING_MISSING', key);
      if (typeof outcome.runtime_reported_reasoning_effort !== 'string'
        || outcome.runtime_reported_reasoning_effort === 'unavailable'
        || outcome.runtime_reported_reasoning_effort.length === 0) {
        fail('ROUTING_RUNTIME_REASONING_MISSING', key);
      }
      if (outcome.runtime_reported_reasoning_effort !== selectedEffort) {
        fail('ROUTING_RUNTIME_DISPATCH_REASONING_MISMATCH', key);
      }
    }
    if (dispatch.route_requirement_sha256 !== undefined
      && (!SHA256.test(dispatch.route_requirement_sha256)
        || child.handoff.route_requirement_sha256 !== dispatch.route_requirement_sha256)) {
      fail('ROUTING_REQUIREMENT_BINDING_MISMATCH', key);
    }
    let ledgerIndex = null;
    if (records) {
      for (const reference of [attempt.dispatch_receipt, attempt.attempt_receipt]) {
        const expectedSourceRef = `file-sha256:${reference.sha256}:${reference.path}`;
        if (!records.some((record) => record.phase === 'execute' && record.source_type === 'filesystem_digest'
          && record.status === 'passed' && record.source_ref === expectedSourceRef)) {
          fail('ROUTING_RECEIPT_LEDGER_MISMATCH', reference.path);
        }
        if (reference === attempt.attempt_receipt) ledgerIndex = records.findIndex((record) =>
          record.phase === 'execute' && record.source_type === 'filesystem_digest'
          && record.status === 'passed' && record.source_ref === expectedSourceRef);
      }
    }
    boundAttempts.push({attempt, selectedModel, selectedEffort, ledgerIndex});
  }
  validateRoutingBudgetSequence(boundAttempts, records);
}

function validateSpecProjectionBinding(specText, parsedProjection, projectionBytes, expectedPath, projectionSha256) {
  let parsedSpec;
  try { parsedSpec = JSON.parse(specText); } catch { fail('COMPLETE_SPEC_JSON_INVALID'); }
  if (canonicalJson(parsedSpec) !== specText
    || parsedSpec.schema !== 'vulpora.clarified-task-spec/v2'
    || parsedSpec.status !== parsedProjection.spec_status
    || parsedSpec.clarity_projection_path !== expectedPath
    || parsedSpec.clarity_projection_sha256 !== projectionSha256
    || canonicalJson(parsedSpec.clarity_projection) !== projectionBytes.toString('utf8')
    || Object.hasOwn(parsedSpec, 'unknowns') || Object.hasOwn(parsedSpec, 'clarity_gate')
    || Object.hasOwn(parsedSpec, 'approval')) {
    fail('COMPLETE_SPEC_CLARITY_PROJECTION_MISMATCH');
  }
  return parsedSpec;
}

function validateProceedDecisionBinding(records, spec) {
  const decision = spec?.clarity_projection?.clarity_gate?.skip;
  if (decision?.requested !== true) return null;
  const context = decision.decision_context;
  const commit = records.find((record) => record.event_type === 'spec_committed'
    && record.phase === 'approve' && record.status === 'reported'
    && record.source_type === 'user_decision' && record.source_ref === decision.decision_ref);
  const offer = records.find((record) => record.event_type === 'clarification_offer_frozen'
    && record.phase === 'clarify' && record.status === 'passed'
    && record.source_type === 'filesystem_digest' && record.source_ref === context?.offer_ref);
  const question = records.find((record) => record.event_type === 'question_requested'
    && record.phase === 'clarify' && record.status === 'reported'
    && record.source_type === 'agent_claim' && record.source_ref === context?.question_signature);
  if (!/^answer-sha256:[a-f0-9]{64}$/.test(decision.decision_ref || '')
    || !context || decision.decision_ref !== `answer-sha256:${context.answer_sha256}`
    || !commit || !offer || !question
    || [commit, offer, question].some((record) => record.run_id !== context.run_id)
    || !Number.isSafeInteger(offer.sequence) || !Number.isSafeInteger(question.sequence)
    || !Number.isSafeInteger(commit.sequence) || !(offer.sequence < question.sequence && question.sequence < commit.sequence)) {
    fail('PROCEED_DECISION_LEDGER_MISMATCH');
  }
  return decision.decision_ref;
}

function sameStringSet(left, right) {
  return canonicalJson([...left].sort()) === canonicalJson([...right].sort());
}

function validateCompleteTaskCoverage(report, spec, dagText, records) {
  let dag;
  try { dag = parseTaskDag(dagText, spec); } catch (error) { fail('COMPLETE_DAG_CONTRACT_INVALID', error.code || error.message); }
  if (dag.specId !== spec.spec_id) fail('COMPLETE_DAG_SPEC_DRIFT');
  const specGate = spec.clarity_projection?.clarity_gate;
  if (!specGate || dag.clarityGate.status !== specGate.status || dag.clarityGate.score !== specGate.score
    || dag.clarityGate.threshold !== specGate.threshold
    || canonicalJson(dag.clarityGate.skip) !== canonicalJson(specGate.skip)) fail('COMPLETE_DAG_CLARITY_DRIFT');
  if (!dag.tasks.size || !dag.coverage.size) fail('COMPLETE_DAG_EMPTY');
  validateTaskExecutionLineage(report, dag);
  const resultIds = [...new Set(report.task_results.map((result) => result.task_id))].sort();
  const dagTaskIds = [...dag.tasks.keys()].sort();
  if (canonicalJson(resultIds) !== canonicalJson(dagTaskIds)) fail('COMPLETE_TASK_INVENTORY_MISMATCH');
  for (const taskId of dag.tasks.keys()) {
    if (report.task_results.filter((result) => result.task_id === taskId && result.status === 'verified').length !== 1) {
      fail('COMPLETE_TASK_NOT_VERIFIED', taskId);
    }
  }

  const specCriterionIds = (spec.acceptance_criteria || []).map((criterion) =>
    typeof criterion === 'string' ? criterion : criterion?.id).filter(Boolean).sort();
  if (canonicalJson(specCriterionIds) !== canonicalJson([...dag.coverage.keys()].sort())) {
    fail('COMPLETE_DAG_ACCEPTANCE_COVERAGE_MISMATCH');
  }

  for (const child of executionChildren(report)) {
    const task = dag.tasks.get(child?.handoff?.task_id);
    if (!task) fail('COMPLETE_HANDOFF_TASK_UNBOUND');
    if (child.handoff.spec_slice?.spec_id !== spec.spec_id) fail('COMPLETE_HANDOFF_SPEC_DRIFT');
    if (!sameStringSet(child.handoff.spec_slice?.acceptance_criterion_ids || [], task.acceptanceCriterionIds)) {
      fail('COMPLETE_HANDOFF_ACCEPTANCE_DRIFT');
    }
    if (!sameStringSet(child.handoff.write_scope || [], task.writeScope)) {
      fail('COMPLETE_HANDOFF_SCOPE_DRIFT');
    }
  }

  for (const result of report.task_results) {
    const task = dag.tasks.get(result.task_id);
    if (!Array.isArray(result.acceptance_evidence)) fail('COMPLETE_AC_EVIDENCE_MISSING', result.task_id);
    for (const evidence of result.acceptance_evidence) {
      const check = report.verification[evidence.verification_index];
      if (!task.acceptanceCriterionIds.includes(evidence.acceptance_criterion_id)
        || !dag.coverage.get(evidence.acceptance_criterion_id)?.includes(result.task_id)
        || evidence.outcome !== 'pass' || !check || check.outcome !== 'pass' || check.exit_code !== 0) {
        fail('COMPLETE_AC_EVIDENCE_UNBOUND', evidence.acceptance_criterion_id);
      }
      const digest = sha256(canonicalJson({argv: check.argv, stdin_sha256: check.stdin_sha256}));
      if (evidence.observed_ref !== `command-sha256:${digest}`
        || !records.some((record) => record.phase === 'verify'
          && record.event_type === 'command_finished' && record.status === 'passed'
          && record.source_ref === `${evidence.observed_ref}:exit:0`)) {
        fail('COMPLETE_AC_EVIDENCE_NOT_OBSERVED', evidence.acceptance_criterion_id);
      }
    }
  }
  for (const [criterionId, taskIds] of dag.coverage) {
    for (const taskId of taskIds) {
      const passed = report.task_results.some((result) => result.task_id === taskId && result.status === 'verified'
        && result.acceptance_evidence.some((evidence) => evidence.acceptance_criterion_id === criterionId));
      if (!passed) fail('COMPLETE_AC_EVIDENCE_MISSING', `${criterionId}:${taskId}`);
    }
  }
  return dag;
}

function validateFinalRunControlBinding(finalState, report, spec, dag, records) {
  if (!finalState || finalState.spec?.id !== spec.spec_id
    || finalState.spec?.sha256 !== report.clarified_spec.sha256) fail('COMPLETE_RUN_CONTROL_SPEC_DRIFT');
  const specCriteria = (spec.acceptance_criteria || []).map((criterion) =>
    typeof criterion === 'string' ? criterion : criterion?.id).filter(Boolean).sort();
  if (!sameStringSet(finalState.acceptance_criteria, specCriteria)) fail('COMPLETE_RUN_CONTROL_ACCEPTANCE_DRIFT');
  if (!sameStringSet(finalState.tasks.map((task) => task.id), [...dag.tasks.keys()])) {
    fail('COMPLETE_RUN_CONTROL_TASK_DRIFT');
  }
  for (const taskState of finalState.tasks) {
    const task = dag.tasks.get(taskState.id);
    if (!task || taskState.status !== 'verified'
      || !sameStringSet(taskState.acceptance_criterion_ids, task.acceptanceCriterionIds)) {
      fail('COMPLETE_RUN_CONTROL_TASK_DRIFT', taskState.id);
    }
  }
  const stateEvidence = finalState.acceptance_evidence.filter((evidence) => evidence.verification_outcome === 'pass')
    .map((evidence) => canonicalJson({
    acceptance_criterion_id:evidence.acceptance_criterion_id,
    observed_ref:evidence.observed_ref,
    outcome:evidence.verification_outcome,
    task_id:evidence.task_id,
    })).sort();
  const reportEvidence = report.task_results.filter((result) => result.status === 'verified')
    .flatMap((result) => result.acceptance_evidence.map((evidence) => canonicalJson({
      acceptance_criterion_id:evidence.acceptance_criterion_id,
      observed_ref:evidence.observed_ref,
      outcome:evidence.outcome,
      task_id:result.task_id,
    }))).sort();
  if (canonicalJson(stateEvidence) !== canonicalJson(reportEvidence)) fail('COMPLETE_RUN_CONTROL_EVIDENCE_DRIFT');
  for (const evidence of finalState.acceptance_evidence.filter((candidate) => candidate.verification_outcome === 'failed')) {
    const commandObserved = evidence.observed_ref.startsWith('command-sha256:')
      && records.some((record) => record.event_type === 'command_finished'
        && ['failed', 'timeout'].includes(record.status)
        && record.source_ref.startsWith(`${evidence.observed_ref}:`));
    const fileObserved = evidence.observed_ref.startsWith('file-sha256:')
      && records.some((record) => record.source_type === 'filesystem_digest' && record.status === 'failed'
        && record.source_ref === evidence.observed_ref);
    if (!commandObserved && !fileObserved) fail('COMPLETE_RUN_CONTROL_FAILED_EVIDENCE_UNOBSERVED');
  }
}

function validateCompletionEvidence(records, ledgerPath, reportPath, workspaceRoot, expectedRunId) {
  const report = readRegularJson(reportPath, 'COMPLETE_REPORT_UNREADABLE');
  if (report.schema_version !== 'vulpora.orchestration-report/v3') fail('COMPLETE_REPORT_VERSION_MISMATCH');
  if (report.run_id !== expectedRunId || report.terminal_status !== 'complete') fail('COMPLETE_REPORT_ID_OR_STATUS_MISMATCH');
  const expectedLedgerPath = `.vulpora/tasks/${expectedRunId}/execution-ledger.jsonl`;
  if (report.execution_ledger?.path !== expectedLedgerPath
    || report.execution_ledger?.record_count !== records.length
    || report.execution_ledger?.head_sha256 !== records.at(-1)?.event_sha256
    || report.execution_ledger?.integrity_level !== 'local_tamper_evident'
    || report.execution_ledger?.external_anchor !== null) {
    fail('COMPLETE_REPORT_LEDGER_MISMATCH');
  }

  let rootRealPath;
  try {
    const rootStat = fs.lstatSync(workspaceRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('WORKSPACE_ROOT_INVALID');
    rootRealPath = fs.realpathSync.native(workspaceRoot);
  } catch {
    fail('WORKSPACE_ROOT_INVALID');
  }
  validateRoutingReceiptBindings(report, rootRealPath, records);
  let controlHistory;
  try {
    const {validateRunControlHistory} = require('./validate-run-control.js');
    controlHistory = validateRunControlHistory(records, rootRealPath, expectedRunId, 'complete');
  } catch (error) {
    fail('COMPLETE_RUN_CONTROL_HISTORY_INVALID', error?.code || error?.message);
  }
  let ledgerRealPath;
  let expectedLedgerRealPath;
  try {
    ledgerRealPath = fs.realpathSync.native(ledgerPath);
    expectedLedgerRealPath = fs.realpathSync.native(pathModule.resolve(rootRealPath, expectedLedgerPath));
  } catch {
    fail('COMPLETE_LEDGER_PATH_UNREADABLE');
  }
  if (ledgerRealPath !== expectedLedgerRealPath) fail('COMPLETE_LEDGER_PATH_MISMATCH');

  let dagText = null;
  const artifactFields = [
    ['clarified_spec', 'approve'],
    ['task_dag', 'split'],
  ];
  for (const [field, phase] of artifactFields) {
    const artifact = report[field];
    const expectedPath = `.vulpora/tasks/${expectedRunId}/${field === 'clarified_spec' ? 'clarified-spec.yaml' : 'task-dag.yaml'}`;
    if (artifact?.path !== expectedPath || !SHA256.test(artifact?.sha256 || '')) fail('COMPLETE_ARTIFACT_REPORT_INVALID', field);
    const absolute = pathModule.resolve(rootRealPath, artifact.path);
    let artifactRealPath;
    let stat;
    try {
      stat = fs.lstatSync(absolute);
      artifactRealPath = fs.realpathSync.native(absolute);
    } catch {
      fail('COMPLETE_ARTIFACT_UNREADABLE', field);
    }
    if (!stat.isFile() || stat.isSymbolicLink()
      || (artifactRealPath !== rootRealPath && !artifactRealPath.startsWith(`${rootRealPath}${pathModule.sep}`))) {
      fail('COMPLETE_ARTIFACT_PATH_INVALID', field);
    }
    const actualSha256 = crypto.createHash('sha256').update(fs.readFileSync(artifactRealPath)).digest('hex');
    if (artifact.sha256 !== actualSha256) fail('COMPLETE_ARTIFACT_HASH_MISMATCH', field);
    const expectedSourceRef = `file-sha256:${actualSha256}:${artifact.path}`;
    if (!records.some((record) => record.phase === phase && record.event_type === 'artifact_frozen'
      && record.source_type === 'filesystem_digest' && record.status === 'passed'
      && record.source_ref === expectedSourceRef)) {
      fail('COMPLETE_ARTIFACT_LEDGER_MISMATCH', field);
    }
    if (field === 'task_dag') dagText = fs.readFileSync(artifactRealPath, 'utf8');
  }

  const projection = report.clarity_gate_evidence;
  const expectedProjectionPath = `.vulpora/tasks/${expectedRunId}/clarity-projection.json`;
  if (projection?.projection_path !== expectedProjectionPath
    || !SHA256.test(projection?.projection_sha256 || '')) {
    fail('COMPLETE_CLARITY_PROJECTION_REPORT_INVALID');
  }
  const projectionAbsolute = pathModule.resolve(rootRealPath, expectedProjectionPath);
  let projectionRealPath;
  let projectionBytes;
  try {
    const stat = fs.lstatSync(projectionAbsolute);
    projectionRealPath = fs.realpathSync.native(projectionAbsolute);
    if (!stat.isFile() || stat.isSymbolicLink()
      || !projectionRealPath.startsWith(`${rootRealPath}${pathModule.sep}`)) {
      fail('COMPLETE_CLARITY_PROJECTION_PATH_INVALID');
    }
    projectionBytes = fs.readFileSync(projectionRealPath);
  } catch {
    fail('COMPLETE_CLARITY_PROJECTION_UNREADABLE');
  }
  const projectionSha256 = crypto.createHash('sha256').update(projectionBytes).digest('hex');
  if (projectionSha256 !== projection.projection_sha256) fail('COMPLETE_CLARITY_PROJECTION_HASH_MISMATCH');
  let parsedProjection;
  try { parsedProjection = JSON.parse(projectionBytes.toString('utf8')); } catch { fail('COMPLETE_CLARITY_PROJECTION_JSON_INVALID'); }
  if (Buffer.from(canonicalJson(parsedProjection), 'utf8').compare(projectionBytes) !== 0) {
    fail('COMPLETE_CLARITY_PROJECTION_NON_CANONICAL');
  }
  const specText = fs.readFileSync(pathModule.resolve(rootRealPath, report.clarified_spec.path), 'utf8');
  const boundSpec = validateSpecProjectionBinding(
    specText, parsedProjection, projectionBytes, expectedProjectionPath, projectionSha256,
  );
  if (report.clarified_spec.schema !== boundSpec.schema
    || report.clarified_spec.id !== boundSpec.spec_id
    || report.clarified_spec.status !== 'approved') {
    fail('COMPLETE_SPEC_REPORT_IDENTITY_MISMATCH');
  }
  validateProceedDecisionBinding(records, boundSpec);
  const expectedProjectionSourceRef = `file-sha256:${projectionSha256}:${expectedProjectionPath}`;
  if (!records.some((record) => record.phase === 'approve'
    && record.event_type === 'clarity_projection_frozen'
    && record.source_type === 'filesystem_digest' && record.status === 'passed'
    && record.source_ref === expectedProjectionSourceRef)) {
    fail('COMPLETE_CLARITY_PROJECTION_LEDGER_MISMATCH');
  }

  validateClarificationPath(records, report);
  for (const agentId of ['task-splitter']) {
    const child = report.children.find((candidate) => candidate?.agent_id === agentId);
    if (!child || typeof child.native_child_id !== 'string' || child.native_child_id.length === 0) {
      fail('COMPLETE_REQUIRED_CHILD_MISSING', agentId);
    }
    const sourceRef = `child:${agentId}:${child.native_child_id}`;
    const dispatched = records.find((record) => record.event_type === 'child_dispatched' && record.source_ref === sourceRef);
    const finished = records.find((record) => record.event_type === 'child_finished' && record.source_ref === sourceRef);
    if (!dispatched || !finished || dispatched.sequence >= finished.sequence) {
      fail('COMPLETE_CHILD_LEDGER_MISMATCH', agentId);
    }
  }

  if (!Array.isArray(report.verification) || report.verification.length === 0) {
    fail('COMPLETE_VERIFICATION_REPORT_INVALID');
  }
  let clarityValidatorCount = 0;
  for (const check of report.verification) {
    if (!Array.isArray(check?.argv) || check.argv.length === 0 || check.exit_code !== 0 || check.outcome !== 'pass'
      || !(check.stdin_sha256 === null || SHA256.test(check.stdin_sha256 || ''))) {
      fail('COMPLETE_VERIFICATION_RESULT_INVALID');
    }
    let isClarityValidator = false;
    if (check.argv.length === 2 && pathModule.basename(check.argv[1]) === 'validate-clarity-gate.js') {
      try {
        const reportedNode = pathModule.isAbsolute(check.argv[0])
          ? check.argv[0]
          : pathModule.resolve(rootRealPath, check.argv[0]);
        const reportedValidator = pathModule.isAbsolute(check.argv[1])
          ? check.argv[1]
          : pathModule.resolve(rootRealPath, check.argv[1]);
        isClarityValidator = fs.realpathSync.native(reportedNode) === fs.realpathSync.native(process.execPath)
          && fs.realpathSync.native(reportedValidator)
          === fs.realpathSync.native(pathModule.join(__dirname, 'validate-clarity-gate.js'));
      } catch {
        isClarityValidator = false;
      }
    }
    if (isClarityValidator) {
      clarityValidatorCount += 1;
      if (check.stdin_sha256 !== projectionSha256) fail('COMPLETE_CLARITY_STDIN_MISMATCH');
    } else if (check.stdin_sha256 !== null) {
      fail('COMPLETE_UNEXPECTED_VERIFICATION_STDIN');
    }
    const expectedPhase = isClarityValidator ? 'approve' : 'verify';
    const digest = sha256(canonicalJson({argv: check.argv, stdin_sha256: check.stdin_sha256}));
    if (!records.some((record) => record.phase === expectedPhase
      && record.event_type === 'command_finished' && record.source_type === 'runtime_result'
      && record.status === 'passed' && record.source_ref === `command-sha256:${digest}:exit:0`)) {
      fail('COMPLETE_VERIFICATION_LEDGER_MISMATCH', digest);
    }
  }
  if (clarityValidatorCount !== 1) fail('COMPLETE_CLARITY_VALIDATOR_COUNT_INVALID');
  const dag = validateCompleteTaskCoverage(report, boundSpec, dagText, records);
  validateFinalRunControlBinding(controlHistory.finalState, report, boundSpec, dag, records);
}

function main() {
  if (process.argv.length < 3 || process.argv.length > 9 || process.argv[2].length === 0) {
    fail('USAGE_LEDGER_PATH_RUN_ID_HEAD_COUNT_PROFILE_REPORT_WORKSPACE');
  }
  const expectedRunId = process.argv[3];
  const expectedHeadSha256 = process.argv[4];
  const expectedRecordCountText = process.argv[5];
  const profile = process.argv[6] || 'active';
  const reportPath = process.argv[7];
  const workspaceRoot = process.argv[8];
  if (expectedRunId !== undefined && !RUN_ID.test(expectedRunId)) fail('INVALID_EXPECTED_RUN_ID');
  if (expectedHeadSha256 !== undefined && !SHA256.test(expectedHeadSha256)) {
    fail('INVALID_EXPECTED_HEAD_SHA256');
  }
  let expectedRecordCount;
  if (expectedRecordCountText !== undefined) {
    if (!/^[1-9]\d*$/.test(expectedRecordCountText)) fail('INVALID_EXPECTED_RECORD_COUNT');
    expectedRecordCount = Number(expectedRecordCountText);
    if (!Number.isSafeInteger(expectedRecordCount)) fail('INVALID_EXPECTED_RECORD_COUNT');
  }
  if (!['active', 'complete'].includes(profile)) fail('INVALID_VALIDATION_PROFILE');
  if (profile === 'complete' && (!reportPath || !workspaceRoot)) fail('COMPLETE_EVIDENCE_ARGUMENTS_REQUIRED');
  if (profile === 'active' && (reportPath !== undefined || workspaceRoot !== undefined)) fail('ACTIVE_EVIDENCE_ARGUMENTS_FORBIDDEN');
  const result = validateLedgerFile(process.argv[2], expectedRunId);
  if (expectedHeadSha256 !== undefined && result.headSha256 !== expectedHeadSha256) {
    fail('EXPECTED_HEAD_SHA256_MISMATCH');
  }
  if (expectedRecordCount !== undefined && result.records.length !== expectedRecordCount) {
    fail('EXPECTED_RECORD_COUNT_MISMATCH');
  }
  validateLifecycle(result.records, profile);
  if (profile === 'complete') validateCompletionEvidence(result.records, process.argv[2], reportPath, workspaceRoot, expectedRunId);
  process.stdout.write(`${JSON.stringify({
    outcome: 'pass',
    record_count: result.records.length,
    run_id: result.runId,
    head_sha256: result.headSha256,
    integrity_level: 'local_tamper_evident',
    absolute_immutability_claimed: false,
  })}\n`);
}

module.exports = {
  INPUT_FIELDS,
  RUN_ID,
  ZERO_SHA256,
  canonicalJson,
  parseLedger,
  sha256,
  validateEventFields,
  validateCompletionEvidence,
  validateSpecProjectionBinding,
  validateLifecycle,
  validateNextPhaseEvent,
  validateLedgerFile,
  validateProceedDecisionBinding,
  validateTaskExecutionLineage,
  validateRoutingAction,
  validateRoutingLineage,
  validateRoutingReceiptBindings,
  validateClarificationPath,
  validateClarificationRounds,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    reject(error);
  }
}
