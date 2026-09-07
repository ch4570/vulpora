#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {validateLedgerFile} = require('./validate-execution-ledger.js');
const {readState, stateReference, validateState} = require('./validate-run-control.js');

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function confinedRelative(input, expected) {
  if (!input || path.isAbsolute(input) || input.includes('\0')) fail('PATH_INVALID');
  const normalized = input.split(/[\\/]/).join('/');
  if (normalized.split('/').some((part) => part === '' || part === '.' || part === '..') || normalized !== expected) {
    fail('PATH_CONTRACT_MISMATCH');
  }
  return normalized;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    input: options.input,
    shell: false,
  });
}

function parseResult(text, code) {
  const line = text.trim().split(/\r?\n/).filter(Boolean).at(-1);
  try { return JSON.parse(line); } catch { fail(code); }
}

function main() {
  if (process.argv.length !== 5) fail('USAGE_LEDGER_RUN_NEXT_STATE');
  const [, , ledgerInput, runId, nextInput] = process.argv;
  if (!ID.test(runId || '')) fail('RUN_ID_INVALID');
  const ledgerPath = confinedRelative(ledgerInput, `.vulpora/tasks/${runId}/execution-ledger.jsonl`);
  if (!new RegExp(`^\\.vulpora/tasks/${runId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/run-control-\\d{4}\\.json$`).test(nextInput || '')) {
    fail('NEXT_STATE_PATH_INVALID');
  }
  const nextPath = confinedRelative(nextInput, nextInput);
  const nextFile = readState(nextPath, 'NEXT_STATE_UNREADABLE');
  validateState(nextFile.state);
  if (nextFile.state.run_id !== runId) fail('NEXT_STATE_RUN_ID_MISMATCH');
  const nextReference = stateReference(nextPath, runId, nextFile.bytes);

  const ledger = validateLedgerFile(ledgerPath, runId);
  const frozen = ledger.records.filter((record) => record.event_type === 'run_control_state_frozen');
  if (nextReference.index !== frozen.length + 1) fail('NEXT_STATE_INDEX_INVALID');
  if (frozen.some((record) => record.source_ref.endsWith(`:${nextReference.path}`))) fail('NEXT_STATE_ALREADY_FROZEN');
  const previousPath = frozen.length === 0
    ? '-'
    : frozen.at(-1).source_ref.match(/:(\.vulpora\/tasks\/[^\r\n]+\/run-control-\d{4}\.json)$/)?.[1];
  if (!previousPath) fail('PREVIOUS_STATE_REFERENCE_INVALID');

  const recorder = path.join(__dirname, 'record-execution-command.js');
  const validator = path.relative(process.cwd(), path.join(__dirname, 'validate-run-control.js'));
  const recorded = run(process.execPath, [
    recorder,
    ledgerPath,
    runId,
    nextFile.state.current_phase,
    '60',
    `run-control-${String(nextReference.index).padStart(4, '0')} validation`,
    '--',
    'node',
    validator,
    previousPath,
    nextPath,
    ledgerPath,
    ledger.headSha256,
    String(ledger.records.length),
  ]);
  if (recorded.stderr) process.stderr.write(recorded.stderr);
  if (recorded.status !== 0) {
    if (recorded.stdout) process.stdout.write(recorded.stdout);
    process.exit(Number.isInteger(recorded.status) ? recorded.status : 1);
  }

  const append = path.join(__dirname, 'append-execution-ledger.js');
  const frozenEvent = {
    run_id: runId,
    phase: nextFile.state.current_phase,
    event_type: 'run_control_state_frozen',
    status: 'passed',
    source_type: 'filesystem_digest',
    source_ref: nextPath,
    message: `Run control ${String(nextReference.index).padStart(4, '0')} frozen.`,
  };
  const appended = run(process.execPath, [append, ledgerPath], {input: JSON.stringify(frozenEvent)});
  if (appended.stderr) process.stderr.write(appended.stderr);
  if (appended.status !== 0) {
    if (appended.stdout) process.stdout.write(appended.stdout);
    process.exit(Number.isInteger(appended.status) ? appended.status : 1);
  }

  const validation = parseResult(recorded.stdout, 'RECORDER_RESULT_INVALID');
  const freeze = parseResult(appended.stdout, 'FREEZE_RESULT_INVALID');
  process.stdout.write(`${JSON.stringify({
    outcome: 'pass',
    run_id: runId,
    transition: `${nextFile.state.current_phase}->${nextFile.state.next_phase}`,
    checkpoint: {path: nextReference.path, sha256: nextReference.sha256, index: nextReference.index},
    validation,
    freeze,
    progress_lines: [freeze.progress_line],
  })}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error?.code || error?.message || 'RUN_CONTROL_FREEZE_FAILED'}\n`);
    process.exit(1);
  }
}
