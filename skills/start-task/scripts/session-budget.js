'use strict';

// This is a local admission budget, not a provider billing limit. Reserve before
// dispatch; reconcile only the bound attempt's observed runtime usage afterward.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {canonical, hash, regularFile, parseJson} = require('./model-routing-io.js');

const SCHEMA = 'vulpora.session-budget/v1';
const MAX_COUNT = 1e9;
const MAX_ATTEMPTS = 10000;
const MAX_BYTES = 8 * 1024 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && ID.test(value);
const digest = value => typeof value === 'string' && DIGEST.test(value);
const fail = code => { throw Object.assign(new Error(code), {code}); };

function fields(value, required, optional = [], code = 'BUDGET_INVALID_REQUEST') {
  if (!object(value) || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail(code);
}
function count(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum && value <= MAX_COUNT;
}
function limits(value, code = 'BUDGET_INVALID_LIMITS') {
  fields(value, ['totalTokens', 'maxRelativeUnits'], [], code);
  if (!count(value.totalTokens, 1) || !count(value.maxRelativeUnits, 1)) fail(code);
  return {totalTokens: value.totalTokens, maxRelativeUnits: value.maxRelativeUnits};
}
function add(left, right) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail('BUDGET_INTEGER_OVERFLOW');
  return result;
}

function checkedPath(filename, allowMissing = false) {
  if (typeof filename !== 'string' || !filename || filename.includes('\0')) fail('BUDGET_INVALID_PATH');
  const absolute = path.resolve(filename);
  let cursor = path.parse(absolute).root;
  const parts = absolute.slice(cursor.length).split(path.sep);
  for (let index = 0; index < parts.length; index++) {
    cursor = path.join(cursor, parts[index]);
    let stat;
    try { stat = fs.lstatSync(cursor); }
    catch (error) {
      if (error.code === 'ENOENT' && index === parts.length - 1 && allowMissing) return absolute;
      if (error.code === 'ENOENT') fail('BUDGET_NOT_FOUND');
      throw error;
    }
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) {
      fail('BUDGET_UNSAFE_PATH');
    }
  }
  return absolute;
}

function withLock(filename, operation) {
  const absolute = checkedPath(filename, true);
  const lock = `${absolute}.lock`;
  try { fs.mkdirSync(lock, {mode: 0o700}); }
  catch (error) { if (error.code === 'EEXIST') fail('BUDGET_BUSY'); throw error; }
  const identity = fs.lstatSync(lock);
  try {
    checkedPath(absolute, true);
    return operation(absolute);
  } finally {
    // Never steal a stale lock or delete a replacement owned by another process.
    const current = fs.lstatSync(lock);
    if (current.isSymbolicLink() || !current.isDirectory()
      || current.dev !== identity.dev || current.ino !== identity.ino) fail('BUDGET_LOCK_CHANGED');
    fs.rmdirSync(lock);
  }
}

function normalizedUsage(value) {
  if (!object(value)) return null;
  const required = ['source', 'inputTokens', 'outputTokens'];
  const optional = ['cachedInputTokens', 'reasoningTokens', 'scope', 'measurementKind', 'reasoningSemantics'];
  if (required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))
    || value.source !== 'codex-jsonl:turn.completed'
    || !count(value.inputTokens) || !count(value.outputTokens)
    || (value.cachedInputTokens != null && (!count(value.cachedInputTokens) || value.cachedInputTokens > value.inputTokens))
    || (value.reasoningTokens != null && !count(value.reasoningTokens))
    || (value.scope !== undefined && value.scope !== 'single_turn')
    || (value.measurementKind !== undefined && value.measurementKind !== 'provider_observed')
    || (value.reasoningSemantics !== undefined && value.reasoningSemantics !== 'provider_reported_not_added')) return null;
  return {source: value.source, inputTokens: value.inputTokens, outputTokens: value.outputTokens,
    cachedInputTokens: value.cachedInputTokens ?? null, reasoningTokens: value.reasoningTokens ?? null,
    scope: 'single_turn', measurementKind: 'provider_observed', reasoningSemantics: 'provider_reported_not_added'};
}

