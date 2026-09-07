#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const REPORT_SCHEMA_ID = 'https://vulpora.local/schemas/orchestration-report-v3.schema.json';
const REPORT_SCHEMA_VERSION = 'vulpora.orchestration-report/v3';

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function projectOutputSchema(value) {
  const source = structuredClone(value);
  function resolveLocalRef(ref) {
    if (typeof ref !== 'string' || !ref.startsWith('#/')) throw new Error('OUTPUT_SCHEMA_REF_UNSUPPORTED');
    return ref.slice(2).split('/').reduce((current, token) => current?.[token.replace(/~1/g, '/').replace(/~0/g, '~')], source);
  }
  function mergeSchemas(left, right) {
    const merged = {...left};
    for (const [key, candidate] of Object.entries(right)) {
      if (key === 'properties') merged.properties = {...(merged.properties || {}), ...candidate};
      else if (key === 'required') merged.required = [...new Set([...(merged.required || []), ...candidate])];
      else if (merged[key] === undefined) merged[key] = candidate;
      else if (JSON.stringify(merged[key]) !== JSON.stringify(candidate)) throw new Error('OUTPUT_SCHEMA_ALLOF_CONFLICT');
    }
    return merged;
  }
  function materializeAllOf(node) {
    let merged = {};
    for (const branch of node.allOf || []) {
      let candidate = structuredClone(branch);
      if (candidate.$ref) {
        const referenced = resolveLocalRef(candidate.$ref);
        if (!referenced) throw new Error('OUTPUT_SCHEMA_REF_UNRESOLVED');
        delete candidate.$ref;
        candidate = mergeSchemas(structuredClone(referenced), candidate);
      }
      merged = mergeSchemas(merged, candidate);
    }
    const remainder = {...node};
    delete remainder.allOf;
    return mergeSchemas(merged, remainder);
  }
  function visit(input) {
    if (Array.isArray(input)) return input.map(visit);
    if (!input || typeof input !== 'object') return input;
    let node = input.allOf ? materializeAllOf(input) : {...input};
    delete node.oneOf;
    if (node.type === 'array' && !node.items && node.contains) {
      if (Object.hasOwn(node.contains, 'const')) node.items = {type: jsonType(node.contains.const)};
      else if (Array.isArray(node.contains.enum) && node.contains.enum.length > 0) {
        const types = [...new Set(node.contains.enum.map(jsonType))];
        if (types.length === 1) node.items = {type: types[0]};
      }
    }
    delete node.contains;
    delete node.uniqueItems;
    if (node.prefixItems) {
      const tuple = node.prefixItems.map(visit);
      delete node.prefixItems;
      node.items = tuple.length === 1 ? tuple[0] : {anyOf: tuple};
    }
    for (const [key, child] of Object.entries(node)) node[key] = visit(child);
    if (!node.type && Object.hasOwn(node, 'const')) node.type = jsonType(node.const);
    if (!node.type && Array.isArray(node.enum) && node.enum.length > 0) {
      const types = [...new Set(node.enum.map(jsonType))];
      if (types.length === 1) [node.type] = types;
    }
    if (!node.type && node.properties) node.type = 'object';
    if (node.type === 'object' && node.properties) {
      node.required = Object.keys(node.properties);
      node.additionalProperties = false;
    }
    return node;
  }
  return visit(source);
}

function loadReportSchema(schemaPath) {
  let stat;
  let bytes;
  try {
    stat = fs.lstatSync(schemaPath);
    bytes = fs.readFileSync(schemaPath);
  } catch {
    throw new Error('REPORT_SCHEMA_UNREADABLE');
  }
  if (!stat.isFile() || stat.isSymbolicLink() || bytes.length === 0 || bytes.length > 1024 * 1024) {
    throw new Error('REPORT_SCHEMA_INVALID_FILE');
  }
  let schema;
  try { schema = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('REPORT_SCHEMA_INVALID_JSON'); }
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || schema.$id !== REPORT_SCHEMA_ID
    || schema.properties?.schema_version?.const !== REPORT_SCHEMA_VERSION) {
    throw new Error('REPORT_SCHEMA_ID_MISMATCH');
  }
  return projectOutputSchema(schema);
}

function buildTurnStartParams({threadId, prompt, fixture, outputSchema}) {
  if (typeof threadId !== 'string' || threadId.length === 0
    || typeof prompt !== 'string' || prompt.length === 0
    || typeof fixture !== 'string' || fixture.length === 0
    || outputSchema?.$id !== REPORT_SCHEMA_ID) throw new Error('TURN_CONTRACT_INPUT_INVALID');
  return {
    threadId,
    input: [{type: 'text', text: prompt}],
    approvalPolicy: 'never',
    sandboxPolicy: {type: 'workspaceWrite', writableRoots: [fixture], networkAccess: false},
    effort: 'medium',
    outputSchema,
  };
}

module.exports = {
  REPORT_SCHEMA_ID,
  REPORT_SCHEMA_VERSION,
  buildTurnStartParams,
  loadReportSchema,
  projectOutputSchema,
};
