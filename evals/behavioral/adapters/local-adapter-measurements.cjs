#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { parseUsage, parseStrictJson, unknownUsage } = require('./provider-usage.cjs');

function measure({ runtime, stream, prompt, context, invocationFailed = false }) {
  const bytes = Buffer.byteLength(prompt, 'utf8');
  return {
    schema: 'vulpora.adapter-measurements', schema_version: 1,
    usage: parseUsage(runtime, stream, { invocationFailed }),
    prompt_proxy: {
      measurement_kind: 'byte_quarter_proxy', encoding: 'utf8', scope: 'adapter_prompt_only',
      bytes, estimated_tokens: Math.ceil(bytes / 4),
      excludes: 'runtime_system_tools_history_outputs',
    },
    context,
  };
}

// The runner retains this allowlisted projection, never arbitrary adapter JSON
// or raw model output. Invalid evidence becomes explicitly unknown.
function projectMeasurements(value) {
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  const enumeration = (value, choices) => { if (!choices.includes(value)) throw new Error('invalid'); return value; };
  const token = value => { if (value !== null && !integer(value)) throw new Error('invalid'); return value; };
  const id = value => { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(value)) throw new Error('invalid'); return value; };
  const u = value.usage;
  const usage = {
    schema_version: 1,
    runtime: enumeration(u.runtime, ['codex', 'claude']),
    measurement_kind: enumeration(u.measurement_kind, ['unknown', 'provider_observed']),
    usage_status: enumeration(u.usage_status, ['unknown', 'observed', 'partial']),
    fallback_reason: enumeration(u.fallback_reason, [null, 'malformed_event', 'duplicate_json_key', 'missing_final_usage',
      'duplicate_final_usage', 'missing_usage_field', 'invalid_usage_field', 'usage_overflow', 'invalid_cache_subset',
      'failed_invocation_usage_incomplete', 'unsupported_runtime']),
    usage_scope: enumeration(u.usage_scope, ['unknown', 'single_turn', 'main_agent_loop']),
    source_event: enumeration(u.source_event, [null, 'turn.completed.usage', 'result.usage']),
    aggregation: enumeration(u.aggregation, ['none', 'single_final_only']),
    reasoning_semantics: enumeration(u.reasoning_semantics, ['unknown', 'provider_reported_not_added']),
    billing_amount: null,
  };
  for (const key of ['input_tokens', 'uncached_input_tokens', 'cached_input_tokens', 'cache_creation_input_tokens',
    'output_tokens', 'reasoning_tokens', 'input_output_tokens']) usage[key] = token(u[key]);
  if (u.measurement_kind === 'unknown' && Object.keys(usage).some(key => key.endsWith('_tokens') && usage[key] !== null)) throw new Error('invalid');
  if (usage.cached_input_tokens !== null && usage.input_tokens !== null && usage.cached_input_tokens > usage.input_tokens) throw new Error('invalid');
  const p = value.prompt_proxy;
  if (!integer(p.bytes) || !integer(p.estimated_tokens) || p.estimated_tokens !== Math.ceil(p.bytes / 4)) throw new Error('invalid');
  const prompt_proxy = {
    measurement_kind: enumeration(p.measurement_kind, ['byte_quarter_proxy']),
    encoding: enumeration(p.encoding, ['utf8']), scope: enumeration(p.scope, ['adapter_prompt_only']),
    bytes: p.bytes, estimated_tokens: p.estimated_tokens,
    excludes: enumeration(p.excludes, ['runtime_system_tools_history_outputs']),
  };
  const c = value.context;
  if (!Array.isArray(c.loaded_files) || c.loaded_files.length > 256 || c.runtime_discovery_measured !== false) throw new Error('invalid');
  const context = {
    schema_version: 1, asset: id(c.asset), source_kind: enumeration(c.source_kind, [null, 'agent', 'skill']),
    baseline: enumeration(c.baseline, ['plain-runtime', 'agent-only', 'agent-memory']),
    context_mode: enumeration(c.context_mode, ['none', 'complete_entry_injection']),
    references_available: enumeration(c.references_available, ['only_inlined_files_and_fixture']),
    runtime_discovery_measured: false,
    loaded_files: c.loaded_files.map(file => {
      if (typeof file.path !== 'string' || !/^(skills|agents|memory)\/[A-Za-z0-9_./-]+$/.test(file.path)
          || file.path.split('/').some(part => !part || part === '.' || part === '..')
          || !integer(file.bytes) || file.bytes === 0 || !/^[a-f0-9]{64}$/.test(file.sha256) || file.complete !== true) throw new Error('invalid');
      return { path: file.path, role: enumeration(file.role, ['skill_entry', 'agent_definition', 'agent_soul', 'agent_principles', 'memory_policy']),
        bytes: file.bytes, sha256: file.sha256, complete: true };
    }),
  };
  if (value.schema !== 'vulpora.adapter-measurements' || value.schema_version !== 1) throw new Error('invalid');
  return { schema: value.schema, schema_version: 1, usage, prompt_proxy, context };
}

function retainedMeasurements(file) {
  try {
    if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 131072) throw new Error('invalid');
    return projectMeasurements(parseStrictJson(fs.readFileSync(file, 'utf8')));
  } catch {
    return { schema: 'vulpora.adapter-measurements', schema_version: 1,
      usage: unknownUsage('unknown', 'missing_or_invalid_measurements'), prompt_proxy: null, context: null };
  }
}

module.exports = { measure, projectMeasurements, retainedMeasurements };
if (require.main === module) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'retain') {
      process.stdout.write(JSON.stringify(retainedMeasurements(args[0])) + '\n');
    } else if (command === 'measure') {
      const [runtime, streamFile, promptFile, contextFile, outputFile, failed = '0'] = args;
      const measured = measure({ runtime, stream: fs.readFileSync(streamFile, 'utf8'),
        prompt: fs.readFileSync(promptFile, 'utf8'), context: parseStrictJson(fs.readFileSync(contextFile, 'utf8')),
        invocationFailed: failed !== '0' });
      const safe = projectMeasurements(measured);
      if (outputFile) fs.writeFileSync(outputFile, JSON.stringify(safe) + '\n', { mode: 0o600 });
      process.stdout.write(`estimated_tokens: ${safe.prompt_proxy.estimated_tokens}\n`
        + 'estimated_tokens_measurement_kind: byte_quarter_proxy\nestimated_tokens_scope: adapter_prompt_only\n');
    } else throw new Error('unknown command');
  } catch {
    process.stderr.write('Cannot summarize adapter measurements.\n');
    process.exitCode = 2;
  }
}
