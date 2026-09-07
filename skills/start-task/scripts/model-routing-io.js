'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fail = code => { throw new Error(code); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  if (typeof value === 'number' && !Number.isFinite(value)) fail('NONFINITE_NUMBER');
  return JSON.stringify(value);
}
function regularFile(filename, maxBytes) {
  const absolute = path.resolve(filename);
  let current = path.parse(absolute).root;
  let before;
  for (const part of absolute.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    before = fs.lstatSync(current);
    if (before.isSymbolicLink()) fail('SYMLINK_INPUT');
  }
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) fail('INVALID_FILE');
    if (stat.dev !== before.dev || stat.ino !== before.ino || fs.realpathSync(absolute) !== absolute) fail('FILE_CHANGED');
    const chunks = []; let total = 0;
    const buffer = Buffer.alloc(Math.min(65536, maxBytes + 1));
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, maxBytes - total + 1), null);
      if (count === 0) break;
      total += count;
      if (total > maxBytes) fail('INVALID_FILE');
      chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    const after = fs.fstatSync(fd), named = fs.lstatSync(absolute);
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || named.dev !== stat.dev
        || named.ino !== stat.ino || fs.realpathSync(absolute) !== absolute) fail('FILE_CHANGED');
    return Buffer.concat(chunks, total);
  } finally { fs.closeSync(fd); }
}
function parseJson(text) {
  // JSON.parse checks syntax, but silently accepts shadowed keys. Walk its
  // already-valid token stream to reject duplicate (including escaped) keys.
  const value = JSON.parse(text);
  const tokens = text.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/g);
  let index = 0;
  function walk(depth) {
    if (depth > 64) fail('JSON_DEPTH_LIMIT');
    const token = tokens[index++];
    if (token === '{') {
      const keys = new Set();
      while (tokens[index] !== '}') {
        const key = JSON.parse(tokens[index++]);
        if (keys.has(key)) fail('DUPLICATE_JSON_KEY');
        keys.add(key); index++; walk(depth + 1);
        if (tokens[index] === ',') index++;
      }
      index++;
    } else if (token === '[') {
      while (tokens[index] !== ']') {
        walk(depth + 1);
        if (tokens[index] === ',') index++;
      }
      index++;
    }
  }
  walk(0);
  return value;
}
module.exports = { hash, canonical, regularFile, parseJson };
