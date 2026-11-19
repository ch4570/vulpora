#!/usr/bin/env node
'use strict';

// Turn a validated catalog into an execution plan a repository harness can follow
// without parsing Markdown itself:
//   - dependency-respecting order (catalog order breaks ties);
//   - a teardown is deferred until its last selected descendant has run, so a parent's
//     cleanup cannot delete the row a dependent scenario still needs;
//   - human overrides (scenario-overrides.json) merged into `expected` and `priority`;
//   - every unselected scenario carries its reason (scope, author hold, known deviation).
//
// usage: export-catalog-plan.js <catalog.md> [--only <ID or PREFIX-*>[,...]]

const fs = require('node:fs');
const path = require('node:path');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(64);
}

const args = process.argv.slice(2);
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? (args[onlyIndex + 1] || fail('--only requires a value')).split(',').map((value) => value.trim()) : null;
const positional = onlyIndex >= 0 ? args.filter((_, index) => index !== onlyIndex && index !== onlyIndex + 1) : args;
if (positional.length !== 1) fail('usage: export-catalog-plan.js <catalog.md> [--only <ID or PREFIX-*>[,...]]');
const catalogPath = positional[0];
let catalog;
try { catalog = fs.readFileSync(catalogPath, 'utf8'); } catch { fail(`catalog unreadable: ${catalogPath}`); }

function sibling(name, schema, key) {
  const file = path.join(path.dirname(catalogPath), name);
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value?.schema !== schema) fail(`${name}: requires schema ${schema}`);
  return value[key];
}

const scalar = (value) => value.replace(/`/g, '').trim();
const headings = [...catalog.matchAll(/^### `([^`]+)` — (.+)$/gm)];
if (headings.length === 0) fail('catalog has no scenarios; run validate-catalog.js first');
const scenarios = headings.map((heading, index) => {
  const block = catalog.slice(heading.index, headings[index + 1]?.index ?? catalog.length);
  const fields = Object.fromEntries([...block.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|$/gm)]
    .map((match) => [match[1].trim(), match[2].trim()]));
  const fences = [...block.matchAll(/^```(http|sql|shell)\n([\s\S]*?)^```$/gm)]
    .map((match) => ({type: match[1], text: match[2].replace(/\n+$/, '')}));
  const list = (value) => (scalar(value || '—') === '—' ? [] : scalar(value).replace(/^\[|\]$/g, '').split(',').map((item) => item.trim()));
  const teardown = fences[1] ? fences[1].text.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#')) : null;
  return {
    id: heading[1], title: heading[2], target: scalar(fields.Target || ''), purpose: fields.Purpose, preconditions: scalar(fields.Preconditions || '—'),
    dataset: scalar(fields.Dataset || '—'), expected: fields.Expected, dependsOn: list(fields['Depends-on']), captures: list(fields.Captures),
    mutates: list(fields.Mutates), request: fences[0] || null, teardown,
    hold: scalar(fields.Notes || '').match(/^hold:\s*(\S.*)$/i)?.[1] ?? null,
  };
});
const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
for (const scenario of scenarios) {
  if (!scenario.request) fail(`${scenario.id}: missing primary fence; run validate-catalog.js first`);
  for (const dependency of scenario.dependsOn) if (!byId.has(dependency)) fail(`${scenario.id}: unknown dependency ${dependency}`);
}

// Positive flows prove the feature; negative paths are important but secondary by default.
function defaultPriority(id) {
  return /-(?:HAPPY|CONSUME|PUBLISH|DLQ)$/.test(id) ? 'P0' : 'P1';
}
const overrides = sibling('scenario-overrides.json', 'vulpora.e2e-scenario-overrides/v1', 'scenarios') || {};
const today = new Date().toISOString().slice(0, 10);
const deviations = (sibling('known-deviations.json', 'vulpora.e2e-known-deviations/v1', 'deviations') || []);
const excluded = new Map();
for (const entry of deviations.filter((candidate) => candidate.kind === 'scenario-exclusion')) {
  if (!(entry.expires >= today)) fail(`known-deviations.json: ${entry.scenario}: deviation expired on ${entry.expires}`);
  excluded.set(entry.scenario, entry);
}

