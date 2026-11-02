#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FIELDS = [
  'Target', 'Purpose', 'Preconditions', 'Dataset', 'Expected',
  'Mutates', 'Depends-on', 'Captures', 'Notes',
];
const ID = /^E2E-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const TOKEN = /^[A-Z][A-Z0-9_-]*$/;
const RESOURCE = /^[a-z][a-z0-9_.-]*$/;
const ALLOWED_SHELL = /^(?:curl|kafka-topics|kafka-console-consumer|kafka-console-producer|docker\s+exec|redis-cli|opensearch-cli|psql\s+-c|sleep)(?:\s|$)/;
const SQL_MUTATION = /\b(?:INSERT|UPDATE|DELETE|MERGE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|CALL|COPY)\b/i;
const SHELL_CONTROL = /[;&|<>`]|\$\(|\\$/;
const NON_MUTATING_HTTP_BEHAVIOR = /-(?:AUTH-FAIL|NOT-FOUND|CONFLICT|VALIDATION-FAIL(?:-[A-Z0-9-]+)?)$/;
const CANONICAL_TARGET = /^(?:(?:GET|POST|PUT|DELETE|PATCH) \/\S*|KAFKA \S+|OUTBOX [A-Za-z_$][A-Za-z0-9_$]*) \([A-Za-z0-9_.:-]+\)$/;
const SUPPORTED_INVENTORY_PROFILES = new Set(['spring-jvm', 'node-nestjs']);
// Machine-checked response assertion: `assert <json-path> <operator> [<literal>]`.
// Keep in sync with e2e-runner/scripts/expected-assertions.js (a runner test compares both).
const SCALAR = '"[^"\\\\]*"|-?\\d+(?:\\.\\d+)?|true|false|null';
const LITERAL = `${SCALAR}|\\{\\{(?:prev|seed)\\.[A-Z][A-Z0-9_-]*\\}\\}|\\[(?:\\s*(?:${SCALAR})\\s*(?:,\\s*(?:${SCALAR})\\s*)*)?\\]`;
const ASSERTION = new RegExp(`^assert \\$(?:\\.[A-Za-z_][A-Za-z0-9_-]*|\\[\\d+\\]|\\[\\*\\])* (?:(?:==|!=|contains|excludes) (?:${LITERAL})|exists|absent|non-empty)$`);
const PRIORITY = /^P[0-3]$/;

function scalar(value) {
  return /^`[^`]+`$/.test(value) ? value.slice(1, -1) : value;
}

function normalizeTarget(value) {
  return value.replace(/`/g, '').trim().replace(/\s+/g, ' ');
}

function validateTarget(value, id) {
  const target = normalizeTarget(value);
  if (!CANONICAL_TARGET.test(target)) fail('SCA-15.BAD-TARGET', id);
  return target;
}

function fail(code, detail) {
  process.stderr.write(`${code}${detail ? `: ${detail}` : ''}\n`);
  process.exit(1);
}

function readRegular(path, code) {
  let stat;
  try { stat = fs.lstatSync(path); } catch { fail(code, path); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(code, path);
  return fs.readFileSync(path, 'utf8');
}

function parseTable(block, id) {
  const rows = [...block.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|$/gm)]
    .map((match) => [match[1].trim(), match[2].trim()])
    .filter(([key]) => key !== 'Field' && !/^---+$/.test(key));
  if (rows.length !== FIELDS.length) fail('SCA-15.MISSING-KEY', id);
  for (let index = 0; index < FIELDS.length; index += 1) {
    if (rows[index][0] !== FIELDS[index]) fail('SCA-15.KEY-SPELL', `${id}:${rows[index][0]}`);
    if (rows[index][1].length === 0) fail('SCA-15.EMPTY-VALUE', `${id}:${FIELDS[index]}`);
  }
  return Object.fromEntries(rows);
}

function parseDependencies(value, id) {
  value = scalar(value);
  if (value === '—') return [];
  if (!/^\[(?:E2E-[A-Z0-9-]+)(?:,\s*E2E-[A-Z0-9-]+)*\]$/.test(value)) {
    fail('SCA-15.DEP-CARDINALITY', id);
  }
  return value.slice(1, -1).split(',').map((item) => item.trim());
}

function validatePreconditions(value, id) {
  value = scalar(value);
  if (value === '—') return;
  const literal = '(?:true|false|-?\\d+|"[^"]+"|\\{\\{seed\\.[A-Z][A-Z0-9_-]*\\}\\})';
  const predicate = new RegExp(`^[a-z][a-z0-9_.-]*\\s+(?:==|!=|>=|<=|>|<)\\s+${literal}$`);
  if (value.split(/\s*&&\s*/).some((part) => !predicate.test(part))) fail('SCA-15.BAD-PRECOND', id);
}

function validateDataset(value, id) {
  value = scalar(value);
  if (value === '—') return;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)
    || /\b01[016789]-?\d{3,4}-?\d{4}\b/.test(value)
    || /\b\d{6}-?[1-4]\d{6}\b/.test(value)) fail('SCA-16.REAL-DATA', id);
  const item = /^[A-Za-z][A-Za-z0-9_.-]*=(?:[A-Za-z0-9_.:-]+|\{\{seed\.[A-Z][A-Z0-9_-]*\}\})$/;
  if (value.split(/,\s*/).some((part) => !item.test(part))) fail('SCA-15.BAD-DATASET', id);
}

function validateExpected(value, id) {
  const clauses = value.replace(/`/g, '').split(';').map((clause) => clause.trim().replace(/\s+/g, ' '));
  for (const clause of clauses) {
    if (/^assert\b/.test(clause) && !ASSERTION.test(clause)) fail('SCA-15.BAD-ASSERTION', `${id}:${clause}`);
  }
}

function readSibling(name, schema, key, code) {
  // Human-owned companions next to the catalog survive regeneration.
  const file = path.join(path.dirname(catalogPath), name);
  if (!fs.existsSync(file)) return null;
  let value;
  try { value = JSON.parse(readRegular(file, code)); } catch { fail(code, `${name}: invalid JSON`); }
  if (value?.schema !== schema || value[key] === null || typeof value[key] !== 'object') fail(code, `${name}: requires schema ${schema}`);
  return value[key];
}

function parseHttp(body) {
  const [head, ...rest] = body.split('\n');
  const request = head.trim().match(/^([A-Z]+)\s+(\S+)/);
  if (!request) return null;
  const url = request[2].replace(/^\{\{[^}]+\}\}/, '').replace(/^https?:\/\/[^/]+/, '');
  const [pathname, query = ''] = url.split('?');
  const blank = rest.findIndex((line) => line.trim() === '');
  const payload = blank >= 0 ? rest.slice(blank + 1).join('\n').trim() : '';
  const params = new Set(query.split('&').filter(Boolean).map((pair) => decodeURIComponent(pair.split('=')[0])));
  return {method: request[1], pathname, params, payload};
}

