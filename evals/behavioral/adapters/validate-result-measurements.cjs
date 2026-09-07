#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { parseStrictJson, unknownUsage } = require('./provider-usage.cjs');
const { projectMeasurements } = require('./local-adapter-measurements.cjs');
const stable = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]))
  : value;
const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const invalid = () => { throw new Error('INVALID_RESULT_MEASUREMENTS'); };

function validateEnvelope(value) {
  const missing = { schema: 'vulpora.adapter-measurements', schema_version: 1,
    usage: unknownUsage('unknown', 'missing_or_invalid_measurements'), prompt_proxy: null, context: null };
  if (equal(value, missing)) return value;
  // Projection is deliberately permissive at raw-adapter ingestion; retained
  // result validation instead rejects every field it would strip or normalize.
  const projected = projectMeasurements(value);
  if (!equal(value, projected)) invalid();
  const u = projected.usage;
  const total = u.input_tokens === null || u.output_tokens === null ? null : u.input_tokens + u.output_tokens;
  if (u.input_output_tokens !== total) invalid();
  const paths = projected.context.loaded_files.map(file => file.path);
  if (new Set(paths).size !== paths.length) invalid();
  return projected;
}

function validateResultMeasurements(text) {
  if (Buffer.byteLength(text) > 4194304) invalid();
  let section = '', envelope, seenEnvelope = false;
  const metadata = Object.create(null);
  for (const line of text.split(/\r?\n/)) {
    const root = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(line);
    if (root) section = root[1];
    if (/^[ \t]*measurements:/.test(line)) {
      const match = /^measurements: (\{.*\})$/.exec(line);
      if (!match || seenEnvelope) invalid();
      seenEnvelope = true;
      envelope = validateEnvelope(parseStrictJson(match[1]));
    }
    const key = /^[ \t]*(estimated_tokens_measurement_kind|estimated_tokens_scope):/.exec(line);
    if (key) {
      const match = /^  (estimated_tokens_measurement_kind|estimated_tokens_scope): ([a-z_]+)$/.exec(line);
      if (section !== 'metrics' || !match || Object.hasOwn(metadata, key[1])) invalid();
      metadata[key[1]] = match[2];
    }
  }
  const kind = metadata.estimated_tokens_measurement_kind;
  const scope = metadata.estimated_tokens_scope;
  if (kind !== undefined || scope !== undefined) {
    if (!['unknown:unknown', 'byte_quarter_proxy:adapter_prompt_only'].includes(`${kind}:${scope}`)) invalid();
  }
  if (envelope?.prompt_proxy) {
    if (kind !== 'byte_quarter_proxy' || scope !== 'adapter_prompt_only') invalid();
    // The separately emitted proxy must agree with its retained provenance.
    const tokens = text.match(/^  estimated_tokens: ([0-9]+)$/gm) || [];
    if (tokens.length !== 1 || Number(tokens[0].split(': ')[1]) !== envelope.prompt_proxy.estimated_tokens) invalid();
  }
  return true;
}

module.exports = { validateEnvelope, validateResultMeasurements };
if (require.main === module) {
  try {
    if (process.argv.length !== 3 || fs.statSync(process.argv[2]).size > 4194304) invalid();
    validateResultMeasurements(fs.readFileSync(process.argv[2], 'utf8'));
  } catch {
    process.stderr.write('invalid result measurement schema or provenance\n');
    process.exitCode = 1;
  }
}
