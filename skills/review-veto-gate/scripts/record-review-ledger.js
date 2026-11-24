#!/usr/bin/env node
'use strict';

// Normalize a review workflow's result into the `vulpora.review-ledger/v1` run ledger that the other
// scripts read. Observation only: it never changes, re-grades, or drops a finding, and the ledger carries
// `verdictImpact: "none"`.
//
//   record-review-ledger.js --workflow-result <result.json> --out <ledger.json> [--diff <unified.patch>]
//
// Workflow result (`vulpora.review-workflow-result/v1`), written by the workflow owner from child outputs:
//   {schema, workflow, revision, baseline, verdict,
//    lanes[]:       {id, name, kind?, status, requestedModel, observedModel, evidenceBundleSha256, forkTurns, tokens?}
//    findings[]:    {id, lane, location:{path, line?, symbol?}, cause_key, severity, confidence, claim,
//                    contract_source:{kind, ref}|null, repro_attempt}
//    refutations[]: {lane, finding, outcome: "NOT_REFUTED"|"REFUTED", basis}}
// `repro_attempt` is one of NOT_ATTEMPTED, NOT_RUN: <reason>, NOT_REPRODUCED, REPRODUCED.
// `--diff` supplies the changed files; changed-line counts and risk categories come from it by rule, not from a reviewer.
//
// Exit 0 written, 64 unusable input.

const fs = require('node:fs');
const {SEVERITIES, CONFIDENCE, REPRO_STATUSES, laneKind, parseDiff, riskCategories, parseRepro, isObject, InputError, fail} = require('./lib');

const SCHEMA = 'vulpora.review-ledger/v1';
const INPUT_SCHEMA = 'vulpora.review-workflow-result/v1';

function buildLedger(input, diffText) {
  if (!isObject(input) || input.schema !== INPUT_SCHEMA) fail(`workflow result schema must be ${INPUT_SCHEMA}`);
  for (const key of ['workflow', 'revision']) if (typeof input[key] !== 'string' || input[key].length === 0) fail(`${key} must be a non-empty string`);
  if (!Array.isArray(input.lanes) || !Array.isArray(input.findings)) fail('lanes and findings must be arrays');
  const laneIds = new Set();
  const lanes = input.lanes.map((lane) => {
    if (!isObject(lane) || typeof lane.id !== 'string' || typeof lane.name !== 'string') fail('each lane needs string id and name');
    if (laneIds.has(lane.id)) fail(`duplicate lane id: ${lane.id}`);
    laneIds.add(lane.id);
    return {
      id: lane.id, name: lane.name, kind: laneKind(lane), status: lane.status || 'COMPLETED',
      requestedModel: lane.requestedModel ?? null, observedModel: lane.observedModel ?? null,
      evidenceBundleSha256: typeof lane.evidenceBundleSha256 === 'string' && lane.evidenceBundleSha256 ? lane.evidenceBundleSha256 : null,
      forkTurns: lane.forkTurns ?? null, ...(lane.tokens !== undefined ? {tokens: lane.tokens} : {}),
    };
  });
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  const findingIds = new Set();
  const findings = input.findings.map((finding) => {
    if (!isObject(finding) || typeof finding.id !== 'string') fail('each finding needs a string id');
    if (findingIds.has(finding.id)) fail(`duplicate finding id: ${finding.id}`);
    findingIds.add(finding.id);
    if (!laneById.has(finding.lane)) fail(`finding ${finding.id} names an unknown lane`);
    if (!SEVERITIES.includes(finding.severity)) fail(`finding ${finding.id} severity must be one of ${SEVERITIES.join(', ')}`);
    if (!CONFIDENCE.has(finding.confidence)) fail(`finding ${finding.id} confidence must be confirmed or inferred`);
    if (!isObject(finding.location) || typeof finding.location.path !== 'string') fail(`finding ${finding.id} needs location.path`);
    const repro = parseRepro(finding.repro_attempt);
    if (!repro || !REPRO_STATUSES.has(repro.status)) fail(`finding ${finding.id} has an unreadable repro_attempt`);
    const contract = finding.contract_source === undefined || finding.contract_source === null ? null
      : isObject(finding.contract_source) && typeof finding.contract_source.kind === 'string' ? {kind: finding.contract_source.kind, ref: finding.contract_source.ref ?? null} : fail(`finding ${finding.id} contract_source must be {kind, ref} or null`);
    return {
      id: finding.id, lane: finding.lane,
      location: {path: finding.location.path, line: Number.isInteger(finding.location.line) ? finding.location.line : null, symbol: finding.location.symbol ?? null},
      causeKey: typeof finding.cause_key === 'string' && finding.cause_key ? finding.cause_key : null,
      severity: finding.severity, confidence: finding.confidence, claim: typeof finding.claim === 'string' ? finding.claim : '',
      contractSource: contract, reproAttempt: repro,
    };
  });
  const refutations = (input.refutations || []).map((entry) => {
    if (!isObject(entry) || !laneById.has(entry.lane) || !findingIds.has(entry.finding)) fail('each refutation needs a known lane and finding');
    if (laneById.get(entry.lane).kind !== 'refuter') fail(`refutation lane ${entry.lane} is not a refuter lane`);
    if (!['NOT_REFUTED', 'REFUTED'].includes(entry.outcome)) fail('refutation outcome must be NOT_REFUTED or REFUTED');
    return {lane: entry.lane, finding: entry.finding, outcome: entry.outcome, basis: typeof entry.basis === 'string' ? entry.basis : ''};
  });
  let changes = null;
  if (diffText !== null) {
    const files = parseDiff(diffText);
    changes = {
      files: files.map(({path, kind, added, removed}) => ({path, kind, added, removed})),
      productionLines: files.filter((file) => file.kind === 'production').reduce((total, file) => total + file.added + file.removed, 0),
      riskCategories: riskCategories(files),
    };
  }
  return {
    schema: SCHEMA, workflow: input.workflow, revision: input.revision, baseline: input.baseline ?? null,
    reviewVerdict: input.verdict ?? null, verdictImpact: 'none', lanes, findings, refutations, changes,
  };
}

function main(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (value === undefined) { process.stderr.write(`missing value for ${flag}\n`); return 64; }
    if (flag === '--workflow-result') options.input = value;
    else if (flag === '--out') options.out = value;
    else if (flag === '--diff') options.diff = value;
    else { process.stderr.write(`invalid argument: ${flag}\n`); return 64; }
  }
  if (!options.input || !options.out) { process.stderr.write('usage: record-review-ledger.js --workflow-result <result.json> --out <ledger.json> [--diff <unified.patch>]\n'); return 64; }
  try {
    const ledger = buildLedger(JSON.parse(fs.readFileSync(options.input, 'utf8')), options.diff ? fs.readFileSync(options.diff, 'utf8') : null);
    fs.writeFileSync(options.out, `${JSON.stringify(ledger, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof InputError ? 'invalid workflow result: ' : ''}${error.message}\n`);
    return 64;
  }
}

module.exports = {SCHEMA, INPUT_SCHEMA, buildLedger};

if (require.main === module) process.exit(main(process.argv.slice(2)));
