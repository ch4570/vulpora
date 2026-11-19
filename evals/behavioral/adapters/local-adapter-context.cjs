#!/usr/bin/env node
'use strict';

// Complete, explicit source-context injection. This is not runtime skill
// discovery: source-relative references are not made readable by the sandbox.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

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

function stageSecurityContext(root, metadata, rows, stageRoot) {
  const skill = rows.find(row => row[0] === 'skill' && row[1] === 'security-scan-workflow');
  const auditors = rows.filter(row => row[0] === 'agent' && row[1] === 'security-auditor');
  if (!skill || skill[2] !== 'skills/security-scan-workflow'
      || skill[4] !== 'agent:security-auditor' || auditors.length !== 1
      || auditors[0][2] !== 'agents/security-auditor.md' || auditors[0][3] !== 'agents/security-auditor') {
    throw new Error('invalid_security_dependency');
  }
  if (!stageRoot || !path.isAbsolute(stageRoot) || fs.lstatSync(stageRoot).isSymbolicLink()
      || !fs.statSync(stageRoot).isDirectory() || fs.readdirSync(stageRoot).length) throw new Error('unsafe_stage_root');
  stageRoot = fs.realpathSync(stageRoot);
  const plan = [];
  function collect(relative, role) {
    const directory = localPath(root, relative, 'directory');
    for (const name of fs.readdirSync(directory).sort()) {
      const next = `${relative}/${name}`;
      const stat = fs.lstatSync(path.join(directory, name));
      if (stat.isSymbolicLink()) throw new Error('symlink_asset_path');
      if (stat.isDirectory()) collect(next, role);
      else { plan.push([next, role]); if (plan.length > 250) throw new Error('security_bundle_too_large'); }
    }
  }
  collect(skill[2], 'skill_reference');
  plan.push([auditors[0][2], 'agent_definition']);
  collect(auditors[0][3], 'agent_reference');
  for (const required of ['skills/security-scan-workflow/SKILL.md',
    'skills/security-scan-workflow/reference/principles.md', 'skills/security-scan-workflow/reference/kb/INDEX.md',
    'skills/security-scan-workflow/reference/kb/reporting.md', 'agents/security-auditor/SOUL.md',
    'agents/security-auditor/reference/principles.md', 'agents/security-auditor/reference/kb/INDEX.md']) {
    if (!plan.some(([relative]) => relative === required)) throw new Error('missing_security_reference');
  }
  // Validate the complete package before copying. Copying makes topics available;
  // it does not inject or claim that the model read every topic in the KB.
  const files = plan.map(([relative, role]) => ({ relative, role, ...readText(root, relative) }));
  if (files.reduce((sum, file) => sum + file.bytes, 0) > 8 * 1024 * 1024) throw new Error('security_bundle_too_large');
  const paths = new Set(files.map(file => file.relative));
  for (const file of files.filter(file => /\/(SKILL|INDEX)\.md$/.test(file.relative))) {
    for (const match of file.text.matchAll(/\]\(([^\s)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file.relative), target));
      if (target.startsWith('/') || !paths.has(relative)) throw new Error('missing_security_reference');
    }
  }
  for (const file of files) {
    const destination = path.join(stageRoot, file.relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.text, { flag: 'wx', mode: 0o400 });
  }
  Object.assign(metadata, {
    context_mode: 'staged_security_workflow', references_available: 'staged_bundle_not_runtime_granted',
    native_auditor_status: 'not_run_registration_unverified',
    available_files: files.map(file => ({ path: file.relative, role: file.role, bytes: file.bytes, sha256: file.sha256, complete: true })),
  });
  return { metadata, text: '\n## Prepared security workflow context — NOT_RUN\n'
    + `Same-release source files are staged under ${stageRoot}.\n`
    + 'Entry: skills/security-scan-workflow/SKILL.md. Auditor definition: agents/security-auditor.md.\n'
    + 'Read each entry and its required principles/INDEX first; select topic references through that INDEX.\n'
    + 'Staging does not establish native reviewer registration, sandbox access, discovery, or execution.\n'
    + 'The adapter must stop before model invocation until exact native registration and restricted permissions are verified.\n' };
}

