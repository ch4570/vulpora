#!/usr/bin/env node
'use strict';

// Choose which reviewer claims become reproduction tasks, by rule (design 3-(f)), and apply the per-change cap.
// R1 only lists tasks: nothing here runs a test or starts an application.
//
//   select-repro-tasks.js --ledger <ledger.json> [--max-tasks 3] [--time-limit-min 20] [--repetitions 50] [--threads 8]
//                         [--approved-criteria] [--requested <finding-id>]... [--out <tasks.json>]
//
// Triggers (any one is enough; a claim already `REPRODUCED` or `NOT_RUN` with an allowed reason is not re-queued):
//   inferred-high      a reviewer left an `inferred` HIGH or CRITICAL claim
//   risk-tier          the diff touches a risk category and a reviewer claims a defect in a concurrency-like cause
//   concurrency-medium a MEDIUM claim whose cause is concurrency-like ("check the intent")
//   minority-high-risk a single reporting lane in a risk tier
//   requested          a person asked for it
// Tasks past the cap are listed as NOT_RUN: budget-cap; they remain signals and are never dropped silently.

const fs = require('node:fs');
const {SEVERITY_RANK} = require('./lib');
const {groupFindings} = require('./evaluate-consensus-veto');

const CONCURRENCY_CAUSE = /race|lost-update|deadlock|transaction|lock|idempot|concurr|atomic|isolation/i;
const SCHEMA = 'vulpora.repro-tasks/v1';

function selectTasks(ledger, options) {
  const risk = ledger.changes ? ledger.changes.riskCategories : [];
  const laneById = new Map(ledger.lanes.map((lane) => [lane.id, lane]));
  const requested = new Set(options.requested);
  const candidates = [];
  for (const members of groupFindings(ledger.findings)) {
    if (members.some((finding) => finding.reproAttempt.status === 'REPRODUCED')) continue;
    const triggers = new Set();
    const concurrent = members.some((finding) => CONCURRENCY_CAUSE.test(finding.causeKey || ''));
    if (members.some((finding) => finding.confidence === 'inferred' && SEVERITY_RANK[finding.severity] >= SEVERITY_RANK.HIGH)) triggers.add('inferred-high');
    if (risk.length > 0 && concurrent) triggers.add('risk-tier');
    if (concurrent && members.some((finding) => finding.severity === 'MEDIUM')) triggers.add('concurrency-medium');
    if (risk.length > 0 && new Set(members.map((finding) => laneById.get(finding.lane).name)).size === 1) triggers.add('minority-high-risk');
    if (members.some((finding) => requested.has(finding.id))) triggers.add('requested');
    if (triggers.size === 0) continue;
    if (members.every((finding) => finding.reproAttempt.status === 'NOT_RUN')) continue;
    candidates.push({members, triggers: [...triggers].sort(), severity: members.reduce((top, finding) => Math.max(top, SEVERITY_RANK[finding.severity]), 0)});
  }
  // Highest severity first, then more triggers, then stable by first finding id, so the cap is deterministic.
  candidates.sort((a, b) => b.severity - a.severity || b.triggers.length - a.triggers.length || (a.members[0].id < b.members[0].id ? -1 : 1));
  const tasks = candidates.map((candidate, index) => ({
    taskId: `T${index + 1}`, findingIds: candidate.members.map((finding) => finding.id), path: candidate.members[0].location.path,
    causeKey: candidate.members[0].causeKey, triggers: candidate.triggers,
    roles: {breaker: true, specTester: options.approvedCriteria === true && risk.length > 0, refuter: true},
    limits: {timeLimitMin: options.timeLimitMin, repetitions: concurrentOnly(candidate) ? options.repetitions : 1, threads: concurrentOnly(candidate) ? options.threads : 1},
    status: index < options.maxTasks ? 'QUEUED' : 'NOT_RUN', ...(index < options.maxTasks ? {} : {reason: 'budget-cap'}),
  }));
  return {schema: SCHEMA, verdictImpact: 'none', revision: ledger.revision, riskCategories: risk, caps: {maxTasks: options.maxTasks}, tasks,
    note: 'Listing only. No test, build, or application is started by this script. A reproduction run needs the isolation record of the endpoint isolation gate; without it the run is not execution evidence.'};
}
const concurrentOnly = (candidate) => candidate.members.some((finding) => CONCURRENCY_CAUSE.test(finding.causeKey || ''));

function main(argv) {
  const options = {maxTasks: 3, timeLimitMin: 20, repetitions: 50, threads: 8, approvedCriteria: false, requested: []};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--approved-criteria') { options.approvedCriteria = true; continue; }
    const value = argv[++index];
    if (value === undefined) { process.stderr.write(`missing value for ${flag}\n`); return 64; }
    if (flag === '--ledger') options.ledger = value;
    else if (flag === '--out') options.out = value;
    else if (flag === '--requested') options.requested.push(value);
    else if (['--max-tasks', '--time-limit-min', '--repetitions', '--threads'].includes(flag) && /^[1-9]\d*$/.test(value)) {
      options[{'--max-tasks': 'maxTasks', '--time-limit-min': 'timeLimitMin', '--repetitions': 'repetitions', '--threads': 'threads'}[flag]] = Number(value);
    } else { process.stderr.write(`invalid argument: ${flag} ${value}\n`); return 64; }
  }
  if (!options.ledger) { process.stderr.write('usage: select-repro-tasks.js --ledger <ledger.json> [--max-tasks N] [--time-limit-min N] [--repetitions N] [--threads N] [--approved-criteria] [--requested <id>]... [--out <file>]\n'); return 64; }
  try {
    const ledger = JSON.parse(fs.readFileSync(options.ledger, 'utf8'));
    if (ledger.schema !== 'vulpora.review-ledger/v1') throw new Error('ledger schema must be vulpora.review-ledger/v1');
    const text = `${JSON.stringify(selectTasks(ledger, options), null, 2)}\n`;
    if (options.out) fs.writeFileSync(options.out, text); else process.stdout.write(text);
    return 0;
  } catch (error) { process.stderr.write(`${error.message}\n`); return 64; }
}

module.exports = {SCHEMA, selectTasks};

if (require.main === module) process.exit(main(process.argv.slice(2)));
