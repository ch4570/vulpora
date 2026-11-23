#!/usr/bin/env node
'use strict';

// Compute, for each defect the lanes reported, whether the consensus-veto conditions CV-1..CV-7 would hold, and
// bucket the result into the signal bundle a review report shows. R1 is observation only:
//   --mode shadow   JSON ledger entry ("what would have happened"); nothing is shown to the author.
//   --mode signal   the same plus a Markdown signal bundle for the end of the review report.
//   --mode veto     is refused (exit 64): it arrives with R2, behind a calibrated, human-confirmed switch.
// The exit code never depends on the review verdict, and the output says `verdictImpact: "none"`.
//
//   evaluate-consensus-veto.js --ledger <ledger.json> --mode shadow|signal [--calibration <calibration-status.json>]
//                              [--out <file>] [--markdown-out <file>]
//
// Agreement is not independent evidence. A candidate needs three distinct defect-judging lanes (same lane repeated is one),
// one of them a refuter that gave its basis and failed to refute, different evidence bundles, a named contract source,
// an honest reproduction record, a risky change of bounded size, and a valid calibration for that risk tier (CV-8 is this script).

const fs = require('node:fs');
const {SEVERITY_RANK, NOT_RUN_REASONS, CONTRACT_KINDS_ACCEPTED, COUNTED_KINDS, isObject} = require('./lib');

const SCHEMA = 'vulpora.consensus-signals/v1';
const MAX_PRODUCTION_LINES = 800;
const EXECUTABLE_CAUSE = /race|lost-update|deadlock|transaction|lock|idempot|concurr|atomic|isolation/i;

function groupFindings(findings) {
  const parent = findings.map((_, index) => index);
  const find = (index) => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; } return index; };
  findings.forEach((a, i) => findings.forEach((b, j) => {
    if (j <= i || !a.causeKey || a.causeKey !== b.causeKey || a.location.path !== b.location.path) return;
    const sameSymbol = a.location.symbol && a.location.symbol === b.location.symbol;
    const nearLine = a.location.line !== null && b.location.line !== null && Math.abs(a.location.line - b.location.line) <= 5;
    if (sameSymbol || nearLine) parent[find(j)] = find(i);
  }));
  const groups = new Map();
  findings.forEach((finding, index) => groups.set(find(index), [...(groups.get(find(index)) || []), finding]));
  return [...groups.values()];
}

