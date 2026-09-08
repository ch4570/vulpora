'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {hash} = require('../skills/start-task/scripts/model-routing-io.js');
const {validateOutputSchema, readOutputSchema} = require('../skills/start-task/scripts/session-output-schema.js');
const scripts = path.resolve(__dirname, '../skills/start-task/scripts');
const candidate = require('../skills/start-task/scripts/session-candidate.schema.json');
const proposal = require('../skills/start-task/scripts/session-edit-proposal.schema.json');
const copy = value => JSON.parse(JSON.stringify(value));
const invalid = change => { const value = copy(proposal); change(value);
  assert.throws(() => validateOutputSchema(value), {code: 'OUTPUT_SCHEMA_INVALID'}); };

test('both shipped schemas pass without changing serialized bytes or their binding hashes', () => {
  for (const name of ['session-candidate.schema.json', 'session-edit-proposal.schema.json']) {
    const filename = path.join(scripts, name), bytes = fs.readFileSync(filename);
    const loaded = readOutputSchema(filename), before = JSON.stringify(loaded.schema);
    assert.equal(loaded.sha256, hash(bytes));
    assert.equal(validateOutputSchema(loaded.schema), loaded.schema);
    assert.equal(JSON.stringify(loaded.schema), before);
    assert.deepEqual(loaded.schema, JSON.parse(bytes));
  }
});

test('the former missing-type defect and invalid object/array contracts fail offline', () => {
  for (const change of [
    s => { delete s.properties.schema.type; },
    s => { s.type = ['object', 'null']; },
    s => { s.properties.summary.type = ['string', 'string']; },
    s => { s.properties.summary.type = ['string', 'number']; },
    s => { s.properties.summary.type = 'typo'; },
    s => { s.additionalProperties = true; },
    s => { s.required.pop(); },
    s => { s.required[0] = s.required[1]; },
    s => { s.required[0] = 'missing'; },
    s => { delete s.properties.edits.items.type; },
    s => { delete s.properties.edits.items.required; },
    s => { delete s.properties.edits.items; },
  ]) invalid(change);
});

test('malformed constraints, patterns and literal types cannot reach a provider', () => {
  for (const change of [
    s => { s.properties.summary.maxLength = -1; },
    s => { s.properties.edits.maxItems = 1.5; },
    s => { s.properties.summary.minLength = 2000; },
    s => { s.properties.edits.items.properties.before_sha256.pattern = '['; },
    s => { s.properties.schema.const = 123; },
    s => { s.properties.summary.enum = []; },
    s => { s.properties.summary.enum = [true]; },
    s => { s.properties.summary.enum = ['x', 'x']; },
    s => { s.properties.schema.enum = ['another-protocol']; },
  ]) invalid(change);
  const nullable = copy(candidate);nullable.properties.blocker.enum = ['explanation', null];
  assert.equal(validateOutputSchema(nullable), nullable);
});

test('unimplemented schema features are explicit instead of silently assumed valid', () => {
  const value = copy(proposal);value.properties.summary.anyOf = [{type: 'string'}];
  assert.throws(() => validateOutputSchema(value), {code: 'OUTPUT_SCHEMA_UNSUPPORTED'});
});

test('cyclic, deeply nested, excessive-node and oversized schemas are bounded', () => {
  const cycle = {type: 'array'};cycle.items = cycle;
  const cyclic = copy(proposal);cyclic.properties.edits = cycle;
  assert.throws(() => validateOutputSchema(cyclic), {code: 'OUTPUT_SCHEMA_INVALID'});
  const deep = copy(proposal);let cursor = deep.properties.edits;
  for (let index = 0; index < 11; index++) { cursor.items = {type: 'array'};cursor = cursor.items; }
  cursor.items = {type: 'string'};
  assert.throws(() => validateOutputSchema(deep), {code: 'OUTPUT_SCHEMA_INVALID'});
  const wide = {type: 'object', additionalProperties: false, properties: {}, required: []};
  for (let index = 0; index < 512; index++) { wide.properties[`p${index}`] = {type: 'string'};wide.required.push(`p${index}`); }
  assert.throws(() => validateOutputSchema(wide), {code: 'OUTPUT_SCHEMA_INVALID'});
  invalid(s => { s.description = 'x'.repeat(65536); });
});

test('schema loading rejects malformed and duplicate-key JSON before returning a hash', t => {
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-schema-test-')));
  t.after(() => fs.rmSync(cwd, {recursive: true, force: true}));
  const filename = path.join(cwd, 'schema.json');
  for (const text of ['{', '{"type":"object","type":"array"}']) {
    fs.writeFileSync(filename, text);
    assert.throws(() => readOutputSchema(filename), {code: 'OUTPUT_SCHEMA_INVALID'});
  }
});
