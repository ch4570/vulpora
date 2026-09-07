#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const qaRoot = path.resolve(__dirname, '..');
const validator = path.join(qaRoot, 'scripts', 'validate-test-plan.js');
const validPath = path.join(__dirname, 'fixtures', 'valid.qa-plan.json');
const negativePath = path.join(__dirname, 'fixtures', 'negative-fixtures.json');
const base = JSON.parse(fs.readFileSync(validPath, 'utf8'));
const negativeFixtures = JSON.parse(fs.readFileSync(negativePath, 'utf8'));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-qa-validator-'));

function run(file) {
  return spawnSync(process.execPath, [validator, file], {encoding: 'utf8'});
}

function location(root, segments) {
  let cursor = root;
  for (const segment of segments.slice(0, -1)) cursor = cursor[segment];
  return [cursor, segments.at(-1)];
}

try {
  const valid = run(validPath);
  assert.equal(valid.status, 0, `valid fixture failed:\n${valid.stderr}`);
  assert.match(valid.stdout, /QA plan valid:/);

  for (const fixture of negativeFixtures) {
    const candidate = structuredClone(base);
    if (fixture.operation === 'duplicateCase') {
      candidate.testCases.push(structuredClone(candidate.testCases[0]));
    } else {
      const [owner, key] = location(candidate, fixture.path);
      if (fixture.operation === 'delete') delete owner[key];
      else if (fixture.operation === 'set') owner[key] = fixture.value;
      else throw new Error(`unsupported fixture operation: ${fixture.operation}`);
    }
    const file = path.join(work, `${fixture.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`);
    fs.writeFileSync(file, `${JSON.stringify(candidate, null, 2)}\n`);
    const result = run(file);
    assert.equal(result.status, 1, `${fixture.name} was accepted`);
    assert.match(result.stderr, new RegExp(`^${fixture.error}:`, 'm'), `${fixture.name} emitted:\n${result.stderr}`);
  }

  const badJson = path.join(work, 'bad-json.json');
  fs.writeFileSync(badJson, '{');
  const malformed = run(badJson);
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /^QAP-JSON:/m);

  process.stdout.write(`qa validator contract: PASS (${negativeFixtures.length} negative fixtures)\n`);
} finally {
  fs.rmSync(work, {recursive: true, force: true});
}
