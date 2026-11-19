#!/usr/bin/env node
'use strict';

// Refuse a report/output root that overlaps repository-tracked files. A root such as
// `test-report/e2e` inside a Gradle module named `test-report` would put generated
// evidence (and any later cleanup) next to tracked build files.
//
// usage: check-output-root.js <repository-root> <output-root>
// Exit 0 = safe, 1 = overlap (listed), 64 = usage.

const path = require('node:path');
const {spawnSync} = require('node:child_process');

const [repoArg, outArg] = process.argv.slice(2);
if (!repoArg || !outArg || process.argv.length !== 4) {
  process.stderr.write('usage: check-output-root.js <repository-root> <output-root>\n');
  process.exit(64);
}
const repo = path.resolve(repoArg);
const out = path.resolve(repo, outArg);
const relative = path.relative(repo, out);
if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
  process.stdout.write(`${JSON.stringify({safe: false, reason: 'output root must be a subdirectory of the repository'})}\n`);
  process.exit(1);
}
const listed = spawnSync('git', ['-C', repo, 'ls-files', '-z'], {encoding: 'utf8'});
if (listed.status !== 0) {
  process.stderr.write(`git ls-files failed: ${listed.stderr.trim()}\n`);
  process.exit(64);
}
const tracked = listed.stdout.split('\0').filter(Boolean);
// The root itself and every ancestor directory below the repository root must hold no tracked file.
const segments = relative.split(path.sep);
const scopes = segments.map((_, index) => segments.slice(0, index + 1).join('/'));
const overlaps = tracked.filter((file) => scopes.some((scope, index) => (index === scopes.length - 1
  ? file.startsWith(`${scope}/`) : path.posix.dirname(file) === scope)));
process.stdout.write(`${JSON.stringify({safe: overlaps.length === 0, outputRoot: relative.split(path.sep).join('/'), overlaps: overlaps.slice(0, 20)}, null, 2)}\n`);
process.exit(overlaps.length === 0 ? 0 : 1);
