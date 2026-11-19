'use strict';

// CONTRACT.md §7 mask classes, applied before any evidence is written.
// Callers pass project-declared sensitive keys (CONTRACT.md §7 amendments) as `extraKeys`.

const SENSITIVE_KEY = /(?:authorization|cookie|session|token|password|passwd|secret|api[-_]?key|access[-_]?key|private[-_]?key|credential)/i;
const SHAPES = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, // email
  /\b01[016789]-?\d{3,4}-?\d{4}\b/g, // KR mobile phone
  /\b\d{6}-?[1-4]\d{6}\b/g, // resident registration number
];
const MASK = '***';

function sensitiveKey(key, extraKeys = []) {
  return SENSITIVE_KEY.test(key) || extraKeys.includes(key);
}

function maskText(text) {
  return SHAPES.reduce((value, shape) => value.replace(shape, MASK), String(text));
}

function maskValue(value, extraKeys = [], key = '') {
  if (key && sensitiveKey(key, extraKeys) && value !== null && value !== '' && typeof value !== 'object') return MASK;
  if (Array.isArray(value)) return value.map((item) => maskValue(item, extraKeys));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, maskValue(item, extraKeys, name)]));
  }
  return typeof value === 'string' ? maskText(value) : value;
}

// Mask a response body: structurally when it is JSON, by shape otherwise.
function maskBody(text, extraKeys = []) {
  try { return JSON.stringify(maskValue(JSON.parse(text), extraKeys), null, 2); } catch { return maskText(text); }
}

// Return the JSON paths whose values are still unmasked secrets or PII shapes.
function findUnmasked(value, extraKeys = [], at = '$', key = '') {
  if (key && sensitiveKey(key, extraKeys) && typeof value === 'string' && value !== '' && value !== MASK) return [at];
  if (Array.isArray(value)) return value.flatMap((item, index) => findUnmasked(item, extraKeys, `${at}[${index}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([name, item]) => findUnmasked(item, extraKeys, `${at}.${name}`, name));
  }
  return typeof value === 'string' && maskText(value) !== value ? [at] : [];
}

module.exports = {MASK, findUnmasked, maskBody, maskText, maskValue};