// Configuration preparation only; callers must independently verify native
// dispatch and profile enforcement before use. Render canonical Markdown like
// the installer, not the release TOML's deliberate runtime-required tombstone.
function prepareSecurityRuntime({ stageRoot, fixtureRoot, writePaths = [] }) {
  stageRoot = fs.realpathSync(stageRoot); fixtureRoot = fs.realpathSync(fixtureRoot);
  if ([stageRoot, fixtureRoot].some(value => /[\x00-\x1f*?\[\]{}]/.test(value))
      || !Array.isArray(writePaths) || writePaths.length > 64) throw new Error('unsafe_runtime_paths');
  const childFilesystem = { ':root': 'deny', ':minimal': 'read', ':tmpdir': 'deny', ':slash_tmp': 'deny',
    [fixtureRoot]: 'read', [stageRoot]: 'read' };
  const parentFilesystem = { ...childFilesystem };
  for (const relative of writePaths) {
    if (typeof relative !== 'string' || /[*?\[\]{}]/.test(relative)) throw new Error('unsafe_write_scope');
    parentFilesystem[localPath(fixtureRoot, relative, 'file')] = 'write';
  }
  const canonical = readText(stageRoot, 'agents/security-auditor.md');
  const body = canonical.text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .split('${CLAUDE_PLUGIN_ROOT}/skills/').join(`${stageRoot}/skills/`)
    .split('${CLAUDE_PLUGIN_ROOT}').join(stageRoot);
  if (body.includes("'''")) throw new Error('unsafe_canonical_delimiter');
  const filesystemToml = map => '{' + Object.entries(map).map(([key, value]) => `${JSON.stringify(key)}=${JSON.stringify(value)}`).join(',') + '}';
  const role = 'name = "security-auditor"\n'
    + 'description = "Exact same-release read-only Vulpora security auditor"\n'
    + 'approval_policy = "never"\nweb_search = "disabled"\nallow_login_shell = false\n'
    + 'default_permissions = "vulpora_security_child_read"\n'
    + `developer_instructions = '''\n${body}\n'''\n`
    + '[agents]\nenabled = false\n'
    + '[permissions.vulpora_security_child_read]\n'
    + `filesystem = ${filesystemToml(childFilesystem)}\nnetwork.enabled = false\n`;
  const roleFile = path.join(stageRoot, 'security-auditor.toml');
  fs.writeFileSync(roleFile, role, { flag: 'wx', mode: 0o400 });
  return { roleFile, parentFilesystem, childFilesystem, roleSha256: crypto.createHash('sha256').update(role).digest('hex'), args: [
    'agents.enabled=true', 'agents.max_concurrent_threads_per_session=1',
    `agents.security-auditor.config_file=${JSON.stringify(roleFile)}`,
    'agents.security-auditor.description="Exact same-release read-only Vulpora security auditor"',
    'default_permissions="vulpora_security_parent"',
    `permissions.vulpora_security_parent.filesystem=${filesystemToml(parentFilesystem)}`,
    'permissions.vulpora_security_parent.network.enabled=false',
    `permissions.vulpora_security_child_read.filesystem=${filesystemToml(childFilesystem)}`,
    'permissions.vulpora_security_child_read.network.enabled=false',
    'allow_login_shell=false',
  ] };
}

