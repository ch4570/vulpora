import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { installInboundGate, assertCompatibleVersions } from '../dist/drivers/inbound-budget.js';

test('inbound gate rejects an entire excess chunk and latches before synchronous teardown', () => {
  const stream = new PassThrough();
  let accepted = 0, failures = 0;
  stream.on('data', chunk => { accepted += chunk.length; });
  const gate = installInboundGate(stream, 'emit', 8, error => {
    failures++;
    assert.equal(error.code, 'NLSQL_RESULT_LIMIT_EXCEEDED');
    stream.emit('data', Buffer.alloc(1));
    throw new Error('synthetic teardown');
  });
  assert.doesNotThrow(() => {
    stream.emit('data', Buffer.alloc(5));
    stream.emit('data', Buffer.alloc(4));
    stream.emit('data', Buffer.alloc(1));
  });
  assert.equal(accepted, 5);
  assert.equal(gate.acceptedBytes, 5);
  assert.equal(failures, 1);
  assert.throws(() => gate.restore(), /unsupported|budget/i);
});

test('clean restoration preserves the exact original own property descriptor', () => {
  for (const own of [false, true]) {
    const stream = new PassThrough();
    if (own) Object.defineProperty(stream, 'emit', { value: stream.emit, writable: true, configurable: true, enumerable: false });
    const descriptor = Object.getOwnPropertyDescriptor(stream, 'emit');
    const gate = installInboundGate(stream, 'emit', 8, () => assert.fail());
    stream.emit('data', new Uint8Array(8));
    gate.restore();
    assert.deepEqual(Object.getOwnPropertyDescriptor(stream, 'emit'), descriptor);
  }
});

test('unsupported versions and transport shapes fail closed', () => {
  assert.throws(() => assertCompatibleVersions('postgres', { pg: '8.0.0', 'pg-protocol': '1.16.0' }), /unsupported/i);
  assert.doesNotThrow(() => assertCompatibleVersions('postgres', { pg: '8.23.0', 'pg-protocol': '1.16.0' }));
  assert.throws(() => installInboundGate({}, 'emit', 8, () => {}), /unsupported/i);
  const stream = new PassThrough();
  stream.setEncoding('utf8');
  assert.throws(() => installInboundGate(stream, 'emit', 8, () => {}), /unsupported/i);
});