function validateShell(body, id, context) {
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
  const commands = lines.filter((line) => !line.startsWith('#'));
  if (commands.length === 0) fail(`SCA-15.BAD-${context}`, id);
  for (const line of commands) {
    if (SHELL_CONTROL.test(line)) fail(`SCA-15.BAD-${context}-CONTROL`, id);
    if (!ALLOWED_SHELL.test(line)) fail(`SCA-15.BAD-${context}-COMMAND`, `${id}:${line.split(/\s+/)[0]}`);
  }
  return {lines, commands};
}

function parseFences(block, id, mutates, captures) {
  const fences = [...block.matchAll(/^```(http|sql|shell)\n([\s\S]*?)^```$/gm)]
    .map((match) => ({type: match[1], body: match[2].replace(/\n+$/, '')}));
  const expected = mutates === '—' ? 1 : 2;
  if (fences.length !== expected) fail('SCA-15.BAD-FENCE-COUNT', id);
  const primary = fences[0];
  if (primary.type === 'sql'
    && (!/^\s*(?:SELECT\b|WITH\b[\s\S]*\bSELECT\b)/i.test(primary.body) || SQL_MUTATION.test(primary.body))) {
    fail('SCA-15.SQL-MUTATION', id);
  }
  if (primary.type === 'shell') validateShell(primary.body, id, 'PRIMARY-SHELL');
  const httpMethod = primary.type === 'http' ? primary.body.trim().match(/^([A-Z]+)/)?.[1] : null;
  if (mutates === '—'
    && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(httpMethod)
    && !NON_MUTATING_HTTP_BEHAVIOR.test(id)) fail('SCA-15.MISSING-MUTATES', id);
  if (mutates === '—') return fences;
  const teardown = fences[1];
  if (teardown.type !== 'shell') fail('SCA-15.BAD-TEARDOWN', id);
  const {lines, commands} = validateShell(teardown.body, id, 'TEARDOWN');
  if (lines[0] !== '# teardown') fail('SCA-15.BAD-TEARDOWN', id);
  const commandText = commands.join('\n');
  const resources = mutates.split(/,\s*/);
  const captureTokens = captures === '—' ? [] : captures.split(/,\s*/);
  const referencesResource = resources.some((resource) => commandText.toLowerCase().includes(resource.toLowerCase()));
  const referencesCapture = captureTokens.some((token) =>
    commandText.includes(`{{${token}}}`) || commandText.includes(`{{prev.${token}}}`));
  if (!referencesResource && !referencesCapture) fail('SCA-15.BAD-TEARDOWN-REFERENCE', id);
  return fences;
}

