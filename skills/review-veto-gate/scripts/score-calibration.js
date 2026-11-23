#!/usr/bin/env node
'use strict';

// Score a calibration run of the review gate and write `calibration-status.json` (`vulpora.calibration-status/v1`).
// In R1 the status is recorded and shown; it does not change any review verdict.
//
//   score-calibration.js --run <calibration-run.json> --out <calibration-status.json>
//                        [--previous <calibration-status.json>] [--current-versions <versions.json>] [--now <iso>] [--human-confirmed-restore]
//
// Calibration run (`vulpora.calibration-run/v1`):
//   {runAt, versions: {...}, cases[]: {id, tier, kind: "seeded"|"control", candidate: bool, targetsSeeded?: bool, laneFound?: {<lane>: bool}},
//    operations?: {recentVetoes[]: {releasedAsFalsePositive: bool}}}
//   seeded  = a change with a planted defect; control = a same-size change with no defect.
//   candidate = the case met every consensus-veto condition. targetsSeeded = the candidate pointed at the planted defect.
//
// Per tier (thresholds are starting values to tune from measurement, design 3-(h) device 2):
//   unmeasured  fewer than 20 seeded or 40 control cases
//   expired     older than 90 days, or the versions differ from --current-versions
//   demoted     false veto rate > 5%, veto precision < 80%, miss rate > 70%, or operational release rate > 30% (needs 10+ operational vetoes)
//   valid       none of the above
// A demotion is automatic. A demoted tier is not restored by a good score alone: it needs --human-confirmed-restore.

const fs = require('node:fs');

const SCHEMA = 'vulpora.calibration-status/v1';
const MIN_SEEDED = 20;
const MIN_CONTROL = 40;
const THRESHOLDS = {falseVetoRate: 0.05, minPrecision: 0.8, maxMissRate: 0.7, maxReleaseRate: 0.3, expiryDays: 90, minOperationalVetoes: 10};

const ratio = (num, den) => (den === 0 ? null : num / den);

function commonMisses(cases) {
  const seeded = cases.filter((entry) => entry.kind === 'seeded' && entry.laneFound);
  const lanes = [...new Set(seeded.flatMap((entry) => Object.keys(entry.laneFound)))].sort();
  const pairs = [];
  for (let i = 0; i < lanes.length; i += 1) {
    for (let j = i + 1; j < lanes.length; j += 1) {
      const eitherMissed = seeded.filter((entry) => entry.laneFound[lanes[i]] === false || entry.laneFound[lanes[j]] === false).length;
      const bothMissed = seeded.filter((entry) => entry.laneFound[lanes[i]] === false && entry.laneFound[lanes[j]] === false).length;
      // Share of the cases where at least one missed in which both missed: high means they are not independent lanes.
      pairs.push({lanes: [lanes[i], lanes[j]], bothMissed, eitherMissed, commonMissShare: ratio(bothMissed, eitherMissed)});
    }
  }
  return pairs;
}