function evaluate(ledger, calibration) {
  const laneById = new Map(ledger.lanes.map((lane) => [lane.id, lane]));
  const changes = ledger.changes;
  const categories = changes ? changes.riskCategories : [];
  const tiers = calibration && isObject(calibration.tiers) ? calibration.tiers : {};
  const notes = [];
  const sizeSignal = changes && changes.productionLines > MAX_PRODUCTION_LINES
    ? {code: 'SPLIT_OR_HUMAN_REVIEW', productionLines: changes.productionLines, limit: MAX_PRODUCTION_LINES} : null;
  if (!changes) notes.push('NO_DIFF: risk conditions could not be computed, so no consensus candidate is possible');

  const rows = groupFindings(ledger.findings).map((members, index) => {
    const id = `G${index + 1}`;
    const reporters = members.map((finding) => laneById.get(finding.lane));
    const refutations = ledger.refutations.filter((entry) => members.some((finding) => finding.id === entry.finding));
    const standing = refutations.filter((entry) => entry.outcome === 'NOT_REFUTED' && entry.basis.trim().length > 0);
    const refuted = refutations.filter((entry) => entry.outcome === 'REFUTED');
    // Distinct lane identity is the agent/skill name: a repeated run or a second persona of one lane is one vote.
    const counted = new Map();
    for (const lane of [...reporters, ...standing.map((entry) => laneById.get(entry.lane))]) {
      if (COUNTED_KINDS.has(lane.kind) && lane.status === 'COMPLETED' && !counted.has(lane.name)) counted.set(lane.name, lane);
    }
    const countedLanes = [...counted.values()];
    const repro = members.map((finding) => finding.reproAttempt);
    const reproduced = repro.some((entry) => entry.status === 'REPRODUCED');
    const notReproduced = repro.some((entry) => entry.status === 'NOT_REPRODUCED');
    const executable = members.some((finding) => EXECUTABLE_CAUSE.test(finding.causeKey || '')) || categories.includes('concurrency');
    const cv = {};
    const set = (key, met, detail) => { cv[key] = {met, detail}; };
    set('CV-1', categories.length > 0 && changes.productionLines > 0 && changes.productionLines <= MAX_PRODUCTION_LINES,
      !changes ? 'no diff' : categories.length === 0 ? 'no risk category in the diff' : changes.productionLines === 0 ? 'no production change'
        : changes.productionLines > MAX_PRODUCTION_LINES ? `production change of ${changes.productionLines} lines exceeds ${MAX_PRODUCTION_LINES}` : `risk: ${categories.join(', ')}`);
    set('CV-2', countedLanes.length >= 3, `${countedLanes.length} distinct counted lane(s): ${countedLanes.map((lane) => lane.name).join(', ') || 'none'}`);
    set('CV-3', standing.length > 0, standing.length > 0 ? 'a refuter gave its basis and did not refute' : refuted.length > 0 ? 'a refuter refuted the claim' : 'no refuter result');
    const hashes = countedLanes.map((lane) => lane.evidenceBundleSha256);
    set('CV-4', countedLanes.length > 0 && hashes.every(Boolean) && new Set(hashes).size === hashes.length && countedLanes.every((lane) => lane.forkTurns === 'none'),
      'every counted lane needs its own evidence bundle hash and fork_turns: none');
    set('CV-5', members.every((finding) => finding.location.line !== null && finding.claim.trim() && finding.contractSource
      && CONTRACT_KINDS_ACCEPTED.has(finding.contractSource.kind) && SEVERITY_RANK[finding.severity] >= SEVERITY_RANK.HIGH),
    'each finding needs path:line, a cause sentence, severity HIGH or above, and a contract source (spec, acceptance, public-contract, security-rule), not "best practice"');
    const reproOk = !reproduced && repro.every((entry) => (entry.status === 'NOT_RUN' && NOT_RUN_REASONS.has(entry.reason))
      || (entry.status === 'NOT_REPRODUCED' && !executable));
    set('CV-6', reproOk, reproduced ? 'reproduced: belongs to the reproduction veto path (R3), not consensus'
      : repro.some((entry) => entry.status === 'NOT_ATTEMPTED') ? 'no reproduction attempt recorded'
        : notReproduced && executable ? 'an executable kind of defect was run and not reproduced' : repro.some((entry) => entry.status === 'NOT_RUN' && !NOT_RUN_REASONS.has(entry.reason)) ? 'NOT_RUN without an allowed reason' : 'attempt recorded');
    const tierStates = categories.map((category) => ({category, state: tiers[category] ? tiers[category].state : 'unmeasured'}));
    set('CV-7', categories.length > 0 && tierStates.every((tier) => tier.state === 'valid'), tierStates.map((tier) => `${tier.category}=${tier.state}`).join(', ') || 'no risk tier');
    const failed = Object.entries(cv).filter(([, value]) => !value.met).map(([key]) => key);
    const severity = members.reduce((top, finding) => (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[top] ? finding.severity : top), 'LOW');
    let bucket;
    if (reproduced) bucket = 'reproduced';
    else if (refuted.length > 0 && standing.length === 0) bucket = 'refuted';
    else if (failed.length === 0) bucket = 'consensusCandidates';
    else if (notReproduced) bucket = 'notReproduced';
    else bucket = 'signals';
    return {id, path: members[0].location.path, line: Math.min(...members.map((finding) => finding.location.line ?? Infinity)) === Infinity ? null : Math.min(...members.map((finding) => finding.location.line ?? Infinity)),
      causeKey: members[0].causeKey, severity, findingIds: members.map((finding) => finding.id), countedLanes: countedLanes.map((lane) => lane.name),
      reporterCount: new Set(reporters.map((lane) => lane.name)).size, bucket, conditions: cv, failedConditions: failed,
      ...(bucket === 'consensusCandidates' ? {wouldBeVerdictFloor: 'CHANGES_REQUIRED'} : {}),
      ...(reporters.length === 1 && categories.length > 0 ? {minority: true, reproTaskCandidate: true} : {})};
  });
  // A finding with no cause key cannot be grouped, so it is never a consensus input; keep it visible.
  const ungrouped = ledger.findings.filter((finding) => !finding.causeKey).map((finding) => finding.id);
  if (ungrouped.length > 0) notes.push(`NO_CAUSE_KEY: ${ungrouped.join(', ')} cannot join a consensus group`);
  const frontier = ledger.lanes.filter((lane) => lane.kind === 'frontier-unavailable').map((lane) => lane.name);
  if (frontier.length > 0) notes.push(`ROUTE_UNAVAILABLE: ${frontier.join(', ')} did not run; a person reviews that area and it adds no lane to any count`);
  const buckets = {reproduced: [], consensusCandidates: [], refuted: [], notReproduced: [], signals: []};
  for (const row of rows) buckets[row.bucket].push(row.id);
  return {
    schema: SCHEMA, mode: null, verdictImpact: 'none', reviewVerdictUnchanged: ledger.reviewVerdict,
    workflow: ledger.workflow, revision: ledger.revision, riskCategories: categories, productionLines: changes ? changes.productionLines : null,
    sizeSignal, calibration: {supplied: Boolean(calibration), tiers: categories.map((category) => ({category, state: tiers[category] ? tiers[category].state : 'unmeasured'}))},
    groups: rows, buckets, notes,
  };
}

