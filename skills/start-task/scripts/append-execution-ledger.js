#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const pathModule = require('node:path');
const {
  INPUT_FIELDS,
  ZERO_SHA256,
  canonicalJson,
  parseLedger,
  sha256,
  validateEventFields,
  validateNextPhaseEvent,
} = require('./validate-execution-ledger.js');

const MAX_INPUT_BYTES = 16 * 1024;

function fail(code, detail) {
  const suffix = detail === undefined ? '' : `:${String(detail).replace(/[\r\n]/g, ' ')}`;
  const error = new Error(`${code}${suffix}`);
  error.code = code;
  throw error;
}

function reject(error) {
  process.stderr.write(`${error && error.message ? error.message : 'LEDGER_APPEND_FAILED'}\n`);
  process.exit(1);
}

function readInput() {
  let bytes;
  try {
    bytes = fs.readFileSync(0);
  } catch {
    fail('INPUT_READ_FAILED');
  }
  if (bytes.length === 0) fail('EMPTY_INPUT');
  if (bytes.length > MAX_INPUT_BYTES) fail('INPUT_TOO_LARGE');

  let event;
  try {
    event = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('INVALID_INPUT_JSON');
  }
  validateEventFields(event, INPUT_FIELDS, {callerInput: true});
  return event;
}

function prepareCallerEvent(event) {
  if (event.source_type === 'runtime_result') fail('TRUSTED_RECORDER_REQUIRED');
  if (event.source_type === 'user_decision' && event.status !== 'reported') {
    fail('USER_DECISION_MUST_BE_REPORTED');
  }
  if (event.source_type !== 'filesystem_digest') return event;
  if (event.status !== 'passed') fail('FILESYSTEM_DIGEST_MUST_PASS');
  if (pathModule.isAbsolute(event.source_ref)) fail('ABSOLUTE_EVIDENCE_PATH');
  const root = process.cwd();
  const absolute = pathModule.resolve(root, event.source_ref);
  const relative = pathModule.relative(root, absolute);
  if (!relative || relative.startsWith(`..${pathModule.sep}`) || relative === '..') fail('EVIDENCE_PATH_OUTSIDE_WORKSPACE');
  let stat;
  try { stat = fs.lstatSync(absolute); } catch { fail('EVIDENCE_FILE_UNREADABLE'); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('EVIDENCE_NOT_REGULAR_FILE');
  const digest = require('node:crypto').createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  return {...event, source_ref: `file-sha256:${digest}:${relative.split(pathModule.sep).join('/')}`};
}

function buildRecord(event, sequence, previousSha256) {
  const unsignedRecord = {
    ...event,
    previous_sha256: previousSha256,
    recorded_at: new Date().toISOString(),
    sequence,
  };
  return {
    ...unsignedRecord,
    event_sha256: sha256(canonicalJson(unsignedRecord)),
  };
}

function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
    if (written <= 0) fail('LEDGER_WRITE_FAILED');
    offset += written;
  }
}

function createLedger(path, event) {
  const record = buildRecord(event, 1, ZERO_SHA256);
  const bytes = Buffer.from(`${canonicalJson(record)}\n`, 'utf8');
  let fd;
  try {
    fd = fs.openSync(path, 'wx', 0o600);
  } catch (error) {
    if (error && error.code === 'EEXIST') return null;
    fail('LEDGER_CREATE_FAILED', error && error.code);
  }

  try {
    writeAll(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return record;
}

function appendLedger(path, event) {
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
    fd = fs.openSync(path, fs.constants.O_RDWR | fs.constants.O_APPEND | noFollow);
  } catch (error) {
    fail('LEDGER_OPEN_FAILED', error && error.code);
  }

  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.dev !== stat.dev || before.ino !== stat.ino) {
      fail('LEDGER_CHANGED_BEFORE_VALIDATION');
    }
    const text = fs.readFileSync(fd, 'utf8');
    const afterRead = fs.fstatSync(fd);
    if (afterRead.size !== before.size || Buffer.byteLength(text, 'utf8') !== before.size) {
      fail('LEDGER_CHANGED_DURING_VALIDATION');
    }

    const existing = parseLedger(text);
    if (existing.runId !== event.run_id) fail('RUN_ID_MISMATCH');
    validateNextPhaseEvent(existing.records, event);
    const record = buildRecord(event, existing.records.length + 1, existing.headSha256);
    const bytes = Buffer.from(`${canonicalJson(record)}\n`, 'utf8');

    const beforeWrite = fs.fstatSync(fd);
    if (beforeWrite.size !== before.size || beforeWrite.mtimeMs !== before.mtimeMs) {
      fail('LEDGER_CHANGED_DURING_VALIDATION');
    }
    writeAll(fd, bytes);
    fs.fsyncSync(fd);
    return record;
  } finally {
    fs.closeSync(fd);
  }
}

function appendEvent(path, event) {
  validateEventFields(event, INPUT_FIELDS);
  let record = createLedger(path, event);
  if (record === null) record = appendLedger(path, event);
  return record;
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

function main() {
  if (process.argv.length !== 3 || process.argv[2].length === 0) fail('USAGE_LEDGER_PATH');
  const event = prepareCallerEvent(readInput());
  const record = appendEvent(process.argv[2], event);
  process.stdout.write(`${canonicalJson(resultForRecord(record))}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    reject(error);
  }
}