function scoreTier(tier, cases, run, options) {
  const seeded = cases.filter((entry) => entry.kind === 'seeded');
  const controls = cases.filter((entry) => entry.kind === 'control');
  const candidates = cases.filter((entry) => entry.candidate === true);
  const metrics = {
    seeded: seeded.length, controls: controls.length,
    falseVetoRate: ratio(controls.filter((entry) => entry.candidate === true).length, controls.length),
    vetoPrecision: ratio(candidates.filter((entry) => entry.kind === 'seeded' && entry.targetsSeeded === true).length, candidates.length),
    missRate: ratio(seeded.filter((entry) => entry.candidate !== true).length, seeded.length),
    commonMisses: commonMisses(cases),
  };
  const recent = ((run.operations && run.operations.recentVetoes) || []).slice(-20);
  metrics.operationalVetoes = recent.length;
  metrics.releaseRate = recent.length >= THRESHOLDS.minOperationalVetoes ? ratio(recent.filter((entry) => entry.releasedAsFalsePositive === true).length, recent.length) : null;
  const reasons = [];
  if (seeded.length < MIN_SEEDED) reasons.push(`unmeasured: ${seeded.length}/${MIN_SEEDED} seeded cases`);
  if (controls.length < MIN_CONTROL) reasons.push(`unmeasured: ${controls.length}/${MIN_CONTROL} control cases`);
  let state;
  if (reasons.length > 0) state = 'unmeasured';
  else {
    const demotions = [];
    if (metrics.falseVetoRate > THRESHOLDS.falseVetoRate) demotions.push(`false veto rate ${(metrics.falseVetoRate * 100).toFixed(1)}% > 5%`);
    if (candidates.length > 0 && metrics.vetoPrecision < THRESHOLDS.minPrecision) demotions.push(`veto precision ${(metrics.vetoPrecision * 100).toFixed(1)}% < 80%`);
    if (metrics.missRate > THRESHOLDS.maxMissRate) demotions.push(`miss rate ${(metrics.missRate * 100).toFixed(1)}% > 70%`);
    if (metrics.releaseRate !== null && metrics.releaseRate > THRESHOLDS.maxReleaseRate) demotions.push(`operational release rate ${(metrics.releaseRate * 100).toFixed(1)}% > 30%`);
    const ageDays = (options.now - Date.parse(run.runAt)) / 86400000;
    const versionsChanged = options.currentVersions && JSON.stringify(options.currentVersions) !== JSON.stringify(run.versions);
    if (demotions.length > 0) { state = 'demoted'; reasons.push(...demotions); }
    else if (Number.isNaN(ageDays) || ageDays > THRESHOLDS.expiryDays) { state = 'expired'; reasons.push(`older than ${THRESHOLDS.expiryDays} days`); }
    else if (versionsChanged) { state = 'expired'; reasons.push('model, prompt, lane, or skill versions differ from the calibrated ones'); }
    else state = 'valid';
  }
  const previous = options.previous && options.previous.tiers ? options.previous.tiers[tier] : null;
  if (state === 'valid' && previous && previous.state === 'demoted' && !options.humanConfirmedRestore) {
    state = 'demoted';
    reasons.push('previously demoted: restoring needs a person\'s confirmation (--human-confirmed-restore), not only a good score');
  }
  return {state, reasons, metrics, ...(previous && previous.state !== state ? {changedFrom: previous.state} : {})};
}

function scoreRun(run, options) {
  if (!run || run.schema !== 'vulpora.calibration-run/v1' || !Array.isArray(run.cases)) throw new Error('calibration run schema must be vulpora.calibration-run/v1 with a cases array');
  const tiers = {};
  for (const tier of [...new Set(run.cases.map((entry) => entry.tier))].sort()) {
    tiers[tier] = scoreTier(tier, run.cases.filter((entry) => entry.tier === tier), run, options);
  }
  return {schema: SCHEMA, scoredAt: new Date(options.now).toISOString(), runAt: run.runAt, versions: run.versions ?? null, thresholds: THRESHOLDS,
    appliesToVerdict: false, tiers};
}

function main(argv) {
  const options = {now: Date.now(), humanConfirmedRestore: false};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--human-confirmed-restore') { options.humanConfirmedRestore = true; continue; }
    const value = argv[++index];
    if (value === undefined) { process.stderr.write(`missing value for ${flag}\n`); return 64; }
    if (flag === '--run') options.run = value;
    else if (flag === '--out') options.out = value;
    else if (flag === '--previous') options.previousFile = value;
    else if (flag === '--current-versions') options.versionsFile = value;
    else if (flag === '--now' && !Number.isNaN(Date.parse(value))) options.now = Date.parse(value);
    else { process.stderr.write(`invalid argument: ${flag} ${value}\n`); return 64; }
  }
  if (!options.run || !options.out) { process.stderr.write('usage: score-calibration.js --run <calibration-run.json> --out <calibration-status.json> [--previous <file>] [--current-versions <file>] [--now <iso>] [--human-confirmed-restore]\n'); return 64; }
  try {
    const run = JSON.parse(fs.readFileSync(options.run, 'utf8'));
    options.previous = options.previousFile ? JSON.parse(fs.readFileSync(options.previousFile, 'utf8')) : null;
    options.currentVersions = options.versionsFile ? JSON.parse(fs.readFileSync(options.versionsFile, 'utf8')) : null;
    fs.writeFileSync(options.out, `${JSON.stringify(scoreRun(run, options), null, 2)}\n`);
    return 0;
  } catch (error) { process.stderr.write(`${error.message}\n`); return 64; }
}

module.exports = {SCHEMA, THRESHOLDS, MIN_SEEDED, MIN_CONTROL, scoreRun, commonMisses};

if (require.main === module) process.exit(main(process.argv.slice(2)));
