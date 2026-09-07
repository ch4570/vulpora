#!/usr/bin/env bash
# Reject organization-specific identifiers from public release inputs.

set -eu
set -o pipefail
set -f

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
HASH_DENYLIST="$SCRIPT_DIR/public-release-denylist.sha256"

die() {
  printf 'public release neutrality 오류: %s\n' "$*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || die "node를 찾을 수 없습니다."
[ -f "$HASH_DENYLIST" ] && [ ! -L "$HASH_DENYLIST" ] \
  || die "hashed private identifier denylist를 찾을 수 없습니다."

node - "$REPO_ROOT" "$HASH_DENYLIST" <<'NODE'
const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const denylistPath = process.argv[3];
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

const blockedHashes = new Set(
  fs.readFileSync(denylistPath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
);
for (const digest of blockedHashes) {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('invalid private identifier digest');
}

// Git clones include untracked release inputs; extracted npm packages have no
// .git and must still receive the same content scan (without parent-repo bleed).
let gitRoot = '';
try { gitRoot = childProcess.execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'],
  { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
function packageInventory(relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    if (['.git', 'node_modules'].includes(entry.name) || entry.isSymbolicLink()) return [];
    const filename = path.join(relative, entry.name);
    return entry.isDirectory() ? packageInventory(filename) : entry.isFile() ? [filename] : [];
  });
}
const inventory = gitRoot === root ? childProcess.execFileSync(
  'git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard']
).toString('utf8').split('\0').filter(Boolean) : packageInventory();
const denylistRelative = path.relative(root, denylistPath);
const blockedPattern = process.env.VULPORA_PRIVATE_IDENTIFIER_PATTERN
  ? new RegExp(process.env.VULPORA_PRIVATE_IDENTIFIER_PATTERN, 'i') : null;
const localPathPattern = /(^|[\s"'=(])(\/Users\/[^/]+\/|\/home\/[^/]+\/)/mi;
// Content is normalized below; macOS's mixed-case root must still be detected.
// Construct probes so these test values do not themselves enter the deny scan.
for (const directory of ['Users', 'users', 'UsErS', 'home']) {
  const probe = path.posix.join('/', directory, 'fixture-user', 'private');
  if (!localPathPattern.test(probe.toLowerCase()) || localPathPattern.test(`relative${probe}`)) {
    throw new Error('local absolute path detector regression');
  }
}

const retiredProduct = new RegExp(['agent', 'lab'].join('[-_ ]?'), 'i');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
for (const relative of inventory) {
  if (relative === denylistRelative || relative === 'install/test-public-release-neutrality.sh') continue;
  const absolute = path.join(root, relative);
  let stat;
  try { stat = fs.lstatSync(absolute); } catch { continue; }
  if (retiredProduct.test(relative)) throw new Error(`retired product pathname: ${relative}`);
  if (!stat.isFile() || stat.isSymbolicLink()) continue;

  const bytes = fs.readFileSync(absolute);
  if (bytes.includes(0)) continue;
  const source = `${relative}\n${bytes.toString('utf8')}`.toLowerCase();
  if (retiredProduct.test(source)) throw new Error(`retired product identifier: ${relative}`);
  if (blockedPattern?.test(source)) throw new Error(`private identifier pattern matched in ${relative}`);
  if (localPathPattern.test(source)) throw new Error(`local absolute path matched in ${relative}`);
  const identifiers = source.match(/[a-z0-9]+(?:[-_][a-z0-9]+)*/g) || [];
  const candidates = new Set(identifiers);
  for (const identifier of identifiers) {
    const parts = identifier.split(/[-_]/).filter(Boolean);
    for (let start = 0; start < parts.length; start += 1) {
      for (let end = start + 1; end <= parts.length; end += 1) {
        const slice = parts.slice(start, end);
        candidates.add(slice.join('-'));
        candidates.add(slice.join('_'));
        candidates.add(slice.join(''));
      }
    }
  }
  for (const candidate of candidates) {
    const candidateDigest = digest(candidate);
    if (blockedHashes.has(candidateDigest)) {
      throw new Error(`private identifier digest ${candidateDigest.slice(0, 12)}… matched in ${relative}`);
    }
  }
}

const pkg = readJson('package.json');
const plugin = readJson('.claude-plugin/plugin.json');
const marketplace = readJson('.claude-plugin/marketplace.json');
const expectedRepository = 'https://github.com/ch4570/vulpora.git';
const expectedLicense = 'Apache-2.0';
const licenseText = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

if (pkg.name !== 'vulpora') throw new Error(`unexpected package name: ${pkg.name}`);
if (pkg.bin?.vulpora !== 'vulpora' || Object.keys(pkg.bin).join(' ') !== 'vulpora') {
  throw new Error('the only public npm command must be vulpora');
}
if (pkg.author?.name !== 'Vulpora Contributors') throw new Error(`unexpected package author: ${pkg.author?.name}`);
if (pkg.homepage !== 'https://github.com/ch4570/vulpora') throw new Error(`unexpected homepage: ${pkg.homepage}`);
if (pkg.repository?.url !== expectedRepository) throw new Error(`unexpected repository: ${pkg.repository?.url}`);
if (pkg.bugs?.url !== 'https://github.com/ch4570/vulpora/issues') throw new Error(`unexpected bugs URL: ${pkg.bugs?.url}`);
if (pkg.license !== expectedLicense) throw new Error(`unexpected package license: ${pkg.license}`);
if (pkg.publishConfig?.access !== 'public') throw new Error(`unexpected publish access: ${pkg.publishConfig?.access}`);
if (pkg.publishConfig?.registry !== 'https://registry.npmjs.org/') throw new Error('unexpected publish registry');
const releaseVersion = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+\.\d+$/.test(releaseVersion)) throw new Error('invalid repository version');
const packageVersion = releaseVersion.split('.').slice(0, 3).join('.');
if (pkg.version !== packageVersion || plugin.version !== packageVersion || marketplace.metadata?.version !== packageVersion) {
  throw new Error('package, plugin and marketplace versions must match VERSION');
}
if (!pkg.files?.includes('LICENSE')) throw new Error('LICENSE is missing from package files');
if (!pkg.files?.includes('NOTICE')) throw new Error('NOTICE is missing from package files');
if (!pkg.files?.includes('docs/')) throw new Error('docs are missing from package files');
for (const relative of ['vulpora', 'README.md', 'README.ko.md', 'README.en.md']) {
  if (!pkg.files?.includes(relative)) throw new Error(`${relative} is missing from package files`);
}
if (!pkg.files?.includes('vulpora.config.example.json')) throw new Error('project config example is missing from package files');
if (plugin.author?.name !== 'Vulpora Contributors') throw new Error(`unexpected plugin author: ${plugin.author?.name}`);
if (plugin.name !== 'vulpora') throw new Error('the public plugin identifier must be vulpora');
if (plugin.license !== expectedLicense) throw new Error(`unexpected plugin license: ${plugin.license}`);
if (marketplace.owner?.name !== 'Vulpora Contributors') throw new Error(`unexpected marketplace owner: ${marketplace.owner?.name}`);
if (marketplace.name !== 'vulpora' || marketplace.plugins?.length !== 1
    || marketplace.plugins[0].name !== 'vulpora' || marketplace.plugins[0].version !== packageVersion) {
  throw new Error('marketplace must expose the single current Vulpora plugin');
}
if (!licenseText.trimStart().startsWith('Apache License')) throw new Error('unexpected LICENSE title');
if (!licenseText.includes('Version 2.0, January 2004')) throw new Error('Apache license version is missing');
if (!licenseText.includes('Grant of Patent License')) throw new Error('Apache patent grant is missing');
if (!readme.includes('Apache-2.0')) throw new Error('README open-source license disclosure is incomplete');
for (const relative of ['CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'SUPPORT.md', 'GOVERNANCE.md']) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`${relative} is missing`);
}
const scripts = pkg.scripts || {};
for (const hook of ['preinstall', 'install', 'postinstall', 'preuninstall', 'uninstall', 'postuninstall']) {
  if (scripts[hook]) throw new Error(`environment-mutating npm lifecycle is forbidden: ${hook}`);
}
NODE

printf 'public release neutrality OK\n'
