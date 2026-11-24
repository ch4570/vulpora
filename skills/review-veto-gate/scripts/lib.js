'use strict';

// Shared, deterministic helpers for the review-veto-gate scripts. No model, no network, no repository execution.

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const SEVERITY_RANK = Object.fromEntries(SEVERITIES.map((name, index) => [name, index]));
const CONFIDENCE = new Set(['confirmed', 'inferred']);
const REPRO_STATUSES = new Set(['NOT_ATTEMPTED', 'NOT_RUN', 'NOT_REPRODUCED', 'REPRODUCED']);
// Reasons that make `NOT_RUN` an honest record rather than a skipped attempt.
const NOT_RUN_REASONS = new Set(['not-executable-kind', 'no-isolated-environment', 'budget-cap']);
const CONTRACT_KINDS_ACCEPTED = new Set(['spec', 'acceptance', 'public-contract', 'security-rule']);

// Lane kinds. Only the first group counts as an independent defect-judging lane (CV-2).
const COUNTED_KINDS = new Set(['full-context', 'area', 'refuter', 'narrow-recheck', 'spec-test']);
const LANE_KIND_BY_NAME = {
  'java-reviewer': 'full-context', 'kotlin-spring-review': 'full-context', 'kotlin-spring-reviewer': 'full-context',
  'security-auditor': 'area', 'architecture-reviewer': 'area', 'application-architect': 'area', 'domain-driven-design-reviewer': 'area',
  'repro-refuter': 'refuter', 'refuter': 'refuter',
  'oop-design-review': 'style', 'design-pattern-apply': 'style', 'refactoring-catalog': 'style',
};
const ALL_LANE_KINDS = new Set([...COUNTED_KINDS, 'style', 'frontier-unavailable']);

function laneKind(lane) {
  if (lane.status === 'ROUTE_UNAVAILABLE') return 'frontier-unavailable';
  if (lane.kind !== undefined) return ALL_LANE_KINDS.has(lane.kind) ? lane.kind : 'unclassified';
  return LANE_KIND_BY_NAME[lane.name] || 'unclassified';
}

function classifyFile(path) {
  if (/(^|\/)(generated|build|dist|node_modules)\//.test(path) || /\.generated\./.test(path)) return 'generated';
  if (/\.(md|mdx|txt|rst|adoc)$/i.test(path) || /(^|\/)docs?\//.test(path)) return 'docs';
  if (/(^|\/)(src\/test|test|tests|__tests__|e2e)\//.test(path) || /(Test|Tests|IT|Spec)\.(java|kt|kts|groovy|scala)$/.test(path) || /\.(test|spec)\.[jt]sx?$/.test(path)) return 'test';
  return 'production';
}

function parseDiff(text) {
  const files = [];
  let current = null;
  for (const line of String(text).split('\n')) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (header) { current = {path: header[2], added: 0, removed: 0, addedText: []}; files.push(current); continue; }
    if (!current) continue;
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) { current.added += 1; current.addedText.push(line.slice(1)); }
    else if (line.startsWith('-')) { current.removed += 1; current.addedText.push(line.slice(1)); }
  }
  return files.map((file) => ({...file, kind: classifyFile(file.path)}));
}

// Keyword and path rules, not a reviewer's opinion: the same diff always yields the same categories.
const RISK_RULES = {
  concurrency: {text: /@Transactional|synchronized|@Lock\b|FOR UPDATE|ReentrantLock|AtomicInteger|AtomicLong|Isolation\.|isolation\s*=|@Version\b|optimistic|pessimistic|idempoten|\bSERIALIZABLE\b|ConcurrentHashMap|\bmutex\b/i, path: null},
  authorization: {text: /@PreAuthorize|@PostAuthorize|@Secured|hasRole|hasAuthority|SecurityFilterChain|requestMatchers|authorizeHttpRequests|\bpermission\b|isOwner|checkAccess|@RolesAllowed/i, path: /(^|\/)(security|auth)[^/]*\//i},
  destructive: {text: /DELETE\s+FROM|DROP\s+(TABLE|COLUMN|INDEX)|TRUNCATE|deleteAll|deleteBy|\.delete\(|flushDb|ALTER\s+TABLE/i, path: /(^|\/)(db\/migration|migrations?)\//i},
  money: {text: /BigDecimal|\bamount\b|\bprice\b|\bpayment\b|\brefund\b|\bcurrency\b|\bbalance\b/i, path: null},
  'public-api': {text: /@RestController|@RequestMapping|@GetMapping|@PostMapping|@PutMapping|@DeleteMapping|@PatchMapping|openapi/i, path: /(^|\/)(api|openapi)[^/]*\//i},
};

function riskCategories(files) {
  const found = new Set();
  for (const file of files) {
    if (file.kind !== 'production') continue;
    for (const [name, rule] of Object.entries(RISK_RULES)) {
      if ((rule.path && rule.path.test(file.path)) || file.addedText.some((line) => rule.text.test(line))) found.add(name);
    }
  }
  return [...found].sort();
}

function parseRepro(value) {
  if (value === undefined || value === null) return {status: 'NOT_ATTEMPTED'};
  if (typeof value === 'object') return value;
  const match = /^(NOT_ATTEMPTED|NOT_RUN|NOT_REPRODUCED|REPRODUCED)(?::\s*(.+))?$/.exec(String(value).trim());
  if (!match) return null;
  return {status: match[1], ...(match[2] ? {reason: match[2].trim()} : {})};
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

class InputError extends Error {}
function fail(message) { throw new InputError(message); }

module.exports = {SEVERITIES, SEVERITY_RANK, CONFIDENCE, REPRO_STATUSES, NOT_RUN_REASONS, CONTRACT_KINDS_ACCEPTED, COUNTED_KINDS, LANE_KIND_BY_NAME,
  laneKind, classifyFile, parseDiff, riskCategories, parseRepro, isObject, InputError, fail, RISK_RULES};