function parseInventory(inventoryPath) {
  let inventory;
  try { inventory = JSON.parse(readRegular(inventoryPath, 'INVENTORY_UNREADABLE')); }
  catch { fail('SCA-19.BAD-INVENTORY', inventoryPath); }
  if (!inventory || inventory.schema !== 'vulpora.e2e-surface-inventory/v1'
    || !SUPPORTED_INVENTORY_PROFILES.has(inventory.profile)
    || !/^[a-f0-9]{64}$/.test(inventory.source_fingerprint ?? '')
    || !Array.isArray(inventory.inputs) || !Array.isArray(inventory.surfaces)
    || inventory.surfaces.length === 0) fail('SCA-19.BAD-INVENTORY', inventoryPath);
  if (inventory.excluded_sources !== undefined && (!Array.isArray(inventory.excluded_sources)
    || inventory.excluded_sources.some((entry) => typeof entry?.path !== 'string'
      || typeof entry.reason !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires ?? '')))) {
    fail('SCA-19.BAD-INVENTORY', inventoryPath);
  }
  const keys = new Set();
  const targets = new Set();
  for (const surface of inventory.surfaces) {
    if (!surface || typeof surface.key !== 'string' || typeof surface.target !== 'string'
      || !Array.isArray(surface.required_behaviors) || surface.required_behaviors.length === 0
      || surface.required_behaviors.some((behavior) => !TOKEN.test(behavior))) {
      fail('SCA-19.BAD-INVENTORY', inventoryPath);
    }
    const target = validateTarget(surface.target, surface.key);
    if (keys.has(surface.key)) fail('SCA-19.DUP-SURFACE', surface.key);
    if (targets.has(target)) fail('SCA-19.DUP-TARGET', target);
    keys.add(surface.key);
    targets.add(target);
  }
  return inventory;
}