function markdown(result) {
  const list = (ids, empty = 'none') => (ids.length === 0 ? `- ${empty}` : ids.map((id) => {
    const row = result.groups.find((group) => group.id === id);
    const why = row.bucket === 'consensusCandidates' ? `would be CHANGES_REQUIRED if the veto were on (lanes: ${row.countedLanes.join(', ')})`
      : row.failedConditions.length > 0 ? `not a veto: ${row.failedConditions.map((key) => `${key} (${row.conditions[key].detail})`).join('; ')}` : '';
    return `- ${row.id} [${row.severity}] ${row.path}${row.line ? `:${row.line}` : ''} (${row.causeKey || 'no cause key'}): ${why}${row.minority ? ' [single reporter in a risk tier: reproduction task candidate]' : ''}`;
  }).join('\n'));
  return [
    '## Review gate signals (observation only; the verdict above is unchanged)', '',
    `Risk tiers touched: ${result.riskCategories.join(', ') || 'none'}. Calibration: ${result.calibration.tiers.map((tier) => `${tier.category}=${tier.state}`).join(', ') || 'n/a'}.`,
    ...(result.sizeSignal ? ['', `Size: ${result.sizeSignal.productionLines} production lines exceed ${result.sizeSignal.limit}; split the change or send it to a person.`] : []), '',
    '### Reproduced defects', list(result.buckets.reproduced), '',
    '### Consensus-veto candidates (shadow)', list(result.buckets.consensusCandidates), '',
    '### Refuted', list(result.buckets.refuted), '',
    '### Not reproduced', list(result.buckets.notReproduced), '',
    '### Signals', list(result.buckets.signals),
    ...(result.notes.length > 0 ? ['', '### Notes', ...result.notes.map((note) => `- ${note}`)] : []),
    '', 'Agreement among reviewers is not independent evidence, and "no finding" is not approval.', ''].join('\n');
}

function main(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (value === undefined) { process.stderr.write(`missing value for ${flag}\n`); return 64; }
    if (flag === '--ledger') options.ledger = value;
    else if (flag === '--mode') options.mode = value;
    else if (flag === '--calibration') options.calibration = value;
    else if (flag === '--out') options.out = value;
    else if (flag === '--markdown-out') options.markdownOut = value;
    else { process.stderr.write(`invalid argument: ${flag}\n`); return 64; }
  }
  if (options.mode === 'veto') { process.stderr.write('--mode veto is not available in this version: it arrives with the consensus-veto stage and its calibration gate\n'); return 64; }
  if (!options.ledger || !['shadow', 'signal'].includes(options.mode)) { process.stderr.write('usage: evaluate-consensus-veto.js --ledger <ledger.json> --mode shadow|signal [--calibration <file>] [--out <file>] [--markdown-out <file>]\n'); return 64; }
  try {
    const ledger = JSON.parse(fs.readFileSync(options.ledger, 'utf8'));
    if (ledger.schema !== 'vulpora.review-ledger/v1') throw new Error('ledger schema must be vulpora.review-ledger/v1');
    const calibration = options.calibration ? JSON.parse(fs.readFileSync(options.calibration, 'utf8')) : null;
    const result = evaluate(ledger, calibration);
    result.mode = options.mode;
    if (options.mode === 'signal') result.markdown = markdown(result);
    const text = `${JSON.stringify(result, null, 2)}\n`;
    if (options.out) fs.writeFileSync(options.out, text); else process.stdout.write(text);
    if (options.markdownOut && result.markdown) fs.writeFileSync(options.markdownOut, result.markdown);
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 64;
  }
}

module.exports = {SCHEMA, MAX_PRODUCTION_LINES, groupFindings, evaluate, markdown};

if (require.main === module) process.exit(main(process.argv.slice(2)));
