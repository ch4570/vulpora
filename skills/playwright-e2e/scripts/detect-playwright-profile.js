#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const rootArgument = process.argv[2];
if (!rootArgument) {
  console.error('usage: detect-playwright-profile.js <repository-root>');
  process.exit(64);
}

const root = path.resolve(rootArgument);
const ignored = new Set(['.git', '.next', '.nuxt', 'build', 'coverage', 'dist', 'node_modules', 'test-results']);
const inspectedFiles = [];
const testFiles = [];
const configFiles = [];
const helperCandidates = [];

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function read(file) {
  inspectedFiles.push(relative(file));
  return fs.readFileSync(file, 'utf8');
}

function walk(directory, depth) {
  if (depth < 0) return;
  let entries = [];
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, depth - 1);
    else if (!entry.isFile()) continue;
    else if (/^playwright\.config\.(?:[cm]?[jt]s|json)$/.test(entry.name)) configFiles.push(file);
    else if (entry.name === 'package.json' || /(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(entry.name)) configFiles.push(file);
    else if (/(?:^|\/)(?:tests|e2e|playwright)\/.+\.(?:spec|test)\.(?:[cm]?[jt]s)$/.test(relative(file))) testFiles.push(file);
  }
}

walk(root, 4);
const packageFile = configFiles.find((file) => path.basename(file) === 'package.json');
const packageJson = packageFile ? JSON.parse(read(packageFile)) : {};
const scripts = packageJson.scripts || {};
const playwrightDependency = ['dependencies', 'devDependencies', 'peerDependencies'].some((field) =>
  Boolean(packageJson[field] && packageJson[field]['@playwright/test']));
const testCommand = Object.entries(scripts).find(([, command]) => /(?:^|\s)(?:npx\s+)?playwright\s+test\b/.test(command)) || null;

const projectEvidence = [];
const configSignals = {
  baseURL: null,
  webServer: false,
  reuseExistingServer: null,
  storageState: null,
  retries: null,
  workers: null,
  globalSetup: false,
};
for (const file of configFiles.filter((candidate) => /^playwright\.config\./.test(path.basename(candidate))).sort()) {
  const content = read(file);
  projectEvidence.push(relative(file));
  if (/projects\s*:/.test(content)) projectEvidence.push(`${relative(file)}#projects`);
  configSignals.baseURL = (content.match(/baseURL\s*:\s*["'`]([^"'`]+)["'`]/) || [])[1] || configSignals.baseURL;
  configSignals.webServer ||= /webServer\s*:/.test(content);
  if (/reuseExistingServer\s*:/.test(content)) configSignals.reuseExistingServer = !/reuseExistingServer\s*:\s*false/.test(content);
  configSignals.storageState = (content.match(/storageState\s*:\s*["'`]([^"'`]+)["'`]/) || [])[1] || configSignals.storageState;
  const retries = content.match(/retries\s*:\s*(\d+)/);
  if (retries) configSignals.retries = Number(retries[1]);
  const workers = content.match(/workers\s*:\s*(\d+)/);
  if (workers) configSignals.workers = Number(workers[1]);
  configSignals.globalSetup ||= /globalSetup\s*:/.test(content);
}

const dataFixtureEvidence = [];
const selectorEvidence = [];
for (const file of testFiles.sort().slice(0, 12)) {
  const content = read(file);
  const source = relative(file);
  if (/\b(?:seed\w*|fixture\w*|cleanup\w*|teardown\w*|delete[A-Z]\w*|reset[A-Z]\w*)/i.test(content)) dataFixtureEvidence.push(source);
  if (/\bgetBy(?:Role|Label|TestId)\b/.test(content)) selectorEvidence.push(source);
  for (const match of content.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const base = path.resolve(path.dirname(file), match[1]);
    for (const candidate of [base, `${base}.ts`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.js')]) {
      if (candidate.startsWith(root + path.sep) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        helperCandidates.push(candidate);
        break;
      }
    }
  }
}

const fixtureDefinitions = [];
for (const file of [...new Set(helperCandidates)].sort().slice(0, 6)) {
  const content = read(file);
  const hasSeed = /(?:function|const)\s+\w*(?:seed|create)\w*/i.test(content);
  const hasCleanup = /(?:function|const)\s+\w*(?:cleanup|delete|remove|reset)\w*/i.test(content);
  const hasAbsenceProbe = /(?:function|const)\s+\w*(?:exists|find|count|absent|verify)\w*/i.test(content);
  fixtureDefinitions.push({ path: relative(file), hasSeed, hasCleanup, hasAbsenceProbe, lifecycleSymbolsProven: hasSeed && hasCleanup && hasAbsenceProbe });
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  repositoryRoot: root,
  playwright: {
    dependencyDeclared: playwrightDependency,
    configFiles: projectEvidence,
    testCommand: testCommand ? { name: testCommand[0], command: testCommand[1] } : null,
    config: configSignals,
  },
  conventions: {
    dataFixtureEvidence: [...new Set(dataFixtureEvidence)],
    fixtureDefinitions,
    lifecycleSymbolsProven: fixtureDefinitions.some((fixture) => fixture.lifecycleSymbolsProven),
    semanticSelectorEvidence: [...new Set(selectorEvidence)],
  },
  inspectedFiles,
  readBudget: {
    configFilesRead: configFiles.length,
    testFilesRead: Math.min(testFiles.length, 12),
    testFileLimit: 12,
    helperFilesRead: fixtureDefinitions.length,
    helperFileLimit: 6,
  },
}, null, 2)}\n`);
