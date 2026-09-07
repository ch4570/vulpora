#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {validateLedgerFile} = require('./validate-execution-ledger.js');

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function append(script, ledgerPath, event) {
  const result = spawnSync(process.execPath, [script, ledgerPath], {
    cwd: process.cwd(), encoding: 'utf8', input: JSON.stringify(event), shell: false,
  });
  if (result.status !== 0) fail((result.stderr || '').trim() || 'RUN_INITIALIZATION_APPEND_FAILED');
  try { return JSON.parse(result.stdout); } catch { fail('RUN_INITIALIZATION_RESULT_INVALID'); }
}

function main() {
  if (process.argv.length !== 6) fail('USAGE_LEDGER_RUN_INSTANCE_CONFIGURATION');
  const [, , ledgerPath, runId, instanceId, configurationId] = process.argv;
  if (!ID.test(runId || '') || !ID.test(instanceId || '') || !SHA256.test(configurationId || '')) {
    fail('RUN_INITIALIZATION_ID_INVALID');
  }
  const expected = `.vulpora/tasks/${runId}/execution-ledger.jsonl`;
  if (path.isAbsolute(ledgerPath || '') || ledgerPath !== expected || fs.existsSync(ledgerPath)) {
    fail('RUN_INITIALIZATION_LEDGER_PATH_INVALID');
  }
  let parent;
  try { parent = fs.lstatSync(path.dirname(ledgerPath)); } catch { fail('RUN_INITIALIZATION_DIRECTORY_INVALID'); }
  if (!parent.isDirectory() || parent.isSymbolicLink()) fail('RUN_INITIALIZATION_DIRECTORY_INVALID');

  const script = path.join(__dirname, 'append-execution-ledger.js');
  const phaseStarted = append(script, ledgerPath, {
    run_id: runId,
    phase: 'clarify',
    event_type: 'phase_started',
    status: 'reported',
    source_type: 'agent_claim',
    source_ref: 'agent:primary',
    message: 'Clarification phase started.',
  });
  const initialized = append(script, ledgerPath, {
    run_id: runId,
    phase: 'clarify',
    event_type: 'run_initialized',
    status: 'reported',
    source_type: 'agent_claim',
    source_ref: `runtime-instance:${instanceId}:configuration:${configurationId}`,
    message: 'Run initialized with immutable runtime identity.',
  });
  const ledger = validateLedgerFile(ledgerPath, runId);
  if (ledger.records.length !== 2) fail('RUN_INITIALIZATION_LEDGER_INVALID');
  process.stdout.write(`${JSON.stringify({
    outcome: 'pass', run_id: runId, record_count: 2, head_sha256: ledger.headSha256,
    progress_lines: [phaseStarted.progress_line, initialized.progress_line],
  })}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error?.code || error?.message || 'RUN_INITIALIZATION_FAILED'}\n`);
    process.exit(1);
  }
}
