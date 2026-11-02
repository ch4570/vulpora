#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const xmlPath = process.argv[2];
const expectedClass = process.argv[3];
const startedAfter = Number(process.argv[4] || 0);
if (!xmlPath || !expectedClass) {
  console.error('usage: validate-container-test-result.js <xml-path> <expected-class> [started-after-epoch-ms]');
  process.exit(64);
}

function finish(verdict, reasons, summary = {}) {
  process.stdout.write(`${JSON.stringify({ verdict, reasons, summary, xmlPath }, null, 2)}\n`);
  process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2);
}

if (!fs.existsSync(xmlPath)) finish('BLOCKED_FALSE_GREEN', ['result-xml-missing']);
const stat = fs.statSync(xmlPath);
if (startedAfter && stat.mtimeMs < startedAfter) finish('BLOCKED_FALSE_GREEN', ['stale-result-xml']);
const xml = fs.readFileSync(xmlPath, 'utf8');
const suite = xml.match(/<testsuite\b([^>]*)>/);
if (!suite) finish('BLOCKED_FALSE_GREEN', ['testsuite-summary-missing']);
const attribute = (name) => Number((suite[1].match(new RegExp(`\\b${name}="(\\d+)"`)) || [])[1]);
const summary = { tests: attribute('tests'), skipped: attribute('skipped'), failures: attribute('failures'), errors: attribute('errors') };
if (Object.values(summary).some(Number.isNaN)) finish('BLOCKED_FALSE_GREEN', ['testsuite-summary-missing']);
if (!xml.includes(`classname="${expectedClass}"`)) finish('BLOCKED_FALSE_GREEN', ['requested-class-not-executed'], summary);
if (summary.tests === 0) finish('BLOCKED_FALSE_GREEN', ['zero-tests'], summary);
if (summary.failures > 0 || summary.errors > 0) finish('FAIL', ['test-failure'], summary);
if (summary.skipped > 0) finish('BLOCKED_FALSE_GREEN', ['skipped-tests'], summary);

const runtimeErrors = [
  /Could not find a valid Docker environment/i,
  /Docker is not available[^\n]*skipping test/i,
  /NoSuchFileException \([^\n]*docker\.sock\)/i,
  /Testcontainers[^\n]*(?:disabled|unavailable)/i,
  /Could not start container/i,
  /ContainerLaunchException/i,
  /error while creating mount source path/i,
];
if (runtimeErrors.some((pattern) => pattern.test(xml))) {
  finish('BLOCKED_FALSE_GREEN', ['testcontainers-runtime-unavailable'], summary);
}

const startedApplicationContainer = xml.split(/\r?\n/).some((line) =>
  /Container[^\n]* started in /i.test(line) && !/testcontainers\/ryuk/i.test(line));
if (!startedApplicationContainer) {
  finish('BLOCKED_FALSE_GREEN', ['container-start-proof-missing'], summary);
}

finish('PASS', [], summary);
