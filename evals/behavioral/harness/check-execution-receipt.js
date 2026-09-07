#!/usr/bin/env node
'use strict';

// Validates harness observations, not model-written prose. Receipts remain
// self-attested unless the caller authenticates their independent producer.
const fs = require('node:fs');

function checkExecutionReceipt(receipt) {
  const signals = new Set();
  const fail = (signal) => signals.add(signal);
  if (!receipt || receipt.schema !== 'vulpora.execution-receipt/v1' || !Array.isArray(receipt.events)) {
    return { status: 'INCONCLUSIVE', failure_signals: ['invalid_execution_receipt'] };
  }
  const { events, run_id: runId, definition_digest: digest, budget } = receipt;
  const eventTypes = new Set(['terminal', 'cancelled', 'stage_completed', 'checkpoint_restored', 'operation', 'warning', 'inventory', 'model_call']);
  if (events.some(event => !event || typeof event !== 'object' || !eventTypes.has(event.type))) {
    return { status: 'INCONCLUSIVE', failure_signals: ['invalid_execution_event'] };
  }
  if (typeof runId !== 'string' || !runId || typeof digest !== 'string' || !digest) fail('missing_run_identity');
  const terminal = events.filter(event => event.type === 'terminal');
  if (terminal.length !== 1) fail('missing_or_duplicate_terminal');
  else if (terminal[0].status !== 'completed' || terminal[0].exit_code !== 0) fail('execution_not_completed');
  if (events.some(event => event.type === 'cancelled')) fail('cancelled_execution');

  const requiredStages = receipt.required_stages;
  if (!Array.isArray(requiredStages) || !requiredStages.length || requiredStages.some(stage => typeof stage !== 'string' || !stage)) {
    fail('missing_required_stages');
  } else {
    for (const stage of requiredStages) {
      if (!events.some(event => event.type === 'stage_completed' && event.stage === stage && event.run_id === runId && event.definition_digest === digest)) {
        fail('missing_current_stage');
      }
    }
  }
  for (const checkpoint of events.filter(event => event.type === 'checkpoint_restored')) {
    if (checkpoint.run_id !== runId || checkpoint.definition_digest !== digest) fail('stale_checkpoint');
  }
  // Informational warnings never replace the outcome of individual operations.
  for (const operation of events.filter(event => event.type === 'operation')) {
    if (operation.status !== 'completed') fail('operation_failed_or_incomplete');
  }
  for (const inventory of events.filter(event => event.type === 'inventory')) {
    if (!Number.isSafeInteger(inventory.expected_total) || inventory.expected_total < 0 || !Array.isArray(inventory.items)) {
      fail('inventory_completeness_unverified');
    } else if (inventory.complete !== true || inventory.next_cursor !== null || inventory.items.length !== inventory.expected_total || new Set(inventory.items).size !== inventory.items.length) {
      fail('truncated_or_ambiguous_inventory');
    }
  }
  const calls = events.filter(event => event.type === 'model_call');
  if (!budget || !Number.isSafeInteger(budget.max_calls) || budget.max_calls < 0 || typeof budget.gateway_id !== 'string' || !budget.gateway_id) {
    fail('missing_budget_contract');
  } else {
    if (calls.length > budget.max_calls) fail('model_call_budget_exceeded');
    const reservations = new Set();
    for (const call of calls) {
      if (call.gateway_id !== budget.gateway_id || typeof call.reservation_id !== 'string' || !call.reservation_id || reservations.has(call.reservation_id)) fail('model_call_gateway_bypass');
      reservations.add(call.reservation_id);
    }
  }
  if (terminal.length === 1 && events[events.length - 1] !== terminal[0]) fail('events_after_terminal');
  return { status: signals.size ? 'FAIL' : 'PASS', failure_signals: [...signals].sort() };
}

module.exports = { checkExecutionReceipt };
if (require.main === module) {
  let result;
  try { result = checkExecutionReceipt(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))); }
  catch { result = { status: 'INCONCLUSIVE', failure_signals: ['unreadable_execution_receipt'] }; }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}
