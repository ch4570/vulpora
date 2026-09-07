#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {writeCanonicalValue} = require('./write-canonical-json.js');

const MAX_INPUT_BYTES = 1024 * 1024;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const SPEC_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SPEC_FIELDS = [
  'spec_id', 'status', 'clarity_projection', 'goal', 'context', 'scope', 'requirements',
  'acceptance_criteria', 'constraints', 'assumptions', 'decisions', 'authority', 'verification', 'provenance',
];

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function readCandidate() {
  let bytes;
  try { bytes = fs.readFileSync(0); } catch { fail('INPUT_READ_FAILED'); }
  if (bytes.length === 0 || bytes.length > MAX_INPUT_BYTES) fail('INPUT_SIZE_INVALID');
  let candidate;
  try { candidate = JSON.parse(bytes.toString('utf8')); } catch { fail('INVALID_CANDIDATE_JSON'); }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) fail('INVALID_CANDIDATE');
  return candidate;
}

function normalizeCandidateShape(candidate) {
  const normalized = [];
  if (typeof candidate.spec_id === 'string' && !SPEC_ID.test(candidate.spec_id)) {
    const specId = candidate.spec_id.replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 128);
    if (!SPEC_ID.test(specId)) fail('CANDIDATE_SPEC_ID_INVALID');
    candidate.spec_id = specId;
    normalized.push('spec_id_characters');
  }
  if (Array.isArray(candidate.requirements)) {
    candidate.requirements = {functional: candidate.requirements, non_functional: []};
    normalized.push('requirements_array');
  }
  if (candidate.verification && typeof candidate.verification === 'object'
    && !Array.isArray(candidate.verification)) {
    candidate.verification = [candidate.verification];
    normalized.push('verification_object');
  }
  if (Array.isArray(candidate.verification)) {
    let methodNormalized = false;
    candidate.verification = candidate.verification.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || item.command_or_method !== undefined) return item;
      const commandOrMethod = item.command ?? item.method;
      if (typeof commandOrMethod !== 'string' || commandOrMethod.length === 0) return item;
      methodNormalized = true;
      return {...item, command_or_method: commandOrMethod};
    });
    if (methodNormalized) normalized.push('verification_method');
  }
  const gate = candidate.clarity_projection?.clarity_gate;
  if (gate && typeof gate === 'object' && !Array.isArray(gate)) {
    if (gate.dimensions && !Array.isArray(gate.dimensions) && typeof gate.dimensions === 'object') {
      gate.dimensions = Object.entries(gate.dimensions).map(([id, value]) => ({id, ...value}));
      normalized.push('clarity_dimensions_object');
    }
    if (Array.isArray(gate.dimensions) && gate.dimensions.some((item) => item?.id === undefined && item?.dimension)) {
      gate.dimensions = gate.dimensions.map((item) => item?.id === undefined && item?.dimension
        ? {id: item.dimension, ...Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'dimension'))}
        : item);
      normalized.push('clarity_dimension_id');
    }
    if (gate.status === 'passed' && (gate.skip === null || gate.skip === undefined)) {
      gate.skip = {requested: false, basis: null, reason: null, decision_ref: null, decision_context: null,
        accepted_risk_unknown_ids: [], non_bypassable_blocker_ids: []};
      normalized.push('clarity_passed_skip');
    }
  }
  return normalized;
}

