#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

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
  if (mutates === '—') return;
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
  const dependencies = parseDependencies(fields['Depends-on'], id);
  const captures = scalar(fields.Captures);
  const mutates = scalar(fields.Mutates);
  if (captures !== '—' && captures.split(/,\s*/).some((token) => !TOKEN.test(token))) {
    fail('SCA-15.BAD-CAPTURE', id);
  }
  if (mutates !== '—' && mutates.split(/,\s*/).some((resource) => !RESOURCE.test(resource))) {
    fail('SCA-15.BAD-MUTATES', id);
  }
  parseFences(block, id, mutates, captures);
  scenarios.push({id, dependencies, target: validateTarget(fields.Target, id)});
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
}) + '\n');
