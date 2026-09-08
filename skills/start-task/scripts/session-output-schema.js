'use strict';

// Preflight the subset used by our two repository-owned output schemas. This
// does not replace provider validation or validate a worker's response.
const {regularFile, parseJson, hash} = require('./model-routing-io.js');
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const COMMON = ['type', 'title', 'description', 'const', 'enum'];
const fail = code => { throw Object.assign(new Error(code), {code}); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateOutputSchema(schema) {
  let nodes = 0;
  const ancestors = new Set();
  function visit(node, depth) {
    if (!object(node) || ancestors.has(node) || depth > 10 || ++nodes > 512)
      fail('OUTPUT_SCHEMA_INVALID');
    ancestors.add(node);
    const types = typeof node.type === 'string' ? [node.type] : node.type;
    if (!Array.isArray(types) || !types.length || types.some(type => !TYPES.has(type))
      || new Set(types).size !== types.length || types.length > 2
      || (types.length === 2 && !types.includes('null'))
      || (depth === 0 && node.type !== 'object')) fail('OUTPUT_SCHEMA_INVALID');
    const base = types.find(type => type !== 'null') || 'null';
    const allowed = new Set([...COMMON, ...(depth === 0 ? ['$schema', '$id'] : []),
      ...(base === 'object' ? ['properties', 'required', 'additionalProperties'] : []),
      ...(base === 'array' ? ['items', 'minItems', 'maxItems'] : []),
      ...(base === 'string' ? ['pattern', 'minLength', 'maxLength'] : [])]);
    if (Object.keys(node).some(key => !allowed.has(key))) fail('OUTPUT_SCHEMA_UNSUPPORTED');
    for (const key of ['title', 'description', '$schema', '$id'])
      if (Object.hasOwn(node, key) && typeof node[key] !== 'string') fail('OUTPUT_SCHEMA_INVALID');
    if (base === 'object') {
      if (!object(node.properties) || node.additionalProperties !== false || !Array.isArray(node.required)
        || node.required.some(key => typeof key !== 'string')
        || new Set(node.required).size !== node.required.length
        || node.required.length !== Object.keys(node.properties).length
        || node.required.some(key => !Object.hasOwn(node.properties, key))) fail('OUTPUT_SCHEMA_INVALID');
      for (const child of Object.values(node.properties)) visit(child, depth + 1);
    }
    if (base === 'array') visit(node.items, depth + 1);
    for (const [minimum, maximum] of [['minItems', 'maxItems'], ['minLength', 'maxLength']]) {
      for (const key of [minimum, maximum]) if (Object.hasOwn(node, key)
        && (!Number.isSafeInteger(node[key]) || node[key] < 0)) fail('OUTPUT_SCHEMA_INVALID');
      if (node[minimum] !== undefined && node[maximum] !== undefined && node[minimum] > node[maximum])
        fail('OUTPUT_SCHEMA_INVALID');
    }
    if (Object.hasOwn(node, 'pattern')) {
      if (typeof node.pattern !== 'string') fail('OUTPUT_SCHEMA_INVALID');
      try { new RegExp(node.pattern); } catch { fail('OUTPUT_SCHEMA_INVALID'); }
    }
    const literalMatches = value => types.some(type => type === 'null' ? value === null
      : type === 'integer' ? Number.isSafeInteger(value)
      : type === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : ['string', 'boolean'].includes(type) && typeof value === type);
    if (Object.hasOwn(node, 'const') && !literalMatches(node.const)) fail('OUTPUT_SCHEMA_INVALID');
    if (Object.hasOwn(node, 'enum') && (!Array.isArray(node.enum) || !node.enum.length
      || node.enum.some(value => !literalMatches(value))
      || new Set(node.enum).size !== node.enum.length
      || (Object.hasOwn(node, 'const') && !node.enum.includes(node.const)))) fail('OUTPUT_SCHEMA_INVALID');
    ancestors.delete(node);
  }
  visit(schema, 0);
  let serialized;
  try { serialized = JSON.stringify(schema); } catch { fail('OUTPUT_SCHEMA_INVALID'); }
  if (Buffer.byteLength(serialized) > 65536) fail('OUTPUT_SCHEMA_INVALID');
  return schema;
}

function readOutputSchema(filename) {
  const bytes = regularFile(filename, 65536);
  let schema;
  try { schema = parseJson(bytes.toString('utf8')); } catch { fail('OUTPUT_SCHEMA_INVALID'); }
  validateOutputSchema(schema);
  return {schema, sha256: hash(bytes)};
}

module.exports = {validateOutputSchema, readOutputSchema};
