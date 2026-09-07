#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const pathModule = require('node:path');
const {
  INPUT_FIELDS,
  ZERO_SHA256,
  canonicalJson,
  parseLedger,
  sha256,
  validateProceedDecisionBinding,
  validateEventFields,
  validateNextPhaseEvent,
} = require('./validate-execution-ledger.js');

function reject(code) {
  process.stderr.write(`${code}\n`);
  process.exit(2);
}

function buildRecord(event, sequence, previousSha256) {
  validateEventFields(event, INPUT_FIELDS);
  const unsigned = {...event, previous_sha256: previousSha256, recorded_at: new Date().toISOString(), sequence};
  return {...unsigned, event_sha256: sha256(canonicalJson(unsigned))};
}

function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
    if (written <= 0) throw new Error('LEDGER_WRITE_FAILED');
    offset += written;
  }
}

function appendObservedEvent(path, event) {
  let record;
  if (!fs.existsSync(path)) {
    record = buildRecord(event, 1, ZERO_SHA256);
    const fd = fs.openSync(path, 'wx', 0o600);
    try { writeAll(fd, Buffer.from(`${canonicalJson(record)}\n`)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return record;
  }
  const stat = fs.lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('LEDGER_NOT_REGULAR_FILE');
  const fd = fs.openSync(path, fs.constants.O_RDWR | fs.constants.O_APPEND | (fs.constants.O_NOFOLLOW || 0));
  try {
    const before = fs.fstatSync(fd);
    if (before.dev !== stat.dev || before.ino !== stat.ino) throw new Error('LEDGER_CHANGED_BEFORE_VALIDATION');
    const text = fs.readFileSync(fd, 'utf8');
    const afterRead = fs.fstatSync(fd);
    if (afterRead.size !== before.size || Buffer.byteLength(text) !== before.size) throw new Error('LEDGER_CHANGED_DURING_VALIDATION');
    const existing = parseLedger(text);
    if (existing.runId !== event.run_id) throw new Error('RUN_ID_MISMATCH');
    validateNextPhaseEvent(existing.records, event);
    record = buildRecord(event, existing.records.length + 1, existing.headSha256);
    const beforeWrite = fs.fstatSync(fd);
    if (beforeWrite.size !== before.size || beforeWrite.mtimeMs !== before.mtimeMs) {
      throw new Error('LEDGER_CHANGED_DURING_VALIDATION');
    }
    writeAll(fd, Buffer.from(`${canonicalJson(record)}\n`));
    fs.fsyncSync(fd);
    return record;
  } finally { fs.closeSync(fd); }
}

function resultForRecord(record) {
  return {
    event_sha256: record.event_sha256,
    outcome: 'pass',
    progress_line: `작업 로그: #${record.sequence} ${record.phase}/${record.event_type} — ${record.message} [head ${record.event_sha256.slice(0, 12)}]`,
    seq: record.sequence,
    sequence: record.sequence,
  };
}

const separator = process.argv.indexOf('--');
if (separator < 7 || (separator - 7) % 2 !== 0 || process.argv.length <= separator + 1) {
  reject('USAGE_LEDGER_RUN_PHASE_TIMEOUT_SECONDS_LABEL_OPTIONAL_STDIN_DOUBLE_DASH_COMMAND');
}
const [, , ledgerPath, runId, phase, timeoutText, label] = process.argv;
let stdinPath = null;
let stdinBytes = null;
let stdinSha256 = null;
let commandContract = null;
const seenOptions = new Set();
for (let index = 7; index < separator; index += 2) {
  const option = process.argv[index];
  const value = process.argv[index + 1];
  if (!['--stdin-file', '--contract'].includes(option) || !value || seenOptions.has(option)) reject('INVALID_COMMAND_OPTION');
  seenOptions.add(option);
  if (option === '--stdin-file') stdinPath = value;
  if (option === '--contract') commandContract = value;
}
if (stdinPath !== null) {
  if (pathModule.isAbsolute(stdinPath)) reject('ABSOLUTE_STDIN_PATH');
  const root = process.cwd();
  const absolute = pathModule.resolve(root, stdinPath);
  const relative = pathModule.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${pathModule.sep}`)) reject('STDIN_PATH_OUTSIDE_WORKSPACE');
  let stat;
  try { stat = fs.lstatSync(absolute); } catch { reject('STDIN_FILE_UNREADABLE'); }
  if (!stat.isFile() || stat.isSymbolicLink()) reject('STDIN_NOT_REGULAR_FILE');
  stdinBytes = fs.readFileSync(absolute);
  if (stdinBytes.length === 0 || stdinBytes.length > 1024 * 1024) reject('STDIN_SIZE_INVALID');
  stdinSha256 = crypto.createHash('sha256').update(stdinBytes).digest('hex');
  stdinPath = relative.split(pathModule.sep).join('/');
}
const argv = process.argv.slice(separator + 1);
if (commandContract !== null && commandContract !== 'clarity-gate') reject('INVALID_COMMAND_CONTRACT');
if (commandContract === 'clarity-gate') {
  const expectedStdin = `.vulpora/tasks/${runId}/clarity-projection.json`;
  let requestedValidatorRealPath;
  let bundledValidatorRealPath;
  try {
    requestedValidatorRealPath = fs.realpathSync.native(pathModule.resolve(process.cwd(), argv[1] || ''));
    bundledValidatorRealPath = fs.realpathSync.native(pathModule.join(__dirname, 'validate-clarity-gate.js'));
  } catch {
    reject('CLARITY_GATE_VALIDATOR_UNREADABLE');
  }
  if (phase !== 'approve' || stdinPath !== expectedStdin || argv.length !== 2
    || !/(?:^|\/)node(?:\.exe)?$/.test(argv[0]) || requestedValidatorRealPath !== bundledValidatorRealPath) {
    reject('INVALID_CLARITY_GATE_COMMAND_CONTRACT');
  }
  argv[0] = process.execPath;
  let projection;
  try { projection = JSON.parse(stdinBytes.toString('utf8')); } catch { reject('CLARITY_PROJECTION_JSON_INVALID'); }
  if (projection?.clarity_gate?.skip?.requested === true) {
    let ledger;
    try { ledger = parseLedger(fs.readFileSync(ledgerPath, 'utf8')); } catch { reject('CLARITY_DECISION_LEDGER_UNREADABLE'); }
    try { validateProceedDecisionBinding(ledger.records, {clarity_projection: projection}); } catch {
      reject('CLARITY_DECISION_BINDING_FAILED');
    }
  }
}
if (!/^[1-9]\d*$/.test(timeoutText)) reject('INVALID_TIMEOUT');
const timeoutSeconds = Number(timeoutText);
if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds > 3600) reject('INVALID_TIMEOUT');
if (!label || Buffer.byteLength(label, 'utf8') > 240 || /[\r\n\u0000]/.test(label)) reject('INVALID_LABEL');

const commandSha256 = crypto.createHash('sha256').update(canonicalJson({argv, stdin_sha256: stdinSha256})).digest('hex');
const started = appendObservedEvent(ledgerPath, {
  run_id: runId,
  phase,
  event_type: 'command_started',
  status: 'started',
  source_type: 'runtime_result',
  source_ref: `command-sha256:${commandSha256}:started`,
  message: `Started: ${label}`,
});
process.stderr.write(`${resultForRecord(started).progress_line}\n`);

const result = spawnSync(argv[0], argv.slice(1), {
  env: {
    ...process.env,
    VULPORA_COMMAND_ARGV_JSON: canonicalJson(argv),
    VULPORA_COMMAND_SHA256: commandSha256,
  },
  shell: false,
  stdio: [stdinBytes === null ? 'ignore' : 'pipe', 'inherit', 'inherit'],
  input: stdinBytes === null ? undefined : stdinBytes,
  timeout: timeoutSeconds * 1000,
});

let status = 'failed';
let sourceSuffix;
let exitCode = 1;
if (result.error?.code === 'ETIMEDOUT') {
  status = 'timeout';
  sourceSuffix = 'timeout';
  exitCode = 124;
} else if (result.signal) {
  sourceSuffix = `signal:${result.signal}`;
  exitCode = 1;
} else {
  exitCode = Number.isInteger(result.status) ? result.status : 1;
  sourceSuffix = `exit:${exitCode}`;
  if (exitCode === 0) status = 'passed';
}

const finished = appendObservedEvent(ledgerPath, {
  run_id: runId,
  phase,
  event_type: 'command_finished',
  status,
  source_type: 'runtime_result',
  source_ref: `command-sha256:${commandSha256}:${sourceSuffix}`,
  message: `${status === 'passed' ? 'Passed' : 'Finished'}: ${label} (${sourceSuffix})`,
});
const output = resultForRecord(finished);
process.stderr.write(`${output.progress_line}\n`);
if (status === 'passed' && commandContract === 'clarity-gate') {
  const validated = appendObservedEvent(ledgerPath, {
    run_id: runId,
    phase,
    event_type: 'clarity_gate_validated',
    status: 'passed',
    source_type: 'runtime_result',
    source_ref: `clarity-command-sha256:${commandSha256}:projection-sha256:${stdinSha256}`,
    message: 'Clarity gate validator passed for the frozen projection.',
  });
  process.stderr.write(`${resultForRecord(validated).progress_line}\n`);
}
process.stdout.write(`${canonicalJson({...output, command_sha256: commandSha256, exit_code: exitCode, stdin_path: stdinPath, stdin_sha256: stdinSha256})}\n`);
process.exit(exitCode);