function snapshot(state) {
  let committedTokens = 0, reservedTokens = 0, spentRelativeUnits = 0, reservedRelativeUnits = 0, unresolvedAttempts = 0;
  for (const attempt of state.attempts) {
    if (attempt.state === 'settled') {
      // Cached input is included in input. Reasoning is already in output.
      committedTokens = add(committedTokens, add(attempt.usage.inputTokens, attempt.usage.outputTokens));
      spentRelativeUnits = add(spentRelativeUnits, attempt.relativeUnits);
    } else {
      reservedTokens = add(reservedTokens, attempt.estimatedTokens);
      reservedRelativeUnits = add(reservedRelativeUnits, attempt.relativeUnits);
      if (attempt.state === 'unresolved') unresolvedAttempts++;
    }
  }
  const tokenBalance = state.limits.totalTokens - add(committedTokens, reservedTokens);
  const unitBalance = state.limits.maxRelativeUnits - add(spentRelativeUnits, reservedRelativeUnits);
  return {schema: SCHEMA, id: state.id, limits: {...state.limits}, committedTokens, reservedTokens,
    remainingTokens: Math.max(0, tokenBalance), spentRelativeUnits, reservedRelativeUnits,
    remainingRelativeUnits: Math.max(0, unitBalance), overdrawn: tokenBalance < 0 || unitBalance < 0, unresolvedAttempts};
}

function validateState(state) {
  const code = 'BUDGET_INVALID_FILE';
  fields(state, ['schema', 'id', 'limits', 'attempts'], [], code);
  if (state.schema !== SCHEMA || !identifier(state.id)
    || !Array.isArray(state.attempts) || state.attempts.length > MAX_ATTEMPTS) fail(code);
  limits(state.limits, code);
  const ids = new Set();
  for (const attempt of state.attempts) {
    fields(attempt, ['attemptId', 'capsuleSha256', 'estimatedTokens', 'relativeUnits', 'state', 'usage', 'usageSha256'], [], code);
    if (!identifier(attempt.attemptId) || !digest(attempt.capsuleSha256)
      || !count(attempt.estimatedTokens, 1) || !count(attempt.relativeUnits, 1)
      || attempt.estimatedTokens > state.limits.totalTokens || attempt.relativeUnits > state.limits.maxRelativeUnits
      || !['reserved', 'unresolved', 'settled'].includes(attempt.state) || ids.has(attempt.attemptId)) fail(code);
    ids.add(attempt.attemptId);
    if (attempt.state === 'settled') {
      const usage = normalizedUsage(attempt.usage);
      if (!usage || canonical(usage) !== canonical(attempt.usage)
        || attempt.usageSha256 !== hash(canonical(usage))) fail(code);
    } else if (attempt.usage !== null || attempt.usageSha256 !== null) fail(code);
  }
  snapshot(state); // Reject arithmetic corruption before reading or mutating.
  return state;
}

function loadState(filename) {
  const absolute = checkedPath(filename);
  let bytes, state;
  try { bytes = regularFile(absolute, MAX_BYTES); state = parseJson(bytes.toString('utf8')); }
  catch (error) {
    if (error.message === 'FILE_CHANGED') fail('BUDGET_FILE_CHANGED');
    fail('BUDGET_INVALID_FILE');
  }
  if (canonical(state) !== bytes.toString('utf8')) fail('BUDGET_INVALID_FILE');
  return validateState(state);
}

