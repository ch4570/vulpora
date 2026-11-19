#!/usr/bin/env node
'use strict';
// Bounded filesystem inventory only. Package text is never executed or promoted
// into instructions, and user-scope paths are inspected only when supplied.
const fs = require('node:fs');
const path = require('node:path');
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_ENTRIES = 512;

function collectContext(root, {inventory = [], skillRoots = [], agentRoots = []} = {}) {
  root = fs.realpathSync(root);
  if (!fs.statSync(root).isDirectory()) throw Error('INVALID_PROJECT_ROOT');
  if (!Array.isArray(inventory) || inventory.length > MAX_ENTRIES
    || ![skillRoots, agentRoots].every(x => Array.isArray(x) && x.length <= 16
      && x.every(p => typeof p === 'string' && path.isAbsolute(p)))) throw Error('INVALID_INVENTORY');
  const capabilities = new Map(), skippedPaths = new Set();
  function add(kind, id, source) {
    const validId = typeof id === 'string' && id.length <= 256
      && (source === 'host inventory' ? id.split(':').every(part => ID.test(part)) : ID.test(id));
    if (!['skill', 'agent'].includes(kind) || !validId) throw Error('INVALID_INVENTORY');
    const key = `${kind}:${id}`;
    if (!capabilities.has(key)) capabilities.set(key, {kind, id, sources: []});
    const record = capabilities.get(key);
    if (!record.sources.includes(source)) record.sources.push(source);
    if (capabilities.size > MAX_ENTRIES) throw Error('INVENTORY_LIMIT');
  }
  function inspect(base, relative) {
    let cursor = base, stat;
    for (const segment of relative.split(path.sep)) {
      cursor = path.join(cursor, segment);
      try { stat = fs.lstatSync(cursor); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      if (stat.isSymbolicLink()) { skippedPaths.add(cursor); return null; }
    }
    return stat;
  }
  function scan(base, relative, kind) {
    if (!inspect(base, relative)?.isDirectory()) return;
    const directory = path.join(base, relative), entries = fs.readdirSync(directory).sort();
    if (entries.length > MAX_ENTRIES) throw Error('INVENTORY_LIMIT');
    for (const entry of entries) {
      const child = path.join(relative, entry), stat = inspect(base, child);
      if (kind === 'skill' && stat?.isDirectory() && ID.test(entry)
        && inspect(base, path.join(child, 'SKILL.md'))?.isFile()) {
        add(kind, entry, path.join(base, child, 'SKILL.md'));
      } else if (kind === 'agent' && stat?.isFile() && /\.(md|toml)$/.test(entry)) {
        const id = entry.replace(/\.(md|toml)$/, '');
        if (ID.test(id)) add(kind, id, path.join(base, child));
      }
    }
  }
  for (const item of inventory) {
    if (!item || typeof item !== 'object' || Object.keys(item).sort().join(',') !== 'id,kind') throw Error('INVALID_INVENTORY');
    add(item.kind, item.id, 'host inventory');
  }
  for (const relative of ['.agents/skills', '.claude/skills']) scan(root, relative, 'skill');
  for (const relative of ['.codex/agents', '.claude/agents']) scan(root, relative, 'agent');
  for (const [kind, roots] of [['skill', skillRoots], ['agent', agentRoots]]) {
    for (const extra of roots) scan(path.dirname(extra), path.basename(extra), kind);
  }
  const optionalSources = {};
  for (const relative of ['AGENTS.md', 'CLAUDE.md', '.claude/knowledge/README.md', '.claude/retro',
    'harness/index.html', 'harness/proposals']) {
    const stat = inspect(root, relative);
    optionalSources[relative] = Boolean(stat && (relative.endsWith('.md') || relative.endsWith('.html')
      ? stat.isFile() : stat.isDirectory()));
  }
  return {schema: 'vulpora.harness-context/v1', capabilities: [...capabilities.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([, item]) => ({...item, hostExposed: item.sources.includes('host inventory'), sources: item.sources.sort()})), optionalSources,
    reportMode: optionalSources['harness/index.html'] ? 'existing' : 'standalone', skippedPaths: [...skippedPaths].sort()};
}

if (require.main === module) {
  try {
    const options = {skillRoots: [], agentRoots: []}; let root = process.cwd(), seenRoot = false, seenInventory = false;
    for (let n = 2; n < process.argv.length; n += 2) {
      const flag = process.argv[n], value = process.argv[n + 1];
      if (!value || value.startsWith('--')) throw Error('INVALID_ARGUMENTS');
      if (flag === '--root' && !seenRoot) { root = value; seenRoot = true; }
      else if (flag === '--inventory' && !seenInventory) {
        const stat = fs.lstatSync(value);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024) throw Error('INVALID_INVENTORY');
        options.inventory = JSON.parse(fs.readFileSync(value, 'utf8')); seenInventory = true;
      } else if (flag === '--skill-root') options.skillRoots.push(value);
      else if (flag === '--agent-root') options.agentRoots.push(value);
      else throw Error('INVALID_ARGUMENTS');
    }
    process.stdout.write(JSON.stringify(collectContext(root, options)) + '\n');
  } catch (error) {
    process.stderr.write((/^[A-Z_]+$/.test(error.message) ? error.message : 'CONTEXT_READ_FAILED') + '\n');
    process.exitCode = 1;
  }
}
module.exports = {collectContext};
