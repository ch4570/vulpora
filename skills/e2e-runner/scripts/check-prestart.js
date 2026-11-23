#!/usr/bin/env node
'use strict';

// Pre-start endpoint scan (RUN-7.1b / RUN-7.1c). Key-independent: it looks at every value, not at the keys a
// harness happened to set. Refuses to start (exit 3) when any value points at a port on this machine that was
// already listening before the run and that the run does not own. That is the shape of both reported incidents:
// the application resolves a default or a mistyped key to the shared local Redis or object store.
//
//   check-prestart.js --properties <file.json> [--phase prestart|client]
//                     [--listeners <snapshot.json>] [--environment <environment.json>] [--owned-port <n>]...
//                     [--exceptions <isolation-exceptions.json>] [--mode enforce|warn] [--out <findings.json>] [--now <iso>]
//
// --properties   flat or nested JSON object of property values (phase prestart: every property source of the
//                application; phase client: endpoint of each created client object, e.g. {"redis": "localhost:6379"}).
// --listeners    the wrapper's pre-run listener snapshot. Default: $VULPORA_LISTENER_SNAPSHOT, then a live snapshot.
// --environment  environment.json v2; its loopback endpoints are the run-owned ports.
// --exceptions   reviewed allow list. A person writes it; an agent must not. Applied entries are recorded.
// --mode warn    records what enforce would have refused and sets refusalSuppressed. Never the default.
//
// Exit: 0 clean or warnings only, 3 refused, 2 no listener evidence (fail closed), 64 usage.
// The findings file stores key names, hosts, and ports only; property values (which can carry credentials) are not copied.

const fs = require('node:fs');
const os = require('node:os');
const {liveSnapshot} = require('./snapshot-listeners');

const SCHEMA = 'vulpora.prestart-findings/v1';
const EXCEPTIONS_SCHEMA = 'vulpora.isolation-exceptions/v1';
const DEFAULT_PORTS = {postgresql: 5432, postgres: 5432, mysql: 3306, mariadb: 3306, redis: 6379, rediss: 6379, mongodb: 27017,
  amqp: 5672, amqps: 5671, http: 80, https: 443, kafka: 9092, sqlserver: 1433, oracle: 1521};
const DATA_SCHEMES = new Set(['postgresql', 'postgres', 'mysql', 'mariadb', 'redis', 'rediss', 'mongodb', 'amqp', 'amqps', 'kafka', 'sqlserver', 'oracle']);
const LOCAL_NAMES = new Set(['localhost', 'ip6-localhost', 'host.docker.internal', 'host.containers.internal', 'gateway.docker.internal',
  'kubernetes.docker.internal', 'host.lima.internal']);
const CODES = {prestart: 'PRESTART_ENDPOINT_NOT_OWNED', client: 'CLIENT_ENDPOINT_NOT_OWNED'};

function localAddresses() {
  const addresses = new Set();
  for (const list of Object.values(os.networkInterfaces())) for (const entry of list || []) addresses.add(entry.address.replace(/%.*$/, ''));
  return addresses;
}

// inet_aton-style spellings of an IPv4 address (`127.1`, `2130706433`, `0x7f.1`): 1 to 4 numeric parts.
function legacyIpv4(name) {
  const parts = name.split('.');
  if (parts.length < 1 || parts.length > 4 || parts.some((part) => !/^(0x[0-9a-f]+|\d+)$/i.test(part))) return null;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((value) => !Number.isFinite(value))) return null;
  const last = numbers[numbers.length - 1];
  const head = numbers.slice(0, -1);
  if (head.some((value) => value > 255) || last >= 256 ** (4 - head.length)) return null;
  return head.reduce((total, value, index) => total + value * 256 ** (3 - index), 0) + last;
}

