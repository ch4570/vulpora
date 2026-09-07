'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createTelemetry, MAP_LIMIT} = require('../skills/start-task/scripts/session-telemetry.js');

test('counts completed categories and UTF-8 byte proxies without retaining secrets', () => {
  const telemetry = createTelemetry();
  const secret = 'SECRET /private/path/秘密';
  telemetry.observe({type: 'item.started', item: {type: 'command_execution', command: secret}});
  telemetry.observe({type: 'item.completed', item: {type: 'command_execution', command: secret, aggregated_output: 'é'}});
  telemetry.observe({type: 'item.completed', item: {type: 'file_change', path: secret}});
  telemetry.observe({type: 'item.completed', item: {type: 'agent_message', text: '한글'}});
  const result = telemetry.summary();
  assert.equal(result.eventTypes['item.started'], 1);
  assert.equal(result.eventTypes['item.completed'], 3);
  assert.deepEqual(result.itemCompleted, {commandExecutions: 1, fileChanges: 1, agentMessages: 1});
  assert.equal(result.byteProxies.command, Buffer.byteLength(secret));
  assert.equal(result.byteProxies.aggregatedOutput, 2);
  assert.equal(result.byteProxies.agentTextBytes, 6);
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(result.repeatedCommands.length, 0);
});

test('tracks repeated commands with bounded opaque fingerprints', () => {
  const telemetry = createTelemetry();
  telemetry.observe({type: 'item.completed', item: {type: 'command_execution', command: 'same'}});
  telemetry.observe({type: 'item.updated', item: {type: 'command_execution', command: 'same'}});
  telemetry.observe({type: 'item.completed', item: {type: 'command_execution', command: 'same', aggregated_output: 'x'}});
  const repeated = telemetry.summary().repeatedCommands;
  assert.equal(repeated.length, 1); assert.equal(repeated[0].count, 2);
  assert.equal(repeated[0].aggregatedOutputBytes, 1); assert.match(repeated[0].fingerprint, /^[0-9a-f]{16}$/);
});

test('caps fingerprint map and tolerates malformed events and numeric fields', () => {
  const telemetry = createTelemetry();
  for (let index = 0; index < MAP_LIMIT + 3; index++) telemetry.observe({type: 'item.completed', item: {type: 'command_execution', command: `cmd-${index}`, aggregated_output: 42}});
  for (const event of [null, 2, {}, {type: 4}, {type: 'item.completed'}, {type: 'item.completed', item: null}]) telemetry.observe(event);
  const result = telemetry.summary();
  assert.equal(result.itemCompleted.commandExecutions, MAP_LIMIT + 3);
  assert.equal(result.repeatedCommands.length, 0); assert.equal(result.fingerprintOverflow, true);
  assert.equal(result.saturation, false); assert.equal(Object.keys(result).length < 20, true);
});

test('unknown event types are privacy-safe and remain in a fixed schema', () => {
  const telemetry = createTelemetry();
  for (let index = 0; index < 1001; index++) telemetry.observe({type: `SECRET-${index}-/private`});
  const result = telemetry.summary();
  assert.equal(result.eventTypes.other, 1001);
  assert.deepEqual(Object.keys(result.eventTypes), ['error', 'item.completed', 'item.started', 'item.updated',
    'other', 'thread.started', 'turn.completed', 'turn.failed', 'turn.started']);
  assert.ok(!JSON.stringify(result).includes('SECRET-'));
});

test('agent text accounting ignores cyclic and arbitrarily nested values', () => {
  const telemetry = createTelemetry();
  const cyclic = {}; cyclic.content = cyclic;
  const deep = {text: 'hidden'}; let cursor = deep;
  for (let index = 0; index < 10000; index++) { cursor.next = {}; cursor = cursor.next; }
  telemetry.observe({type: 'item.completed', item: {type: 'agent_message', content: cyclic, message: deep}});
  telemetry.observe({type: 'item.completed', item: {type: 'agent_message', content: [{text: 'ok'}, {text: 'é'}]}});
  assert.equal(telemetry.summary().byteProxies.agentTextBytes, 4);
});

test('returned summaries are snapshots', () => {
  const telemetry = createTelemetry();
  telemetry.observe({type: 'item.completed', item: {type: 'command_execution', command: 'one'}});
  const first = telemetry.summary();
  first.eventTypes['item.completed'] = 999; first.byteProxies.command = 999;
  telemetry.observe({type: 'item.completed', item: {type: 'command_execution', command: 'two'}});
  const second = telemetry.summary();
  assert.equal(second.eventTypes['item.completed'], 2);
  assert.equal(second.byteProxies.command, 6);
});
