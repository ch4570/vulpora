#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {canonicalJson} = require('./validate-execution-ledger.js');

const MAX_INPUT_BYTES = 1024 * 1024;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function confinedTarget(input) {
  if (!input || path.isAbsolute(input) || input.includes('\0')) fail('TARGET_PATH_INVALID');
  const segments = input.split(/[\\/]/);
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) fail('TARGET_PATH_INVALID');
  if (segments[0] !== '.vulpora' || segments[1] !== 'tasks' || !RUN_ID.test(segments[2] || '')
    || segments.length < 4) fail('TARGET_PATH_OUTSIDE_RUN');

  const root = fs.realpathSync.native(process.cwd());
  const absolute = path.resolve(root, ...segments);
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) fail('TARGET_PATH_OUTSIDE_WORKSPACE');

  let cursor = root;
  for (const segment of segments.slice(0, -1)) {
    cursor = path.join(cursor, segment);
    let stat;
    try { stat = fs.lstatSync(cursor); } catch { fail('TARGET_PARENT_UNREADABLE'); }
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('TARGET_PARENT_UNTRUSTED');
  }
  const parent = fs.realpathSync.native(path.dirname(absolute));
  const parentRelative = path.relative(root, parent);
  if (!parentRelative || parentRelative === '..' || parentRelative.startsWith(`..${path.sep}`)) {
    fail('TARGET_PARENT_OUTSIDE_WORKSPACE');
  }
  return {absolute, relative: segments.join('/')};
}

function readCanonicalBytes() {
  let input;
  try { input = fs.readFileSync(0); } catch { fail('INPUT_READ_FAILED'); }
  if (input.length === 0) fail('EMPTY_INPUT');
  if (input.length > MAX_INPUT_BYTES) fail('INPUT_TOO_LARGE');
  let value;
  try { value = JSON.parse(input.toString('utf8')); } catch { fail('INVALID_INPUT_JSON'); }
  let text;
  try { text = canonicalJson(value); } catch { fail('INPUT_NOT_CANONICALIZABLE'); }
  return Buffer.from(text, 'utf8');
}

function writeExclusive(target, bytes) {
  let fd;
  try { fd = fs.openSync(target, 'wx', 0o600); } catch (error) {
    fail(error?.code === 'EEXIST' ? 'TARGET_ALREADY_EXISTS' : 'TARGET_CREATE_FAILED');
  }
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
      if (written <= 0) fail('TARGET_WRITE_FAILED');
      offset += written;
    }
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  const reread = fs.readFileSync(target);
  if (!reread.equals(bytes)) fail('TARGET_REREAD_MISMATCH');
  return reread;
}

function writeCanonicalValue(targetInput, value) {
  const target = confinedTarget(targetInput);
  let bytes;
  try { bytes = Buffer.from(canonicalJson(value), 'utf8'); } catch { fail('INPUT_NOT_CANONICALIZABLE'); }
  const written = writeExclusive(target.absolute, bytes);
  return {
    outcome: 'pass',
    path: target.relative,
    sha256: crypto.createHash('sha256').update(written).digest('hex'),
    bytes: written.length,
  };
}

function main() {
  if (process.argv.length !== 3) fail('USAGE_TARGET_PATH');
  const bytes = readCanonicalBytes();
  const value = JSON.parse(bytes.toString('utf8'));
  process.stdout.write(`${JSON.stringify(writeCanonicalValue(process.argv[2], value))}\n`);
}

module.exports = {writeCanonicalValue};

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error?.code || error?.message || 'CANONICAL_WRITE_FAILED'}\n`);
    process.exit(1);
  }
}
