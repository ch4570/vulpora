#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const [mode, repositoryArg, snapshotArg] = process.argv.slice(2);
if (!['snapshot', 'restore', 'audit'].includes(mode) || !repositoryArg || (mode !== 'audit' && !snapshotArg)) {
  console.error('usage: manage-test-artifacts.js <snapshot|restore|audit> <repository-root> [snapshot-dir]');
  process.exit(64);
}

const repositoryRoot = fs.realpathSync(path.resolve(repositoryArg));
const snapshotRoot = snapshotArg ? path.resolve(snapshotArg) : null;
const ignored = new Set(['.git', '.gradle', '.idea', 'node_modules', 'out']);
const artifactSuffixes = [
  'build/test-results',
  'build/reports/tests',
  'build/reports/problems',
  'target/surefire-reports',
  'target/failsafe-reports',
  'playwright-report',
  'test-results',
];
const projectMarkers = ['.git', 'settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts', 'pom.xml', 'package.json'];

if (repositoryRoot === path.parse(repositoryRoot).root || !projectMarkers.some((marker) => fs.existsSync(path.join(repositoryRoot, marker)))) {
  throw new Error('repository-root is too broad or has no recognized project marker');
}

function normalize(file) {
  return path.relative(repositoryRoot, file).split(path.sep).join('/');
}

function isArtifactRoot(relativePath) {
  return artifactSuffixes.some((suffix) => relativePath === suffix || relativePath.endsWith(`/${suffix}`));
}

function discover(directory = repositoryRoot, found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const relative = normalize(absolute);
    if (entry.isSymbolicLink()) {
      if (isArtifactRoot(relative) || ['build', 'target', 'playwright-report', 'test-results'].includes(entry.name)) {
        throw new Error(`unsafe symlink at artifact boundary: ${relative}`);
      }
      continue;
    }
    if (!entry.isDirectory()) continue;
    if (isArtifactRoot(relative)) {
      found.push({ absolute, relative });
      continue;
    }
    discover(absolute, found);
  }
  return found.sort((a, b) => a.relative.localeCompare(b.relative));
}

function assertExternalSnapshot() {
  if (fs.existsSync(snapshotRoot) && fs.lstatSync(snapshotRoot).isSymbolicLink()) {
    throw new Error('snapshot-dir must not be a symlink');
  }
  const physicalSnapshot = fs.existsSync(snapshotRoot)
    ? fs.realpathSync(snapshotRoot)
    : path.join(fs.realpathSync(path.dirname(snapshotRoot)), path.basename(snapshotRoot));
  const relative = path.relative(repositoryRoot, physicalSnapshot);
  if (!relative.startsWith(`..${path.sep}`) && relative !== '..') {
    throw new Error('snapshot-dir must be outside repository-root');
  }
}

function treeDigest(directory) {
  const hash = crypto.createHash('sha256');
  function visit(current, prefix = '') {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`symlink inside artifact tree: ${relative}`);
      hash.update(`${entry.isDirectory() ? 'd' : 'f'}:${relative}\0`);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) hash.update(fs.readFileSync(absolute));
      else throw new Error(`unsupported artifact entry: ${relative}`);
    }
  }
  visit(directory);
  return hash.digest('hex');
}

function writeJsonAtomic(file, value) {
  const pending = `${file}.pending`;
  const descriptor = fs.openSync(pending, 'w', 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(pending, file);
}

function assertNoSymlinkAncestors(destination) {
  const relative = path.relative(repositoryRoot, destination);
  let current = repositoryRoot;
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`symlink ancestor in restore path: ${normalize(current)}`);
    }
  }
}

function assertNoSymlinkPath(base, destination) {
  const relative = path.relative(base, destination);
  let current = base;
  if (fs.lstatSync(base).isSymbolicLink()) throw new Error(`symlink root: ${base}`);
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`symlink in snapshot path: ${current}`);
    }
  }
}

function removeCurrent() {
  const current = discover();
  for (const item of current) fs.rmSync(item.absolute, { recursive: true, force: true });
  return current.map((item) => item.relative);
}

if (mode === 'audit') {
  const artifacts = discover().map((item) => item.relative);
  process.stdout.write(`${JSON.stringify({ artifactCount: artifacts.length, artifacts }, null, 2)}\n`);
  process.exit(artifacts.length === 0 ? 0 : 1);
}

assertExternalSnapshot();