function probeIsolation({ fixtureRoot, tempRoot, profile, permissionArgs, codexBin = 'codex' }) {
  if (!['vulpora_eval_read', 'vulpora_eval_write'].includes(profile)) throw new Error('unsupported_probe_profile');
  fixtureRoot = fs.realpathSync(fixtureRoot); tempRoot = fs.realpathSync(tempRoot);
  const inside = fs.mkdtempSync(path.join(fixtureRoot, '.vulpora-isolation-'));
  const outside = fs.mkdtempSync(path.join(tempRoot, 'isolation-'));
  try {
    const fixtureFile = path.join(inside, 'synthetic.txt'), outsideFile = path.join(outside, 'synthetic.txt');
    fs.writeFileSync(fixtureFile, 'synthetic-fixture'); fs.writeFileSync(outsideFile, 'synthetic-outside');
    const home = path.join(outside, 'home'), codexHome = path.join(outside, 'codex'), tmpdir = path.join(outside, 'tmp');
    for (const directory of [home, codexHome, tmpdir]) fs.mkdirSync(directory);
    const program = 'outside_read=denied; outside_write=denied; fixture_read=denied; fixture_write=denied; '
      + 'if /bin/cat "$1" >/dev/null 2>&1; then outside_read=allowed; fi; '
      + 'if (printf modified > "$1") 2>/dev/null; then outside_write=allowed; fi; '
      + 'if /bin/cat "$2" >/dev/null 2>&1; then fixture_read=allowed; fi; '
      + 'if (printf modified > "$2") 2>/dev/null; then fixture_write=allowed; fi; '
      + 'printf \'{"outside_read":"%s","outside_write":"%s","fixture_read":"%s","fixture_write":"%s"}\\n\' '
      + '"$outside_read" "$outside_write" "$fixture_read" "$fixture_write"';
    const result = spawnSync(codexBin, ['sandbox', '-C', fixtureRoot, '-P', profile,
      '-c', `default_permissions=${JSON.stringify(profile)}`, ...permissionArgs,
      '/bin/sh', '-c', program, 'vulpora-isolation-probe', outsideFile, fixtureFile], {
      cwd: fixtureRoot, env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: codexHome, TMPDIR: tmpdir, LANG: 'C' },
      encoding: 'utf8', timeout: 15000, maxBuffer: 65536,
    });
    let observed = {};
    try { observed = JSON.parse(result.stdout); } catch { /* fail closed below */ }
    const expectedWrite = profile === 'vulpora_eval_write' ? 'allowed' : 'denied';
    const verified = result.status === 0 && observed.outside_read === 'denied' && observed.outside_write === 'denied'
      && observed.fixture_read === 'allowed' && observed.fixture_write === expectedWrite
      && fs.readFileSync(outsideFile, 'utf8') === 'synthetic-outside'
      && fs.readFileSync(fixtureFile, 'utf8') === (expectedWrite === 'allowed' ? 'modified' : 'synthetic-fixture');
    const safe = value => ['allowed', 'denied'].includes(value) ? value : 'unknown';
    return { verified, outside_read: safe(observed.outside_read), outside_write: safe(observed.outside_write),
      fixture_read: safe(observed.fixture_read), fixture_write: safe(observed.fixture_write) };
  } finally {
    fs.rmSync(inside, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
}

function loadContext({ root, asset, baseline, kind = '', profile = 'entry', stageRoot = '' }) {
  if (!['plain-runtime', 'agent-only', 'agent-memory'].includes(baseline)) throw new Error('unsupported_baseline');
  if (!['entry', 'security-workflow'].includes(profile)) throw new Error('unsupported_context_profile');
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
  const manifestRows = readText(root, 'install/manifest.txt').text.split(/\r?\n/)
    .filter(line => line.trim() && !line.trim().startsWith('#'))
    .map(line => line.split('|').map(value => value.trim()));
  const rows = manifestRows.filter(row => row[1] === asset && (!kind || row[0] === kind));
  if (rows.length !== 1) throw new Error('missing_or_ambiguous_asset');
  const [sourceKind, , definition, bundle] = rows[0];
  if (!['agent', 'skill'].includes(sourceKind)) throw new Error('unsupported_asset_kind');
  if (!definition.startsWith(sourceKind === 'skill' ? 'skills/' : 'agents/')
      || (sourceKind === 'agent' && bundle && bundle !== '-' && !bundle.startsWith('agents/'))) throw new Error('unsafe_asset_namespace');
  metadata.source_kind = sourceKind;
  if (profile === 'security-workflow') {
    if (asset !== 'security-scan-workflow' || sourceKind !== 'skill') throw new Error('unsupported_security_asset');
    if (baseline === 'agent-memory') throw new Error('security_memory_profile_unavailable');
    return stageSecurityContext(root, metadata, manifestRows, stageRoot);
  }
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

module.exports = { loadContext, localPath, prepareSecurityRuntime, probeIsolation };
if (require.main === module) {
  try {
    if (process.argv[2] === '--probe-isolation') {
      const [, , , fixtureRoot, tempRoot, profile, ...permissionArgs] = process.argv;
      const result = probeIsolation({ fixtureRoot, tempRoot, profile, permissionArgs });
      process.stdout.write(JSON.stringify(result) + '\n');
      process.exit(result.verified ? 0 : 3);
    }
    const [root, asset, baseline, metadataFile, kind = '', profile = 'entry', stageRoot = ''] = process.argv.slice(2);
    const context = loadContext({ root, asset, baseline, kind, profile, stageRoot });
    fs.writeFileSync(metadataFile, JSON.stringify(context.metadata) + '\n', { mode: 0o600 });
    process.stdout.write(context.text);
  } catch {
    // Never print source content, host paths, or parser input in diagnostics.
    process.stderr.write('Cannot load complete evaluation context; check manifest, baseline, and local asset paths.\n');
    process.exitCode = 2;
  }
}