function validateCandidate(candidate) {
  const candidateSchema = candidate.schema === 'vulpora.clarified-task-spec-candidate/v2';
  const finalProposalSchema = candidate.schema === 'vulpora.clarified-task-spec/v2';
  if ((!candidateSchema && !finalProposalSchema) || candidate.status !== 'ready'
    || (candidateSchema && candidate.approval !== true)
    || (finalProposalSchema && candidate.clarity_projection?.approval !== true)
    || !SPEC_ID.test(candidate.spec_id || '')) fail('CANDIDATE_NOT_APPROVED');
  if (Object.hasOwn(candidate, 'unknowns') || Object.hasOwn(candidate, 'clarity_gate')) {
    fail('DUPLICATE_CLARITY_PROJECTION');
  }
  for (const field of SPEC_FIELDS) {
    if (!Object.hasOwn(candidate, field)) fail(`CANDIDATE_FIELD_MISSING_${field.toUpperCase()}`);
  }
  if (typeof candidate.goal !== 'string' || candidate.goal.trim().length === 0
    || !Array.isArray(candidate.acceptance_criteria) || candidate.acceptance_criteria.length === 0) {
    fail('CANDIDATE_CONTENT_INVALID');
  }
  for (const field of ['constraints', 'assumptions', 'decisions', 'verification']) {
    if (!Array.isArray(candidate[field])) fail('CANDIDATE_CONTENT_INVALID');
  }
  for (const field of ['context', 'scope', 'requirements', 'authority', 'provenance', 'clarity_projection']) {
    if (!candidate[field] || typeof candidate[field] !== 'object' || Array.isArray(candidate[field])) {
      fail('CANDIDATE_CONTENT_INVALID');
    }
  }
}

function normalizedAcceptanceCriteria(criteria) {
  const seen = new Set();
  return criteria.map((criterion, index) => {
    if (typeof criterion === 'string') {
      if (criterion.trim().length === 0) fail('CANDIDATE_ACCEPTANCE_INVALID');
      const id = `AC-${String(index + 1).padStart(3, '0')}`;
      if (seen.has(id)) fail('CANDIDATE_ACCEPTANCE_INVALID');
      seen.add(id);
      return {id, description: criterion};
    }
    const description = criterion?.description ?? criterion?.statement;
    if (!criterion || typeof criterion !== 'object' || Array.isArray(criterion)
      || !SPEC_ID.test(criterion.id || '') || seen.has(criterion.id)
      || typeof description !== 'string' || description.trim().length === 0
      || (criterion.description !== undefined && criterion.statement !== undefined
        && criterion.description !== criterion.statement)) {
      fail('CANDIDATE_ACCEPTANCE_INVALID');
    }
    seen.add(criterion.id);
    return {id: criterion.id, description};
  });
}

function validateProjection(projection) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'validate-clarity-gate.js')], {
    cwd: process.cwd(),
    encoding: 'utf8',
    input: JSON.stringify(projection),
    shell: false,
  });
  if (result.status !== 0) fail(`CLARITY_PROJECTION_INVALID_${(result.stderr || '').trim() || 'UNKNOWN'}`);
}

function main() {
  if (process.argv.length !== 3 || !RUN_ID.test(process.argv[2] || '')) fail('USAGE_RUN_ID');
  const runId = process.argv[2];
  const candidate = readCandidate();
  const normalizedInputFields = normalizeCandidateShape(candidate);
  validateCandidate(candidate);
  validateProjection(candidate.clarity_projection);
  const acceptanceCriteria = normalizedAcceptanceCriteria(candidate.acceptance_criteria);

  const base = `.vulpora/tasks/${runId}`;
  const projection = writeCanonicalValue(`${base}/clarity-projection.json`, candidate.clarity_projection);
  const specValue = {schema: 'vulpora.clarified-task-spec/v2'};
  for (const field of SPEC_FIELDS) specValue[field] = candidate[field];
  specValue.acceptance_criteria = acceptanceCriteria;
  specValue.clarity_projection_path = projection.path;
  specValue.clarity_projection_sha256 = projection.sha256;
  const spec = writeCanonicalValue(`${base}/clarified-spec.yaml`, specValue);

  process.stdout.write(`${JSON.stringify({
    outcome: 'pass',
    input_schema: candidate.schema,
    normalized_input_fields: normalizedInputFields,
    spec_id: candidate.spec_id,
    revision: 1,
    acceptance_criterion_ids: specValue.acceptance_criteria.map((criterion) => criterion.id),
    clarity_projection: projection,
    clarified_spec: spec,
  })}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error?.code || error?.message || 'SPEC_MATERIALIZATION_FAILED'}\n`);
    process.exit(1);
  }
}