// Kahn's algorithm with the catalog (lexicographic ID) order as the tie-breaker.
const order = [];
const remaining = new Map(scenarios.map((scenario) => [scenario.id, new Set(scenario.dependsOn)]));
while (remaining.size > 0) {
  const ready = [...remaining].filter(([, dependencies]) => dependencies.size === 0).map(([id]) => id).sort();
  if (ready.length === 0) fail('dependency cycle; run validate-catalog.js first');
  order.push(ready[0]);
  remaining.delete(ready[0]);
  for (const dependencies of remaining.values()) dependencies.delete(ready[0]);
}

function ancestors(id, seen = new Set()) {
  for (const dependency of byId.get(id).dependsOn) if (!seen.has(dependency)) { seen.add(dependency); ancestors(dependency, seen); }
  return seen;
}
const matches = (id) => only.some((pattern) => (pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : id === pattern));
const requested = new Set(only ? scenarios.filter((scenario) => matches(scenario.id)).map((scenario) => scenario.id) : byId.keys());
if (only && requested.size === 0) fail(`--only matched no scenario: ${only.join(',')}`);
const autoIncluded = new Set();
for (const id of requested) for (const ancestor of ancestors(id)) if (!requested.has(ancestor)) autoIncluded.add(ancestor);

const reasons = new Map();
for (const id of order) {
  const scenario = byId.get(id);
  const deviation = excluded.get(id);
  if (!requested.has(id) && !autoIncluded.has(id)) reasons.set(id, 'outside requested scope');
  else if (scenario.hold) reasons.set(id, `held by author: ${scenario.hold}`);
  else if (deviation) reasons.set(id, `known deviation: ${deviation.reason} (approved by ${deviation.approvedBy}, until ${deviation.expires})`);
  else {
    const blocked = scenario.dependsOn.find((dependency) => reasons.has(dependency));
    if (blocked) reasons.set(id, `depends on unselected ${blocked}`);
  }
}

// Defer each selected teardown to its last selected descendant in execution order.
const selectedOrder = order.filter((id) => !reasons.has(id));
const teardownAfter = new Map();
for (const id of selectedOrder) {
  if (!byId.get(id).teardown) continue;
  const last = selectedOrder.filter((candidate) => candidate === id || ancestors(candidate).has(id)).at(-1);
  teardownAfter.set(id, last);
}

const plan = order.map((id) => {
  const scenario = byId.get(id);
  const override = overrides[id] || {};
  const extra = (override.assertions || []).map((clause) => clause.trim());
  return {
    id, title: scenario.title, target: scenario.target, purpose: scenario.purpose, preconditions: scenario.preconditions,
    dataset: scenario.dataset, priority: override.priority || defaultPriority(id),
    expected: [scenario.expected, ...extra].join('; '), overrideAssertions: extra,
    dependsOn: scenario.dependsOn, captures: scenario.captures, mutates: scenario.mutates,
    request: scenario.request, teardown: scenario.teardown,
    selected: !reasons.has(id), unselectedReason: reasons.get(id) ?? null,
    teardownAfter: teardownAfter.get(id) ?? null,
    // Run these teardowns (already in reverse execution order) right after this scenario finishes.
    runTeardownsAfter: [...teardownAfter].filter(([, after]) => after === id).map(([owner]) => owner).reverse(),
  };
});

process.stdout.write(`${JSON.stringify({
  schema: 'vulpora.e2e-run-plan/v1',
  catalog: {path: catalogPath, fingerprint: catalog.match(/^<!-- Source fingerprint: sha256:([a-f0-9]{64}) -->$/m)?.[1] ?? null},
  scope: {requested: only ?? ['*'], autoIncluded: [...autoIncluded].sort()},
  knownDeviations: deviations,
  scenarios: plan,
}, null, 2)}\n`);
