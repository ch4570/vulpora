'use strict';

// Bounded, content-free accounting for runtime events.  These counters are
// diagnostics and byte proxies only; they are not provider usage or billing.
const crypto = require('node:crypto');

const MAP_LIMIT = 128;
const COUNTER_LIMIT = Number.MAX_SAFE_INTEGER;
const EVENT_TYPES = Object.freeze(['thread.started', 'turn.started', 'turn.completed', 'turn.failed',
  'item.started', 'item.updated', 'item.completed', 'error']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const bytes = value => typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : 0;

function createTelemetry() {
  const totals = Object.fromEntries([...EVENT_TYPES, 'other'].map(type => [type, 0]));
  const categories = {commandExecutions: 0, fileChanges: 0, agentMessages: 0};
  const commandBytes = {command: 0, aggregatedOutput: 0};
  const fingerprints = new Map();
  const state = {saturated: false, fingerprintOverflow: false};

  function add(target, key, amount = 1) {
    if (!Number.isSafeInteger(amount) || amount < 0) return;
    const previous = Number.isSafeInteger(target[key]) ? target[key] : 0;
    const next = previous + amount;
    if (!Number.isSafeInteger(next) || next > COUNTER_LIMIT) {
      target[key] = COUNTER_LIMIT; state.saturated = true;
    } else target[key] = next;
  }
  function agentTextBytes(item) {
    let total = 0;
    const visit = value => {
      if (typeof value === 'string') { total += bytes(value); return; }
      // Codex content blocks are a bounded array of objects with a direct text
      // field. Do not walk arbitrary nested objects or follow aliases/cycles.
      if (!Array.isArray(value)) return;
      for (const entry of value.slice(0, 256)) {
        if (object(entry) && typeof entry.text === 'string') total += bytes(entry.text);
      }
    };
    for (const key of ['text', 'message', 'content']) {
      if (!Object.hasOwn(item, key)) continue;
      const value = item[key];
      if (typeof value === 'string') total += bytes(value);
      else if (key === 'content') visit(value);
    }
    return Number.isSafeInteger(total) ? total : COUNTER_LIMIT;
  }
  function observe(event) {
    try {
      if (!object(event) || typeof event.type !== 'string') return;
      add(totals, Object.hasOwn(totals, event.type) ? event.type : 'other');
      if (event.type !== 'item.completed' || !object(event.item) || typeof event.item.type !== 'string') return;
      const item = event.item;
      if (item.type === 'command_execution') {
        add(categories, 'commandExecutions');
        const commandSize = bytes(item.command), outputSize = bytes(item.aggregated_output);
        add(commandBytes, 'command', commandSize); add(commandBytes, 'aggregatedOutput', outputSize);
        const fingerprint = crypto.createHash('sha256').update(typeof item.command === 'string' ? item.command : '').digest('hex').slice(0, 16);
        let record = fingerprints.get(fingerprint);
        if (!record) {
          if (fingerprints.size >= MAP_LIMIT) { state.fingerprintOverflow = true; return; }
          record = {count: 0, commandBytes: 0, aggregatedOutputBytes: 0}; fingerprints.set(fingerprint, record);
        }
        add(record, 'count'); add(record, 'commandBytes', commandSize); add(record, 'aggregatedOutputBytes', outputSize);
      } else if (item.type === 'file_change' || item.type === 'file_changes') {
        add(categories, 'fileChanges');
      } else if (item.type === 'agent_message' || item.type === 'message') {
        add(categories, 'agentMessages'); add(commandBytes, 'agentTextBytes', agentTextBytes(item));
      }
    } catch {
      // Runtime events are untrusted diagnostics input; never affect execution.
    }
  }
  function summary() {
    const eventTypes = {};
    for (const key of Object.keys(totals).sort()) eventTypes[key] = totals[key];
    const repeatedCommands = [...fingerprints.entries()]
      .filter(([, record]) => record.count > 1).sort(([a], [b]) => a.localeCompare(b))
      .map(([fingerprint, record]) => ({fingerprint, ...record}));
    return {schema: 'vulpora.session-telemetry/v1', measurementKind: 'runtime_event_counts_and_utf8_bytes',
      providerTokenAttribution: 'unavailable', rawContentRetained: false, eventTypes,
      itemCompleted: {...categories}, byteProxies: {...commandBytes,
        labels: {command: 'utf8_bytes', aggregatedOutput: 'utf8_bytes', agentTextBytes: 'utf8_bytes'}},
      repeatedCommands, caps: {fingerprints: MAP_LIMIT}, saturation: state.saturated,
      fingerprintOverflow: state.fingerprintOverflow};
  }
  return {observe, summary};
}

module.exports = {createTelemetry, MAP_LIMIT};