function atomicWrite(filename, state, initial = false) {
  const bytes = canonical(validateState(state));
  if (Buffer.byteLength(bytes) > MAX_BYTES) fail('BUDGET_FILE_LIMIT');
  const directory = path.dirname(filename);
  const temporary = path.join(directory, `.${path.basename(filename)}.${crypto.randomUUID()}.tmp`);
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  try {
    if (initial) {
      // link publishes complete bytes atomically and refuses an existing target;
      // rename alone would permit an accidental initial-budget reset.
      try { fs.linkSync(temporary, filename); }
      catch (error) { if (error.code === 'EEXIST') fail('BUDGET_ALREADY_EXISTS'); throw error; }
      fs.unlinkSync(temporary);
    } else {
      checkedPath(filename);
      fs.renameSync(temporary, filename);
    }
    const parent = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function requestBinding(request, extra) {
  fields(request, ['budgetId', 'attemptId', 'capsuleSha256', ...extra]);
  if (!identifier(request.budgetId) || !identifier(request.attemptId) || !digest(request.capsuleSha256)) {
    fail('BUDGET_INVALID_REQUEST');
  }
}
function initBudget(filename, requestedLimits) {
  const selectedLimits = limits(requestedLimits);
  return withLock(filename, absolute => {
    if (fs.existsSync(absolute)) fail('BUDGET_ALREADY_EXISTS');
    const state = {schema: SCHEMA, id: crypto.randomUUID(), limits: selectedLimits, attempts: []};
    atomicWrite(absolute, state, true);
    return snapshot(state);
  });
}
function readBudget(filename) { return snapshot(loadState(filename)); }
function reserveBudget(filename, request) {
  requestBinding(request, ['estimatedTokens', 'relativeUnits']);
  if (!count(request.estimatedTokens, 1) || !count(request.relativeUnits, 1)) fail('BUDGET_INVALID_RESERVATION');
  return withLock(filename, absolute => {
    const state = loadState(absolute);
    if (state.id !== request.budgetId) fail('BUDGET_ID_MISMATCH');
    if (state.attempts.some(attempt => attempt.attemptId === request.attemptId)) fail('BUDGET_ATTEMPT_ALREADY_RESERVED');
    const before = snapshot(state);
    if (before.overdrawn) fail('BUDGET_OVERDRAWN');
    if (before.unresolvedAttempts) fail('BUDGET_USAGE_UNRESOLVED');
    if (request.estimatedTokens > before.remainingTokens || request.relativeUnits > before.remainingRelativeUnits) {
      fail('BUDGET_EXCEEDED');
    }
    if (state.attempts.length >= MAX_ATTEMPTS) fail('BUDGET_ATTEMPT_LIMIT');
    state.attempts.push({attemptId: request.attemptId, capsuleSha256: request.capsuleSha256,
      estimatedTokens: request.estimatedTokens, relativeUnits: request.relativeUnits,
      state: 'reserved', usage: null, usageSha256: null});
    atomicWrite(absolute, state);
    return snapshot(state);
  });
}
function settleBudget(filename, request) {
  requestBinding(request, ['usage']);
  return withLock(filename, absolute => {
    const state = loadState(absolute);
    if (state.id !== request.budgetId) fail('BUDGET_ID_MISMATCH');
    const attempt = state.attempts.find(item => item.attemptId === request.attemptId);
    if (!attempt) fail('BUDGET_ATTEMPT_NOT_FOUND');
    if (attempt.capsuleSha256 !== request.capsuleSha256) fail('BUDGET_ATTEMPT_BINDING_MISMATCH');
    const usage = normalizedUsage(request.usage);
    if (attempt.state === 'settled') {
      if (!usage || attempt.usageSha256 !== hash(canonical(usage))) fail('BUDGET_SETTLEMENT_CONFLICT');
      return snapshot(state);
    }
    if (usage) {
      attempt.state = 'settled'; attempt.usage = usage; attempt.usageSha256 = hash(canonical(usage));
    } else {
      // No usage evidence is not zero usage. Keep all reserved capacity until a
      // later trusted observation reconciles this exact attempt and capsule.
      if (attempt.state === 'unresolved') return snapshot(state);
      attempt.state = 'unresolved';
    }
    atomicWrite(absolute, state);
    return snapshot(state);
  });
}

module.exports = {initBudget, readBudget, reserveBudget, settleBudget};
