'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { checkExecutionReceipt } = require('../harness/check-execution-receipt.js');
const incidents = require('../fixtures/harness-incidents/incidents.json');
function baseline() {
  return {
    schema: 'vulpora.execution-receipt/v1', run_id: 'run-current', definition_digest: 'definition-current',
    required_stages: ['plan'], budget: { max_calls: 1, gateway_id: 'approved-gateway' },
    events: [
      { type: 'stage_completed', stage: 'plan', run_id: 'run-current', definition_digest: 'definition-current' },
      { type: 'terminal', status: 'completed', exit_code: 0 }
    ]
  };
}
test('healthy complete receipt passes without model calls', () => {
  assert.deepEqual(checkExecutionReceipt(baseline()), { status: 'PASS', failure_signals: [] });
});
for (const incident of incidents) {
  test(incident.id, () => {
    const receipt = baseline();
    if (incident.replace_events) receipt.events = incident.replace_events;
    else receipt.events.splice(-1, 0, ...incident.insert_events);
    assert.deepEqual(checkExecutionReceipt(receipt), { status: 'FAIL', failure_signals: incident.expected_signals });
  });
}
test('benign warnings, complete inventory and one reserved model call pass', () => {
  const receipt = baseline();
  receipt.events.splice(-1, 0,
    { type: 'warning', code: 'lazy-cache-refresh' },
    { type: 'operation', status: 'completed' },
    { type: 'inventory', expected_total: 2, items: ['resource-1', 'resource-2'], complete: true, next_cursor: null },
    { type: 'model_call', gateway_id: 'approved-gateway', reservation_id: 'reservation-1' });
  assert.equal(checkExecutionReceipt(receipt).status, 'PASS');
});
test('missing independent completeness evidence is not an empty successful inventory', () => {
  const receipt = baseline();
  receipt.events.splice(-1, 0, { type: 'inventory', items: [], complete: true, next_cursor: null });
  assert.deepEqual(checkExecutionReceipt(receipt).failure_signals, ['inventory_completeness_unverified']);
});
test('reused reservation and post-terminal events are rejected', () => {
  const receipt = baseline(); receipt.budget.max_calls = 2;
  receipt.events.push(...Array(2).fill({ type: 'model_call', gateway_id: 'approved-gateway', reservation_id: 'reused' }));
  assert.deepEqual(checkExecutionReceipt(receipt).failure_signals, ['events_after_terminal', 'model_call_gateway_bypass']);
});
test('malformed input cannot be treated as a successful no-op', () => {
  assert.equal(checkExecutionReceipt(null).status, 'INCONCLUSIVE');
  const receipt = baseline(); receipt.events = [];
  assert.equal(checkExecutionReceipt(receipt).status, 'FAIL');
  receipt.events = [null];
  assert.equal(checkExecutionReceipt(receipt).status, 'INCONCLUSIVE');
  receipt.events = [{ type: 'unrecognized_cancel_event' }];
  assert.equal(checkExecutionReceipt(receipt).status, 'INCONCLUSIVE');
});
