#!/usr/bin/env node
'use strict';

// Complete, explicit source-context injection. This is not runtime skill
// discovery: source-relative references are not made readable by the sandbox.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function localPath(root, relative, expected) {
  if (typeof relative !== 'string' || !relative || /[\\\x00-\x1f]/.test(relative)
      || path.isAbsolute(relative) || relative.split('/').some(p => !p || p === '.' || p === '..')) {
    throw new Error('unsafe_asset_path');
  }
  let current = root;
  for (const component of relative.split('/')) {
    current = path.join(current, component);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('symlink_asset_path');
  }
  const stat = fs.statSync(current);
  if (!(expected === 'directory' ? stat.isDirectory() : stat.isFile())) throw new Error('wrong_asset_path_kind');
  return current;
}

function readText(root, relative) {
  const filename = localPath(root, relative, 'file');
  if (fs.statSync(filename).size > 4 * 1024 * 1024) throw new Error('asset_too_large');
  const bytes = fs.readFileSync(filename);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (!text.trim() || text.includes('\0')) throw new Error('empty_or_binary_asset');
  return { text, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

function loadContext({ root, asset, baseline, kind = '' }) {
  if (!['plain-runtime', 'agent-only', 'agent-memory'].includes(baseline)) throw new Error('unsupported_baseline');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(asset)) throw new Error('unsafe_asset_id');
  if (kind && !['agent', 'skill'].includes(kind)) throw new Error('unsupported_asset_kind');
  root = fs.realpathSync(root);
  const metadata = {
    schema_version: 1, asset, source_kind: null, baseline,
    context_mode: baseline === 'plain-runtime' ? 'none' : 'complete_entry_injection',
    references_available: 'only_inlined_files_and_fixture',
    runtime_discovery_measured: false, loaded_files: [],
  };
  if (baseline === 'plain-runtime') return { text: '', metadata };
  const rows = readText(root, 'install/manifest.txt').text.split(/\r?\n/)
    .filter(line => line.trim() && !line.trim().startsWith('#'))
    .map(line => line.split('|').map(value => value.trim()))
    .filter(row => row[1] === asset && (!kind || row[0] === kind));
  if (rows.length !== 1) throw new Error('missing_or_ambiguous_asset');
  const [sourceKind, , definition, bundle] = rows[0];
  if (!['agent', 'skill'].includes(sourceKind)) throw new Error('unsupported_asset_kind');
  if (!definition.startsWith(sourceKind === 'skill' ? 'skills/' : 'agents/')
      || (sourceKind === 'agent' && bundle && bundle !== '-' && !bundle.startsWith('agents/'))) throw new Error('unsafe_asset_namespace');
  metadata.source_kind = sourceKind;
  const plan = [];
  if (sourceKind === 'skill') {
    localPath(root, definition, 'directory');
    plan.push([`${definition}/SKILL.md`, 'skill_entry']);
  } else {
    plan.push([definition, 'agent_definition']);
    if (bundle && bundle !== '-') {
      localPath(root, bundle, 'directory');
      plan.push([`${bundle}/SOUL.md`, 'agent_soul'], [`${bundle}/reference/principles.md`, 'agent_principles']);
    }
  }
  if (baseline === 'agent-memory') {
    const policies = localPath(root, 'memory/policies', 'directory');
    const names = fs.readdirSync(policies).filter(name => name.endsWith('.md')).sort();
    if (!names.length) throw new Error('missing_memory_policies');
    for (const name of names) plan.push([`memory/policies/${name}`, 'memory_policy']);
  }
  let text = '\n## Explicit evaluation context\n'
    + 'The files below are included completely. Their labels are source paths, not fixture paths.\n'
    + 'Only these inlined files and files already in the fixture are available. Other source-relative references, scripts, and dependency assets are not staged or readable.\n'
    + 'If the task requires an unavailable reference, report the missing context; do not leave the fixture, fetch it, or claim it was read. This evaluation measures entry injection, not runtime discovery.\n';
  for (const [relative, role] of plan) {
    const file = readText(root, relative);
    const runs = file.text.match(/`+/g) || [];
    const fence = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
    text += `\n### ${role}: ${relative}\n${fence}text\n${file.text}\n${fence}\n`;
    metadata.loaded_files.push({ path: relative, role, bytes: file.bytes, sha256: file.sha256, complete: true });
  }
  return { text, metadata };
}

module.exports = { loadContext, localPath };
if (require.main === module) {
  try {
    const [root, asset, baseline, metadataFile, kind = ''] = process.argv.slice(2);
    const context = loadContext({ root, asset, baseline, kind });
    fs.writeFileSync(metadataFile, JSON.stringify(context.metadata) + '\n', { mode: 0o600 });
    process.stdout.write(context.text);
  } catch {
    // Never print source content, host paths, or parser input in diagnostics.
    process.stderr.write('Cannot load complete evaluation context; check manifest, baseline, and local asset paths.\n');
    process.exitCode = 2;
  }
}