function isLocalHost(host, local = localAddresses()) {
  const name = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '').replace(/\.$/, '');
  const legacy = legacyIpv4(name);
  if (legacy !== null && (Math.floor(legacy / 2 ** 24) === 127 || legacy === 0)) return true;
  if (/^(0:){5}ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/.test(name) || /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/.test(name)) return true;
  if (LOCAL_NAMES.has(name) || name.endsWith('.localhost')) return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(name) || name === '::1' || name === '0.0.0.0' || name === '::' || name === '0:0:0:0:0:0:0:1') return true;
  if (/^::ffff:127\./i.test(name)) return true;
  return local.has(name);
}

function flatten(value, prefix = '', out = {}) {
  if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      flatten(inner, Array.isArray(value) ? `${prefix}[${key}]` : prefix ? `${prefix}.${key}` : key, out);
    }
  } else if (typeof value === 'string' || typeof value === 'number') {
    out[prefix] = String(value);
  }
  return out;
}

// The userinfo may contain an unencoded '@' (a password); the greedy match ends at the last '@' of the authority.
const URL_PATTERN = /([a-z][a-z0-9+.-]*):\/\/(?:[^\/\s?#]*@)?(\[[0-9a-f:.]+\]|[A-Za-z0-9._-]+)(?::(\d{1,5}))?/gi;
const HOSTPORT_PATTERN = /(?<![\w.\/@-])(\[[0-9a-f:.]+\]|(?:\d{1,3}\.){3}\d{1,3}|[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*):(\d{2,5})(?![\w:])/gi;

function validPort(port) { return Number.isInteger(port) && port > 0 && port <= 65535; }
const lastSegment = (key) => key.replace(/\[\d+\]$/, '').split('.').pop().toLowerCase();
const prefixOf = (key) => { const index = key.lastIndexOf('.'); return index < 0 ? '' : key.slice(0, index); };
const HOST_KEYS = new Set(['host', 'hostname', 'server', 'address']);
const OWN_BIND_PORT = /(^|\.)server\.port$|^local\.server\.port$|(^|\.)management\.port$/i;

// Candidate (key, host, port) triples from a flat property map. The sibling and lone-port rules only look at the
// last key segment, so a mistyped or prefixed key such as `...redis.<service>.host` is still paired.
function extractCandidates(flat) {
  const candidates = new Map();
  const add = (key, host, port, via, remoteOk) => {
    if (!host || !validPort(port)) return;
    const id = `${key}|${host.toLowerCase()}|${port}`;
    if (!candidates.has(id)) candidates.set(id, {key, host, port, via, remoteOk});
  };
  const keys = Object.keys(flat);
  const byPrefix = new Map();
  for (const key of keys) {
    const segment = lastSegment(key);
    const bucket = byPrefix.get(prefixOf(key)) || {};
    if (HOST_KEYS.has(segment)) bucket.host = key;
    if (segment === 'port' && /^\d{1,5}$/.test(flat[key])) bucket.port = key;
    byPrefix.set(prefixOf(key), bucket);
  }
  for (const key of keys) {
    const value = flat[key];
    for (const match of value.matchAll(URL_PATTERN)) {
      const scheme = match[1].toLowerCase();
      const port = match[3] !== undefined ? Number(match[3]) : DEFAULT_PORTS[scheme];
      add(key, match[2], port, 'url', match[3] !== undefined || DATA_SCHEMES.has(scheme));
    }
    for (const match of value.matchAll(HOSTPORT_PATTERN)) {
      const host = match[1];
      const dotted = host.includes('.') || host.startsWith('[');
      add(key, host, Number(match[2]), 'host-port', dotted && !/^\d+\.\d+$/.test(host));
    }
  }
  for (const [prefix, bucket] of byPrefix) {
    if (bucket.host && bucket.port) {
      const hostValue = flat[bucket.host];
      // `server.address` + `server.port` is the application's own bind, not a client endpoint.
      if (!/[:/]/.test(hostValue) && !OWN_BIND_PORT.test(bucket.port)) add(bucket.host, hostValue, Number(flat[bucket.port]), 'host-and-port-keys', true);
    } else if (bucket.port && !bucket.host && !OWN_BIND_PORT.test(bucket.port)) {
      // A port key with no host key: the client falls back to its default host, which is this machine.
      add(bucket.port, 'localhost', Number(flat[bucket.port]), 'port-key-default-host', false);
    }
    void prefix;
  }
  return [...candidates.values()];
}

function validateExceptions(document, now) {
  const accepted = [];
  const rejected = [];
  if (document === null) return {accepted, rejected};
  const entries = document && document.schema === EXCEPTIONS_SCHEMA && Array.isArray(document.exceptions) ? document.exceptions : null;
  if (!entries) return {accepted, rejected: [{id: null, reason: `exceptions file must have schema ${EXCEPTIONS_SCHEMA} and an exceptions array`}]};
  for (const entry of entries) {
    const id = entry && typeof entry.id === 'string' && entry.id.trim() ? entry.id : null;
    const fail = (reason) => rejected.push({id, reason});
    if (!id) { fail('missing id'); continue; }
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) { fail('missing reason'); continue; }
    if (typeof entry.owner !== 'string' || !entry.owner.trim()) { fail('missing owner'); continue; }
    if (typeof entry.expires !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(entry.expires) || Number.isNaN(Date.parse(entry.expires))) { fail('missing or invalid expires'); continue; }
    if (Date.parse(entry.expires) < now) { fail('expired'); continue; }
    const match = entry.match;
    if (!match || typeof match !== 'object' || (match.host === undefined && match.port === undefined)) { fail('match needs a host or a port; a key alone is too broad'); continue; }
    if (match.port !== undefined && !validPort(match.port)) { fail('match.port must be a port number'); continue; }
    accepted.push({id, reason: entry.reason, owner: entry.owner, expires: entry.expires, match});
  }
  return {accepted, rejected};
}

function exceptionFor(candidate, exceptions) {
  return exceptions.find((entry) => (entry.match.key === undefined || entry.match.key === candidate.key)
    && (entry.match.host === undefined || entry.match.host.toLowerCase() === candidate.host.toLowerCase())
    && (entry.match.port === undefined || entry.match.port === candidate.port));
}

// Pure core: no files, no sockets. `listeners` is the pre-run snapshot's listener list.
function scanProperties({properties, listeners, ownedPorts = [], exceptions = [], rejectedExceptions = [], phase = 'prestart', mode = 'enforce', localSet}) {
  const flat = flatten(properties);
  const owned = new Set(ownedPorts);
  const listening = new Map();
  for (const listener of listeners) if (!listening.has(listener.port)) listening.set(listener.port, listener);
  const code = CODES[phase];
  const violations = [];
  const warnings = [];
  const exceptionsApplied = [];
  const candidates = extractCandidates(flat);
  for (const candidate of candidates) {
    const base = {key: candidate.key, host: candidate.host, port: candidate.port};
    if (!isLocalHost(candidate.host, localSet)) {
      if (candidate.remoteOk) warnings.push({code: 'PRESTART_REMOTE_ENDPOINT', ...base});
      continue;
    }
    if (owned.has(candidate.port)) continue;
    const listener = listening.get(candidate.port);
    if (!listener) { warnings.push({code: 'PRESTART_UNLISTENED_PORT_NOT_OWNED', ...base}); continue; }
    const finding = {code, ...base, listener: {command: listener.command, pid: listener.pid, category: listener.category}};
    const exception = exceptionFor(candidate, exceptions);
    if (exception) {
      exceptionsApplied.push({id: exception.id, owner: exception.owner, expires: exception.expires, reason: exception.reason, ...base});
      continue;
    }
    violations.push(finding);
  }
  const suppressed = mode === 'warn' && violations.length > 0;
  return {
    schema: SCHEMA, phase, mode, refused: mode === 'enforce' && violations.length > 0, refusalSuppressed: suppressed,
    violations: mode === 'enforce' ? violations : [],
    warnings: [...warnings, ...(mode === 'warn' ? violations.map((entry) => ({...entry, code: 'PRESTART_REFUSAL_SUPPRESSED', wouldBe: entry.code})) : [])],
    exceptionsApplied, exceptionsRejected: rejectedExceptions,
    scanned: {properties: Object.keys(flat).length, addresses: candidates.length},
  };
}

function refusalMessage(findings) {
  const lines = findings.violations.map((entry) => `REFUSED (${entry.code}): ${entry.key} -> ${entry.host}:${entry.port} points at a port that was already listening before this run `
    + `(${entry.listener.command}, pid ${entry.listener.pid}, ${entry.listener.category}) and is not run-owned. Nothing shared was touched.`);
  lines.push('Point the configuration at the run-owned endpoint. A deliberate, reviewed exception is a person-written entry in isolation-exceptions.json '
    + '(id, match.host/port, reason, owner, expires); an agent must not add one.');
  return lines.join('\n');
}

function usage(message) {
  process.stderr.write(`${message}\nusage: check-prestart.js --properties <file.json> [--phase prestart|client] [--listeners <snapshot.json>] [--environment <environment.json>] [--owned-port <n>]... [--exceptions <file>] [--mode enforce|warn] [--out <file>] [--now <iso>]\n`);
  return 64;
}

function readJson(file, what) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { throw new Error(`unreadable ${what}: ${error.message}`); }
}

function main(argv) {
  const options = {phase: 'prestart', mode: 'enforce', ownedPorts: []};
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (value === undefined) return usage(`missing value for ${flag}`);
    if (flag === '--properties') options.properties = value;
    else if (flag === '--phase' && ['prestart', 'client'].includes(value)) options.phase = value;
    else if (flag === '--listeners') options.listeners = value;
    else if (flag === '--environment') options.environment = value;
    else if (flag === '--owned-port' && /^\d+$/.test(value)) options.ownedPorts.push(Number(value));
    else if (flag === '--exceptions') options.exceptions = value;
    else if (flag === '--mode' && ['enforce', 'warn'].includes(value)) options.mode = value;
    else if (flag === '--out') options.out = value;
    else if (flag === '--now' && !Number.isNaN(Date.parse(value))) options.now = Date.parse(value);
    else return usage(`invalid argument: ${flag} ${value}`);
  }
  if (!options.properties) return usage('--properties is required');
  try {
    const properties = readJson(options.properties, 'properties');
    let snapshot;
    const snapshotPath = options.listeners || process.env.VULPORA_LISTENER_SNAPSHOT;
    if (snapshotPath) snapshot = readJson(snapshotPath, 'listener snapshot');
    else {
      const live = liveSnapshot();
      if (!live.ok) { process.stderr.write(`no listener evidence (${live.reason}); refusing to guess what is shared\n`); return 2; }
      snapshot = live.snapshot;
    }
    if (!Array.isArray(snapshot.listeners)) throw new Error('listener snapshot has no listeners array');
    const ownedPorts = [...options.ownedPorts];
    if (options.environment) {
      const environment = readJson(options.environment, 'environment');
      for (const endpoint of Array.isArray(environment.endpoints) ? environment.endpoints : []) if (validPort(endpoint.port)) ownedPorts.push(endpoint.port);
    }
    const exceptionDocument = options.exceptions && fs.existsSync(options.exceptions) ? readJson(options.exceptions, 'exceptions file') : null;
    const {accepted, rejected} = validateExceptions(exceptionDocument, options.now ?? Date.now());
    const findings = scanProperties({properties, listeners: snapshot.listeners, ownedPorts, exceptions: accepted, rejectedExceptions: rejected,
      phase: options.phase, mode: options.mode});
    findings.listenerSnapshotAt = snapshot.takenAt ?? null;
    if (options.now !== undefined) findings.nowOverride = new Date(options.now).toISOString(); // a clock override is part of the record
    const text = `${JSON.stringify(findings, null, 2)}\n`;
    if (options.out) fs.writeFileSync(options.out, text); else process.stdout.write(text);
    if (findings.refused) { process.stderr.write(`${refusalMessage(findings)}\n`); return 3; }
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 64;
  }
}

module.exports = {SCHEMA, EXCEPTIONS_SCHEMA, flatten, extractCandidates, isLocalHost, validateExceptions, scanProperties, refusalMessage};

if (require.main === module) process.exit(main(process.argv.slice(2)));