const [catalogPath, contractPath, inventoryPath] = process.argv.slice(2);
if (!catalogPath || !contractPath || (process.argv.length !== 4 && process.argv.length !== 5)) {
  fail('USAGE', 'validate-catalog.js CATALOG CONTRACT [INVENTORY]');
}
const catalog = readRegular(catalogPath, 'CATALOG_UNREADABLE');
const contract = readRegular(contractPath, 'CONTRACT_UNREADABLE');
if (!/^contractVersion:\s*1$/m.test(contract)) fail('SCA-18.CONTRACT-VERSION');
if (/\r/.test(catalog) || /[ \t]+$/m.test(catalog) || !catalog.endsWith('\n')) fail('SCA-15.NON_CANONICAL-WHITESPACE');
if (!/^<!-- AUTO-GENERATED by e2e-scenario-author\./.test(catalog)
  || !/^<!-- Source fingerprint: sha256:[a-f0-9]{64} -->$/m.test(catalog)
  || !/^<!-- Contract: docs\/e2e-scenarios\/CONTRACT\.md version 1 -->$/m.test(catalog)
  || !/^# E2E Scenario Catalog$/m.test(catalog)) fail('SCA-10.BAD-HEADER');

const headings = [...catalog.matchAll(/^### `([^`]+)` — (.+)$/gm)];
if (headings.length === 0) fail('SCA-15.EMPTY-CATALOG');
const scenarios = [];
for (let index = 0; index < headings.length; index += 1) {
  const id = headings[index][1];
  if (!ID.test(id)) fail('SCA-6.BAD-ID', id);
  const start = headings[index].index;
  const end = headings[index + 1]?.index ?? catalog.length;
  const block = catalog.slice(start, end);
  const fields = parseTable(block, id);
  validatePreconditions(fields.Preconditions, id);
  validateDataset(fields.Dataset, id);
  validateExpected(fields.Expected, id);
  const dependencies = parseDependencies(fields['Depends-on'], id);
  const captures = scalar(fields.Captures);
  const mutates = scalar(fields.Mutates);
  if (captures !== '—' && captures.split(/,\s*/).some((token) => !TOKEN.test(token))) {
    fail('SCA-15.BAD-CAPTURE', id);
  }
  if (mutates !== '—' && mutates.split(/,\s*/).some((resource) => !RESOURCE.test(resource))) {
    fail('SCA-15.BAD-MUTATES', id);
  }
  const fences = parseFences(block, id, mutates, captures);
  const hold = scalar(fields.Notes).match(/^hold:\s*(\S.*)$/i);
  scenarios.push({
    id, dependencies, target: validateTarget(fields.Target, id), expected: fields.Expected,
    captures: captures === '—' ? [] : captures.split(/,\s*/), fences, held: hold ? hold[1].trim() : null,
    text: `${fields.Expected}\n${fields.Dataset}\n${fences[0].body}`, teardownText: fences[1]?.body ?? '',
  });
}

const ids = scenarios.map((scenario) => scenario.id);
if (new Set(ids).size !== ids.length) fail('SCA-15.DUP-ID');
if (JSON.stringify(ids) !== JSON.stringify([...ids].sort())) fail('SCA-11.1.UNSTABLE-ORDER');
const idSet = new Set(ids);
for (const scenario of scenarios) {
  for (const dependency of scenario.dependencies) if (!idSet.has(dependency)) {
    fail('SCA-15.MISSING-DEP', `${scenario.id}->${dependency}`);
  }
}
const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
const visiting = new Set();
const visited = new Set();
function visit(id) {
  if (visiting.has(id)) fail('SCA-15.DEP-CYCLE', id);
  if (visited.has(id)) return;
  visiting.add(id);
  for (const dependency of byId.get(id).dependencies) visit(dependency);
  visiting.delete(id);
  visited.add(id);
}
for (const id of ids) visit(id);

// `{{prev.X}}` must come from an ancestor that captures X; otherwise it silently
// reads an unrelated scenario's value.
function ancestors(id, seen = new Set()) {
  for (const dependency of byId.get(id).dependencies) {
    if (!seen.has(dependency)) { seen.add(dependency); ancestors(dependency, seen); }
  }
  return seen;
}
for (const scenario of scenarios) {
  const available = new Set([...ancestors(scenario.id)].flatMap((id) => byId.get(id).captures));
  // Teardown runs after the primary, so it may also read the scenario's own captures.
  const own = new Set([...available, ...scenario.captures]);
  for (const [text, allowed] of [[scenario.text, available], [scenario.teardownText, own]]) {
    for (const match of text.matchAll(/\{\{prev\.([A-Z][A-Z0-9_-]*)\}\}/g)) {
      if (!allowed.has(match[1])) fail('SCA-15.BAD-PREV-SOURCE', `${scenario.id}:${match[1]}`);
    }
  }
}

const overrides = readSibling('scenario-overrides.json', 'vulpora.e2e-scenario-overrides/v1', 'scenarios', 'SCA-15.BAD-OVERRIDE') || {};
for (const [id, override] of Object.entries(overrides)) {
  // A stale override after regeneration must surface, never silently stop asserting.
  if (!idSet.has(id)) fail('SCA-15.ORPHAN-OVERRIDE', id);
  if (override === null || typeof override !== 'object') fail('SCA-15.BAD-OVERRIDE', id);
  if (override.priority !== undefined && !PRIORITY.test(override.priority)) fail('SCA-15.BAD-OVERRIDE', `${id}:priority`);
  if (override.assertions !== undefined && (!Array.isArray(override.assertions)
    || override.assertions.some((clause) => typeof clause !== 'string' || !ASSERTION.test(clause.trim().replace(/\s+/g, ' '))))) {
    fail('SCA-15.BAD-ASSERTION', `${id}:scenario-overrides.json`);
  }
  for (const match of (override.assertions || []).join('\n').matchAll(/\{\{prev\.([A-Z][A-Z0-9_-]*)\}\}/g)) {
    const available = new Set([...ancestors(id)].flatMap((ancestor) => byId.get(ancestor).captures));
    if (!available.has(match[1])) fail('SCA-15.BAD-PREV-SOURCE', `${id}:${match[1]}`);
  }
}

const deviations = readSibling('known-deviations.json', 'vulpora.e2e-known-deviations/v1', 'deviations', 'SCA-5.3');
const today = new Date().toISOString().slice(0, 10);
const scenarioExclusions = [];
for (const entry of Array.isArray(deviations) ? deviations : []) {
  if (entry?.kind !== 'scenario-exclusion') continue;
  if (!idSet.has(entry.scenario)) fail('SCA-5.3', `known-deviations.json: unknown scenario ${entry.scenario}`);
  if (typeof entry.reason !== 'string' || !entry.reason.trim() || typeof entry.approvedBy !== 'string'
    || !entry.approvedBy.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires ?? '')) {
    fail('SCA-5.3', `known-deviations.json: ${entry.scenario}: reason, approvedBy, and expires are required`);
  }
  if (entry.expires < today) fail('SCA-5.3', `known-deviations.json: ${entry.scenario}: deviation expired on ${entry.expires}`);
  scenarioExclusions.push({scenario: entry.scenario, reason: entry.reason.trim(), approvedBy: entry.approvedBy.trim(), expires: entry.expires});
}
if (deviations !== null && !Array.isArray(deviations)) fail('SCA-5.3', 'known-deviations.json: deviations must be an array');

let inventory = null;
if (inventoryPath) {
  inventory = parseInventory(inventoryPath);
  const catalogFingerprint = catalog.match(/^<!-- Source fingerprint: sha256:([a-f0-9]{64}) -->$/m)?.[1];
  if (catalogFingerprint !== inventory.source_fingerprint) {
    fail('SCA-19.FINGERPRINT-MISMATCH', `${catalogFingerprint ?? 'missing'}!=${inventory.source_fingerprint}`);
  }
  const inventoryTargets = new Set(inventory.surfaces.map((surface) => normalizeTarget(surface.target)));
  for (const scenario of scenarios) {
    if (!inventoryTargets.has(scenario.target)) fail('SCA-19.EXTRA-TARGET', `${scenario.id}:${scenario.target}`);
  }
  for (const surface of inventory.surfaces) {
    if (!surface.request) continue;
    const target = normalizeTarget(surface.target);
    for (const scenario of scenarios.filter((candidate) => candidate.target === target)) {
      const http = scenario.fences[0]?.type === 'http' ? parseHttp(scenario.fences[0].body) : null;
      if (!http) continue;
      const happy = scenario.id.endsWith('-HAPPY');
      const validation = scenario.id.match(/-VALIDATION-FAIL-(.+)$/)?.[1];
      for (const parameter of surface.request.parameters || []) {
        const token = parameter.name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').toUpperCase();
        if (parameter.in === 'path' && new RegExp(`\\{${parameter.name}\\}`).test(http.pathname)) {
          fail('SCA-19.UNFILLED-PATH', `${scenario.id}:${parameter.name}`);
        }
        if (happy && parameter.in === 'query' && parameter.required && !http.params.has(parameter.name)) {
          fail('SCA-19.MISSING-PARAM', `${scenario.id}:${parameter.name}`);
        }
        // A path-variable constraint is violated in the path, never by adding a same-named query parameter.
        if (validation?.startsWith(`${token}-`) && parameter.in === 'path' && http.params.has(parameter.name)) {
          fail('SCA-19.CONSTRAINT-LOCATION', `${scenario.id}:${parameter.name} is a path variable`);
        }
      }
      if (happy && Object.keys(surface.request.body_enums || {}).length > 0 && http.payload.startsWith('{')) {
        let payload;
        try { payload = JSON.parse(http.payload.replace(/\{\{[^}]+\}\}/g, '0')); } catch { payload = null; }
        for (const [field, constants] of Object.entries(surface.request.body_enums)) {
          const value = payload?.[field];
          if (typeof value === 'string' && !constants.includes(value)) {
            fail('SCA-19.BAD-ENUM', `${scenario.id}:${field}=${value} not in ${constants.join('|')}`);
          }
        }
      }
    }
  }
  for (const surface of inventory.surfaces) {
    const target = normalizeTarget(surface.target);
    for (const behavior of surface.required_behaviors) {
      const found = scenarios.some((scenario) => scenario.target === target && scenario.id.endsWith(`-${behavior}`));
      if (!found) fail('SCA-19.MISSING-COVERAGE', `${surface.key}:${behavior}`);
    }
  }
}

process.stdout.write(JSON.stringify({
  outcome: 'pass', contract_version: 1, scenario_count: scenarios.length,
  inventory_bound: Boolean(inventory), surface_count: inventory?.surfaces.length ?? null,
  excluded_sources: inventory?.excluded_sources ?? [],
  held: scenarios.filter((scenario) => scenario.held).map((scenario) => ({scenario: scenario.id, reason: scenario.held})),
  scenario_exclusions: scenarioExclusions,
  override_count: Object.keys(overrides).length,
}) + '\n');