if (mode === 'snapshot') {
  if (fs.existsSync(snapshotRoot)) throw new Error(`snapshot-dir already exists: ${snapshotRoot}`);
  fs.mkdirSync(path.join(snapshotRoot, 'items'), { recursive: true, mode: 0o700 });
  const artifacts = discover();
  const manifest = {
    schemaVersion: 1,
    repositoryRoot,
    transactionId: crypto.randomUUID(),
    state: 'copying',
    artifacts: artifacts.map((item, index) => ({ relative: item.relative, backup: `items/${index}`, digest: null })),
  };
  artifacts.forEach((item, index) => {
    const backup = path.join(snapshotRoot, 'items', String(index));
    fs.cpSync(item.absolute, backup, { recursive: true, preserveTimestamps: true });
    const sourceDigest = treeDigest(item.absolute);
    const backupDigest = treeDigest(backup);
    if (sourceDigest !== backupDigest) throw new Error(`artifact snapshot verification failed: ${item.relative}`);
    manifest.artifacts[index].digest = backupDigest;
  });
  manifest.state = 'copied';
  const manifestPath = path.join(snapshotRoot, 'manifest.json');
  writeJsonAtomic(manifestPath, manifest);
  const removed = [];
  const rollback = () => {
    for (const item of removed) {
      const backup = path.join(snapshotRoot, manifest.artifacts[item.index].backup);
      if (!fs.existsSync(item.absolute)) fs.cpSync(backup, item.absolute, { recursive: true, preserveTimestamps: true });
      if (treeDigest(item.absolute) !== manifest.artifacts[item.index].digest) {
        throw new Error(`artifact snapshot rollback failed: ${item.relative}`);
      }
    }
  };
  const onSignal = () => {
    try { rollback(); } finally { process.exit(130); }
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    artifacts.forEach((item, index) => {
      fs.rmSync(item.absolute, { recursive: true, force: true });
      removed.push({ ...item, index });
    });
  } catch (error) {
    rollback();
    throw error;
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
  process.stdout.write(`${JSON.stringify({ snapshotted: artifacts.map((item) => item.relative) })}\n`);
  process.exit(0);
}

const manifestPath = path.join(snapshotRoot, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1 || manifest.repositoryRoot !== repositoryRoot
  || !/^[0-9a-f-]{36}$/.test(manifest.transactionId)
  || manifest.state !== 'copied' || !Array.isArray(manifest.artifacts)) {
  throw new Error('snapshot manifest does not match repository-root');
}
const seenDestinations = new Set();
const validatedArtifacts = manifest.artifacts.map((item, index) => {
  const destination = path.resolve(repositoryRoot, item.relative);
  const relativeDestination = path.relative(repositoryRoot, destination);
  const backup = path.resolve(snapshotRoot, item.backup);
  const relativeBackup = path.relative(snapshotRoot, backup);
  const normalizedRelative = item.relative.split(path.sep).join('/');
  const firstSegment = normalizedRelative.split('/')[0];
  if (relativeDestination.startsWith(`..${path.sep}`) || path.isAbsolute(relativeDestination)
    || relativeBackup.startsWith(`..${path.sep}`) || path.isAbsolute(relativeBackup)
    || normalizedRelative !== path.posix.normalize(normalizedRelative) || ignored.has(firstSegment)
    || !isArtifactRoot(normalizedRelative) || item.backup !== `items/${index}`
    || seenDestinations.has(destination) || !fs.lstatSync(backup).isDirectory()
    || treeDigest(backup) !== item.digest) {
    throw new Error(`unsafe artifact manifest entry: ${item.relative}`);
  }
  seenDestinations.add(destination);
  assertNoSymlinkPath(snapshotRoot, backup);
  assertNoSymlinkAncestors(destination);
  return { destination, backup, relative: item.relative, digest: item.digest };
});
const staged = validatedArtifacts.map((item, index) => {
  const destination = `${item.destination}.vulpora-restore-${manifest.transactionId}-${index}`;
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(item.backup, destination, { recursive: true, preserveTimestamps: true });
  }
  if (fs.lstatSync(destination).isSymbolicLink() || treeDigest(destination) !== item.digest) {
    throw new Error(`restore staging verification failed: ${item.relative}`);
  }
  return { ...item, staged: destination };
});
let removed = [];
try {
  removed = removeCurrent();
  for (const item of staged) {
    fs.renameSync(item.staged, item.destination);
    if (treeDigest(item.destination) !== item.digest) throw new Error(`restored artifact verification failed: ${item.relative}`);
  }
} catch (error) {
  for (const item of staged) {
    if (fs.existsSync(item.destination) && !fs.lstatSync(item.destination).isSymbolicLink()
      && treeDigest(item.destination) === item.digest) continue;
    fs.rmSync(item.destination, { recursive: true, force: true });
    fs.cpSync(item.backup, item.destination, { recursive: true, preserveTimestamps: true });
    if (fs.lstatSync(item.destination).isSymbolicLink() || treeDigest(item.destination) !== item.digest) {
      throw new Error(`automatic restore recovery failed after: ${error.message}`);
    }
  }
}
for (const item of staged) fs.rmSync(item.staged, { recursive: true, force: true });
for (const item of discover()) {
  if (!seenDestinations.has(item.absolute)) fs.rmSync(item.absolute, { recursive: true, force: true });
}
fs.rmSync(snapshotRoot, { recursive: true, force: true });
process.stdout.write(`${JSON.stringify({ removed, restored: manifest.artifacts.map((item) => item.relative) })}\n`);
