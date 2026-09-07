#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {validateLedgerFile} = require('./validate-execution-ledger.js');
const {readState} = require('./validate-run-control.js');
const {writeCanonicalValue} = require('./write-canonical-json.js');

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function run(command, args, input) {
  return spawnSync(command, args, {cwd: process.cwd(), encoding: 'utf8', input, shell: false});
}

function lastJson(output, code) {
  const line = output.trim().split(/\r?\n/).filter(Boolean).at(-1);
  try { return JSON.parse(line); } catch { fail(code); }
}

function main() {
  const separator = process.argv.indexOf('--');
  if (separator !== 7 || process.argv.length <= separator + 1) {
    fail('USAGE_LEDGER_RUN_TIMEOUT_LABEL_NEXT_STATE_DOUBLE_DASH_COMMAND');
  }
  const [, , ledgerPath, runId, timeoutText, label, nextStatePath] = process.argv;
  if (!ID.test(runId || '') || !/^[1-9]\d*$/.test(timeoutText || '') || Number(timeoutText) > 3600) {
    fail('VERIFICATION_ARGUMENT_INVALID');
  }
  const ledger = validateLedgerFile(ledgerPath, runId);
  const frozen = ledger.records.filter((record) => record.event_type === 'run_control_state_frozen');
  const previousSource = frozen.at(-1)?.source_ref || '';
  const marker = previousSource.indexOf(':.vulpora/tasks/');
  const previousRef = marker < 0 ? null : previousSource.slice(marker + 1);
  if (!previousRef || frozen.length !== 5
    || nextStatePath !== `.vulpora/tasks/${runId}/run-control-0006.json`) fail('VERIFICATION_STATE_HISTORY_INVALID');
  const previous = readState(previousRef, 'VERIFICATION_PREVIOUS_STATE_INVALID').state;
  if (previous.next_phase !== 'verify' || previous.tasks.length === 0
    || previous.tasks.some((task) => task.status !== 'candidate')) fail('VERIFICATION_TASK_STATE_INVALID');

  const recorder = path.join(__dirname, 'record-execution-command.js');
  const recorded = run(process.execPath, [
    recorder, ledgerPath, runId, 'verify', timeoutText, label, '--', ...process.argv.slice(separator + 1),
  ]);
  if (recorded.stderr) process.stderr.write(recorded.stderr);
  if (recorded.status !== 0) {
    if (recorded.stdout) process.stdout.write(recorded.stdout);
    process.exit(Number.isInteger(recorded.status) ? recorded.status : 1);
  }
  const verification = lastJson(recorded.stdout, 'VERIFICATION_RECORDER_RESULT_INVALID');
  const observedRef = `command-sha256:${verification.command_sha256}:exit:0`;

  const append = path.join(__dirname, 'append-execution-ledger.js');
  const completed = run(process.execPath, [append, ledgerPath], JSON.stringify({
    run_id: runId,
    phase: 'verify',
    event_type: 'verification_recorded',
    status: 'reported',
    source_type: 'agent_claim',
    source_ref: observedRef,
    message: 'Observed verification evidence recorded for all frozen acceptance criteria.',
  }));
  if (completed.status !== 0) fail((completed.stderr || '').trim() || 'VERIFICATION_EVENT_APPEND_FAILED');

  const tasks = previous.tasks.map((task) => ({...task, status: 'verified'}));
  const acceptanceEvidence = previous.acceptance_criteria.map((criterionId) => {
    const task = tasks.find((candidate) => candidate.acceptance_criterion_ids.includes(criterionId));
    if (!task) fail('VERIFICATION_ACCEPTANCE_UNBOUND');
    return {acceptance_criterion_id: criterionId, task_id: task.id,
      verification_outcome: 'pass', observed_ref: observedRef};
  });
  const state = {...previous, current_phase: 'verify', next_phase: 'terminal', tasks,
    acceptance_evidence: acceptanceEvidence, terminal_status: 'complete'};
  const checkpoint = writeCanonicalValue(nextStatePath, state);
  const freezer = path.join(__dirname, 'freeze-run-control.js');
  const frozenResult = run(process.execPath, [freezer, ledgerPath, runId, nextStatePath]);
  if (frozenResult.stderr) process.stderr.write(frozenResult.stderr);
  if (frozenResult.status !== 0) fail('VERIFICATION_CHECKPOINT_FREEZE_FAILED');
  const freeze = lastJson(frozenResult.stdout, 'VERIFICATION_FREEZE_RESULT_INVALID');
  const completedResult = lastJson(completed.stdout, 'VERIFICATION_EVENT_RESULT_INVALID');

  process.stdout.write(`${JSON.stringify({outcome: 'pass', run_id: runId, verification,
    verification_event: completedResult, checkpoint, freeze, observed_ref: observedRef,
    progress_lines: [verification.progress_line, completedResult.progress_line, ...(freeze.progress_lines || [])]})}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error?.code || error?.message || 'VERIFY_AND_FREEZE_FAILED'}\n`);
    process.exit(1);
  }
}
