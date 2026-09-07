'use strict';

// Only final provider counters from a single invocation are accepted. Event
// deltas, repeated finals, prompt byte proxies, and prices are never added here.
// Semantics: https://developers.openai.com/codex/noninteractive
// https://code.claude.com/docs/en/agent-sdk/cost-tracking
// https://platform.claude.com/docs/en/build-with-claude/prompt-caching

function parseStrictJson(text) {
  let cursor = 0;
  const whitespace = () => { while (/[\x20\t\r\n]/.test(text[cursor] || '') && cursor < text.length) cursor++; };
  function string() {
    const start = cursor++;
    while (cursor < text.length) {
      const ch = text[cursor++];
      if (ch === '\\') cursor++;
      else if (ch === '"') return JSON.parse(text.slice(start, cursor));
    }
    throw new Error('malformed_event');
  }
  function value(depth) {
    if (depth > 100) throw new Error('malformed_event');
    whitespace();
    const ch = text[cursor];
    if (ch === '"') return string();
    if (ch === '{' || ch === '[') {
      cursor++;
      const object = ch === '{';
      const out = object ? Object.create(null) : [];
      const end = object ? '}' : ']';
      whitespace();
      if (text[cursor] === end) { cursor++; return out; }
      while (cursor < text.length) {
        whitespace();
        if (object) {
          if (text[cursor] !== '"') throw new Error('malformed_event');
          const key = string();
          if (Object.hasOwn(out, key)) throw new Error('duplicate_json_key');
          whitespace();
          if (text[cursor++] !== ':') throw new Error('malformed_event');
          out[key] = value(depth + 1);
        } else out.push(value(depth + 1));
        whitespace();
        const separator = text[cursor++];
        if (separator === end) return out;
        if (separator !== ',') throw new Error('malformed_event');
      }
      throw new Error('malformed_event');
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(cursor));
    if (!token) throw new Error('malformed_event');
    cursor += token[0].length;
    return JSON.parse(token[0]);
  }
  const result = value(0);
  whitespace();
  if (cursor !== text.length) throw new Error('malformed_event');
  return result;
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function parseEvents(jsonl) {
  return jsonl.split(/\r?\n/).filter(line => line.trim()).map(line => {
    const event = parseStrictJson(line);
    if (!isObject(event) || typeof event.type !== 'string') throw new Error('malformed_event');
    return event;
  });
}
function counter(usage, name, required = false) {
  if (!Object.hasOwn(usage, name)) {
    if (required) throw new Error('missing_usage_field');
    return null;
  }
  const number = usage[name];
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('invalid_usage_field');
  return number;
}
function sum(...values) {
  if (values.includes(null)) return null;
  const number = values.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(number)) throw new Error('usage_overflow');
  return number;
}
function unknownUsage(runtime, reason) {
  return {
    schema_version: 1, runtime, measurement_kind: 'unknown', usage_status: 'unknown',
    fallback_reason: reason, usage_scope: 'unknown', source_event: null,
    aggregation: 'none', input_tokens: null, uncached_input_tokens: null,
    cached_input_tokens: null, cache_creation_input_tokens: null,
    output_tokens: null, reasoning_tokens: null,
    reasoning_semantics: 'unknown', input_output_tokens: null,
    billing_amount: null,
  };
}
function parseUsage(runtime, jsonl, { invocationFailed = false } = {}) {
  try {
    if (!['codex', 'claude'].includes(runtime)) throw new Error('unsupported_runtime');
    const events = parseEvents(jsonl);
    const finalType = runtime === 'codex' ? 'turn.completed' : 'result';
    const finals = events.filter(event => event.type === finalType);
    if (!finals.length) throw new Error('missing_final_usage');
    if (finals.length !== 1) throw new Error('duplicate_final_usage');
    const final = finals[0];
    if (!isObject(final.usage)) throw new Error('missing_final_usage');
    // Error-result counters may be zeroed or only cover part of a crashed
    // invocation. Do not advertise these as its measured cost, even if zero.
    if (invocationFailed || (runtime === 'claude' && (final.is_error === true || final.subtype !== 'success'))
        || events.some(event => event.type === 'turn.failed' || event.type === 'error')) {
      throw new Error('failed_invocation_usage_incomplete');
    }
    const usage = final.usage;
    const input = counter(usage, 'input_tokens', true);
    const output = counter(usage, 'output_tokens', true);
    const measured = { ...unknownUsage(runtime, null), measurement_kind: 'provider_observed',
      usage_status: 'observed', source_event: `${finalType}.usage`, aggregation: 'single_final_only',
      output_tokens: output };
    if (runtime === 'codex') {
      const cached = counter(usage, 'cached_input_tokens');
      if (cached !== null && cached > input) throw new Error('invalid_cache_subset');
      measured.usage_scope = 'single_turn';
      measured.input_tokens = input;
      measured.cached_input_tokens = cached;
      measured.uncached_input_tokens = cached === null ? null : input - cached;
      measured.reasoning_tokens = counter(usage, 'reasoning_output_tokens');
      measured.reasoning_semantics = measured.reasoning_tokens === null ? 'unknown' : 'provider_reported_not_added';
    } else {
      measured.usage_scope = 'main_agent_loop';
      measured.uncached_input_tokens = input;
      measured.cached_input_tokens = counter(usage, 'cache_read_input_tokens');
      measured.cache_creation_input_tokens = counter(usage, 'cache_creation_input_tokens');
      measured.input_tokens = sum(input, measured.cached_input_tokens, measured.cache_creation_input_tokens);
      if (measured.input_tokens === null) measured.usage_status = 'partial';
    }
    // A convenient non-billing sum; cache is already in input. Reasoning is
    // preserved separately and never added speculatively to output.
    measured.input_output_tokens = sum(measured.input_tokens, output);
    return measured;
  } catch (error) {
    const reasons = new Set(['malformed_event', 'duplicate_json_key', 'missing_final_usage', 'duplicate_final_usage',
      'missing_usage_field', 'invalid_usage_field', 'usage_overflow', 'invalid_cache_subset',
      'failed_invocation_usage_incomplete', 'unsupported_runtime']);
    return unknownUsage(runtime, reasons.has(error.message) ? error.message : 'malformed_event');
  }
}

module.exports = { parseUsage, parseEvents, parseStrictJson, unknownUsage };
