#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const rootArg = process.argv[2];
if (!rootArg) {
  console.error('usage: summarize-test-results.js <repository-root>');
  process.exit(64);
}

const root = fs.realpathSync(path.resolve(rootArg));
const ignored = new Set(['.git', '.gradle', '.idea', 'node_modules', 'out']);
const projectMarkers = ['.git', 'settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts', 'pom.xml', 'package.json'];
if (root === path.parse(root).root || !projectMarkers.some((marker) => fs.existsSync(path.join(root, marker)))) {
  throw new Error('repository-root is too broad or has no recognized project marker');
}
const xmlFiles = [];
const fatalPatterns = [
  'Could not find a valid Docker environment',
  'Could not start container',
  'ContainerLaunchException',
  'Docker is not available',
  'error while creating mount source',
];

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      if (['build', 'target', 'playwright-report', 'test-results'].includes(entry.name)) {
        throw new Error(`unsafe symlink at result boundary: ${relative(absolute)}`);
      }
      continue;
    }
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile() && /^TEST-.+\.xml$/.test(entry.name)
      && /\/(?:build\/test-results|target\/(?:surefire|failsafe)-reports)\//.test(absolute.split(path.sep).join('/'))) {
      xmlFiles.push(absolute);
    }
  }
}

function attribute(tag, name) {
  return Number((tag.match(new RegExp(`\\b${name}="(\\d+)"`)) || [])[1] || 0);
}

function decode(value) {
  return String(value || '')
    .replace(/&#10;/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

walk(root);
xmlFiles.sort();
const totals = { tests: 0, skipped: 0, failures: 0, errors: 0 };
const failedTests = [];
const infrastructureErrors = [];
const startedImages = new Set();

for (const file of xmlFiles) {
  const xml = fs.readFileSync(file, 'utf8');
  const suiteTag = xml.match(/<testsuite\b[^>]*>/)?.[0] || '';
  for (const key of Object.keys(totals)) totals[key] += attribute(suiteTag, key);
  for (const pattern of fatalPatterns) {
    if (xml.includes(pattern)) infrastructureErrors.push({ file: relative(file), pattern });
  }
  for (const match of xml.matchAll(/Container\s+([^\s]+)\s+started in\s+/g)) {
    if (!match[1].includes('ryuk')) startedImages.add(match[1]);
  }
  for (const match of xml.matchAll(/<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g)) {
    const body = match[2];
    const failure = body.match(/<(failure|error)\b([^>]*)>([\s\S]*?)<\/\1>/);
    if (!failure) continue;
    const attrs = match[1];
    const failureAttrs = failure[2];
    const stack = decode(failure[3]).replace(/<[^>]+>/g, '');
    failedTests.push({
      file: relative(file),
      className: decode((attrs.match(/\bclassname="([^"]*)"/) || [])[1]),
      testName: decode((attrs.match(/\bname="([^"]*)"/) || [])[1]),
      type: failure[1],
      message: decode((failureAttrs.match(/\bmessage="([^"]*)"/) || [])[1]).trim().slice(0, 500),
      location: (stack.match(/\(([^()]+\.(?:kt|java):\d+)\)/) || [])[1] || null,
    });
  }
}

const summary = {
  status: xmlFiles.length ? 'summarized' : 'no-results',
  xmlFiles: xmlFiles.length,
  totals,
  passed: totals.tests - totals.skipped - totals.failures - totals.errors,
  failedTests,
  infrastructureErrors,
  runtimeProof: { startedImages: [...startedImages].sort() },
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.exit(xmlFiles.length ? 0 : 2);
