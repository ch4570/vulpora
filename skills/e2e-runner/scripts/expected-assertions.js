'use strict';

// Shared grammar and evaluator for catalog `Expected` cells (CONTRACT.md §1).
// The leading status and every `assert` clause are machine-checked; free text is guidance only.

const SCALAR = '"[^"\\\\]*"|-?\\d+(?:\\.\\d+)?|true|false|null';
const LITERAL = `${SCALAR}|\\{\\{(?:prev|seed)\\.[A-Z][A-Z0-9_-]*\\}\\}|\\[(?:\\s*(?:${SCALAR})\\s*(?:,\\s*(?:${SCALAR})\\s*)*)?\\]`;
const PATH = '\\$(?:\\.[A-Za-z_][A-Za-z0-9_-]*|\\[\\d+\\]|\\[\\*\\])*';
const ASSERTION = new RegExp(`^assert (${PATH}) (?:(==|!=|contains|excludes) (${LITERAL})|(exists|absent|non-empty))$`);

class ExpectedError extends Error {}

function clauses(expected) {
  // Inline-code wrappers are presentation only: `204` and 204 are the same status.
  return String(expected).replace(/`/g, '').split(';').map((clause) => clause.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

function parseExpected(expected, vars = {}) {
  const parts = clauses(expected);
  const status = parts[0]?.match(/^(\d{3})\b/)?.[1] ?? null;
  const assertions = parts.filter((clause) => /^assert\b/.test(clause)).map((clause) => {
    const match = clause.match(ASSERTION);
    if (!match) throw new ExpectedError(`unsupported assertion: ${clause}`);
    let literal;
    if (match[3] !== undefined) {
      const placeholder = match[3].match(/^\{\{((?:prev|seed)\.[A-Z][A-Z0-9_-]*)\}\}$/);
      if (placeholder) {
        if (!Object.hasOwn(vars, placeholder[1])) throw new ExpectedError(`missing-capture: ${placeholder[1]}`);
        literal = vars[placeholder[1]];
      } else literal = JSON.parse(match[3]);
    }
    return {clause, path: match[1], operator: match[2] ?? match[4], literal};
  });
  return {status, assertions};
}

function resolve(value, jsonPath) {
  // `[*]` projects over an array; a projection with any missing element is unresolved (fail closed).
  let projected = false;
  let current = [value];
  for (const segment of jsonPath.slice(1).match(/\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\]|\[\*\]/g) || []) {
    const next = [];
    for (const item of current) {
      if (segment === '[*]') {
        if (!Array.isArray(item)) return undefined;
        next.push(...item);
        continue;
      }
      if (item === null || typeof item !== 'object') return undefined;
      const key = segment.startsWith('.') ? segment.slice(1) : Number(segment.slice(1, -1));
      if (Array.isArray(item) !== (typeof key === 'number') || !Object.hasOwn(item, key)) return undefined;
      next.push(item[key]);
    }
    if (segment === '[*]') projected = true;
    current = next;
  }
  return projected ? current : current[0];
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function check({operator, literal}, actual) {
  switch (operator) {
    case '==': return actual !== undefined && same(actual, literal);
    case '!=': return actual !== undefined && !same(actual, literal);
    case 'exists': return actual !== undefined;
    case 'absent': return actual === undefined;
    case 'non-empty':
      return (Array.isArray(actual) || typeof actual === 'string') ? actual.length > 0
        : actual !== null && typeof actual === 'object' && Object.keys(actual).length > 0;
    case 'contains':
    case 'excludes': {
      // A missing or scalar value cannot prove membership either way.
      let member;
      if (Array.isArray(actual)) member = actual.some((item) => same(item, literal));
      else if (typeof actual === 'string' && typeof literal === 'string') member = actual.includes(literal);
      else return false;
      return operator === 'contains' ? member : !member;
    }
    default: return false;
  }
}

// Returns {outcome, assertions[]}. outcome is PASS, FAIL, or NO_ASSERTION; a scenario
// that compared nothing must never be reported as PASS.
function evaluateExpected(expected, httpStatus, bodyText, vars = {}) {
  const parsed = parseExpected(expected, vars);
  const results = [];
  if (parsed.status !== null) {
    const actual = httpStatus == null ? null : String(httpStatus);
    results.push({kind: 'status', expected: parsed.status, actual, passed: parsed.status === actual});
  }
  let body;
  let bodyParsed = false;
  if (parsed.assertions.length > 0) {
    try { body = JSON.parse(bodyText); bodyParsed = true; } catch { body = undefined; }
  }
  for (const assertion of parsed.assertions) {
    const actual = bodyParsed ? resolve(body, assertion.path) : undefined;
    results.push({
      kind: 'body', clause: assertion.clause, expected: assertion.literal ?? assertion.operator,
      actual: actual ?? null, passed: bodyParsed && check(assertion, actual),
    });
  }
  const outcome = results.length === 0 ? 'NO_ASSERTION' : results.every((result) => result.passed) ? 'PASS' : 'FAIL';
  return {outcome, bodyParsed: parsed.assertions.length === 0 ? null : bodyParsed, assertions: results};
}

module.exports = {ASSERTION, ExpectedError, clauses, evaluateExpected, parseExpected};
