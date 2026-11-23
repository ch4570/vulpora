#!/usr/bin/env node
'use strict';

// Post-run isolation check (RUN-7.1a, RUN-7.1d). Turns the wrapper's receipt, the run's environment.json, and
// Docker's own state into the `isolation` verdict input. Nothing here is written by the model, and nothing here
// connects to a shared service: the only external calls are read-only `docker inspect` of containers the run
// itself declared as its own.
//
//   check-isolation.js --receipt <isolation-receipt.json> --out <isolation.json>
//                      [--environment <environment.json>] [--baseline <audit-orphans-snapshot.json>] [--label <k=v>]...
//                      [--docker-inspect <file>] [--prestart <findings.json>]... [--shared-port <n>]... [--allow-remote <ip|cidr>]...
//
// --baseline        audit-orphans.js snapshot taken before the run; a container in it was not created by this run.
// --docker-inspect  {"containers": {"<id>": {"labels": {...}, "ports": [<host port>...]}}} instead of calling docker (tests).
// --prestart        findings from check-prestart.js (phase prestart and/or client).
// --allow-remote    a person-approved non-loopback address or IPv4 CIDR; the allowance is recorded in the output.
//
// A connection counts against the run only when the evidence says so. Order for a connection to this machine:
// the test tree's own listener, a run-owned container port, the Testcontainers reaper, an owner-listed shared port,
// a port that was already listening before the run (shared, or a local tool), otherwise unattributed. A connection
// to any address that is not this machine is shared unless a person allowed it.
//
// Exit 0 when isolation.json was written (the verdict is the evaluator's job), 64 on unusable input.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {isLocalHost} = require('./check-prestart');
const {RECEIPT_SCHEMA} = require('./observe-connections');

const SCHEMA = 'vulpora.isolation/v1';
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function ipv4ToInt(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  return match ? (((Number(match[1]) * 256 + Number(match[2])) * 256 + Number(match[3])) * 256 + Number(match[4])) >>> 0 : null;
}

function allowedRemote(address, allowList) {
  const value = ipv4ToInt(address);
  return allowList.some((entry) => {
    if (entry === address) return true;
    const [base, bits] = entry.split('/');
    const baseInt = ipv4ToInt(base);
    if (bits === undefined || baseInt === null || value === null || !/^\d+$/.test(bits) || Number(bits) > 32) return false;
    const mask = Number(bits) === 0 ? 0 : (0xffffffff << (32 - Number(bits))) >>> 0;
    return ((value & mask) >>> 0) === ((baseInt & mask) >>> 0);
  });
}

const idMatches = (left, right) => left.length >= 12 && right.length >= 12 && (left.startsWith(right) || right.startsWith(left));

function dockerInfoFor(ids, fixture) {
  const info = new Map();
  if (fixture) {
    for (const [id, value] of Object.entries(fixture.containers || {})) info.set(id, {labels: value.labels || {}, ports: (value.ports || []).map(Number)});
    return {info};
  }
  if (ids.length === 0) return {info};
  const result = spawnSync('docker', ['inspect', '--format', '{{json .}}', ...ids], {encoding: 'utf8', timeout: 20000, maxBuffer: 16 * 1024 * 1024});
  if (result.error || result.status !== 0) return {info, error: (result.stderr || result.error?.message || 'docker inspect failed').trim()};
  for (const line of result.stdout.split('\n').filter(Boolean)) {
    try {
      const container = JSON.parse(line);
      const ports = Object.values(container.NetworkSettings?.Ports || {}).flatMap((bindings) => (bindings || []).map((binding) => Number(binding.HostPort)));
      info.set(container.Id, {labels: container.Config?.Labels || {}, ports});
    } catch { /* an unparsable line proves nothing; the endpoint stays unverified */ }
  }
  return {info};
}

// RUN-7.1a: an endpoint is run-owned only when Docker says so, not because the harness wrote it down.
function verifyOwnership({environment, baselineIds, labels, dockerFixture}) {
  const verified = [];
  const violations = [];
  const warnings = [];
  const endpoints = environment && environment.schemaVersion === 2 && Array.isArray(environment.endpoints) ? environment.endpoints : null;
  if (!endpoints) {
    warnings.push({code: 'ENVIRONMENT_ENDPOINTS_MISSING', detail: 'environment.json is absent or not schemaVersion 2; endpoint ownership could not be checked'});
    return {verified, violations, warnings, declared: 0};
  }
  const {info, error} = dockerInfoFor(endpoints.map((endpoint) => endpoint.containerId).filter((id) => typeof id === 'string' && id.length > 0), dockerFixture);
  if (error) warnings.push({code: 'DOCKER_INSPECT_FAILED', detail: error});
  for (const endpoint of endpoints) {
    const base = {kind: endpoint.kind, port: endpoint.port, containerId: endpoint.containerId};
    const fail = (reason) => violations.push({...base, reason});
    if (typeof endpoint.host !== 'string' || !isLocalHost(endpoint.host) || /host\.(docker|containers)\.internal/i.test(endpoint.host)) { fail('host is not a loopback address'); continue; }
    if (typeof endpoint.containerId !== 'string' || endpoint.containerId.length === 0) { fail('no containerId'); continue; }
    const id = [...info.keys()].find((candidate) => idMatches(candidate, endpoint.containerId));
    if (!id) { fail(error ? 'container could not be inspected' : 'container not found'); continue; }
    if (baselineIds && baselineIds.some((existing) => idMatches(existing, id))) { fail('container existed before the run'); continue; }
    const container = info.get(id);
    const missing = labels.filter((label) => { const [key, value] = label.split('='); return container.labels[key] !== value; });
    if (missing.length > 0) { fail(`container lacks run label ${missing.join(', ')}`); continue; }
    if (!container.ports.includes(endpoint.port)) { fail('port is not published by that container'); continue; }
    verified.push(base);
  }
  if (!baselineIds) warnings.push({code: 'BASELINE_MISSING', detail: 'no container baseline; "created by this run" was not checked'});
  if (labels.length === 0) warnings.push({code: 'RUN_LABEL_MISSING', detail: 'no run label given; container ownership by label was not checked'});
  return {verified, violations, warnings, declared: endpoints.length};
}

function classifyConnections({receipt, snapshot, ownedPorts, sharedPorts, allowRemote}) {
  const treeListen = new Set(receipt.treeListenPorts || []);
  const runOwned = new Map(ownedPorts.map((entry) => [entry.port, entry]));
  const infra = new Set((receipt.ownedPorts || []).filter((entry) => entry.kind === 'infrastructure').map((entry) => entry.port));
  const listening = new Map();
  for (const listener of snapshot ? snapshot.listeners : []) if (!listening.has(listener.port)) listening.set(listener.port, listener);
  const out = {shared: [], owned: [], local: [], unattributed: [], allowedRemote: [], infrastructure: []};
  for (const connection of receipt.connections || []) {
    const base = {remoteAddress: connection.remoteAddress, remotePort: connection.remotePort, process: {pid: connection.pid, command: connection.command},
      firstSeen: connection.firstSeen, lastSeen: connection.lastSeen, samples: connection.samples, source: 'socket-poll'};
    if (!isLocalHost(connection.remoteAddress)) {
      if (allowedRemote(connection.remoteAddress, allowRemote)) out.allowedRemote.push(base);
      else out.shared.push({...base, category: 'remote-address'});
      continue;
    }
    const port = connection.remotePort;
    if (treeListen.has(port)) continue;
    if (runOwned.has(port)) { out.owned.push({...base, containerId: runOwned.get(port).containerId}); continue; }
    if (infra.has(port)) { out.infrastructure.push(base); continue; }
    if (sharedPorts.has(port)) { out.shared.push({...base, category: 'owner-listed'}); continue; }
    const listener = listening.get(port);
    if (listener) {
      const entry = {...base, listener: {command: listener.command, pid: listener.pid, category: listener.category}};
      if (listener.category === 'local-tool') out.local.push(entry); else out.shared.push({...entry, category: listener.category});
      continue;
    }
    out.unattributed.push(base);
  }
  return out;
}

function usage(message) {
  process.stderr.write(`${message}\nusage: check-isolation.js --receipt <isolation-receipt.json> --out <isolation.json> [--environment <environment.json>] [--baseline <snapshot.json>] [--label <k=v>]... [--docker-inspect <file>] [--prestart <findings.json>]... [--shared-port <n>]... [--allow-remote <ip|cidr>]...\n`);
  return 64;
}

function main(argv) {
  const options = {labels: [], prestart: [], sharedPorts: [], allowRemote: []};
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (value === undefined) return usage(`missing value for ${flag}`);
    if (flag === '--receipt') options.receipt = value;
    else if (flag === '--out') options.out = value;
    else if (flag === '--environment') options.environment = value;
    else if (flag === '--baseline') options.baseline = value;
    else if (flag === '--label' && /^[A-Za-z0-9_.-]+=[^\s]+$/.test(value)) options.labels.push(value);
    else if (flag === '--docker-inspect') options.dockerInspect = value;
    else if (flag === '--prestart') options.prestart.push(value);
    else if (flag === '--shared-port' && /^\d{1,5}$/.test(value)) options.sharedPorts.push(Number(value));
    else if (flag === '--allow-remote' && /^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(value)) options.allowRemote.push(value);
    else return usage(`invalid argument: ${flag} ${value}`);
  }
  if (!options.receipt || !options.out) return usage('--receipt and --out are required');
  const readJson = (file, what) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { throw new Error(`unreadable ${what}: ${error.message}`); } };
  try {
    const receiptText = fs.readFileSync(options.receipt, 'utf8');
    const receipt = JSON.parse(receiptText);
    if (receipt.schema !== RECEIPT_SCHEMA) throw new Error(`receipt schema must be ${RECEIPT_SCHEMA}`);
    const unverified = [];
    const warnings = [];
    const warn = (code, detail, extra = {}) => { warnings.push({code, ...(detail ? {detail} : {}), ...extra}); unverified.push(detail ? `${code}: ${detail}` : code); };

    if (sha256(JSON.stringify(receipt.policy)) !== receipt.policySha256) warn('ISOLATION_POLICY_HASH_MISMATCH', 'the receipt policy does not match its recorded hash');
    let snapshot = null;
    const snapshotPath = path.resolve(path.dirname(options.receipt), receipt.listenerSnapshot?.path || '');
    if (receipt.listenerSnapshot?.path && fs.existsSync(snapshotPath)) {
      const text = fs.readFileSync(snapshotPath, 'utf8');
      if (sha256(text) !== receipt.listenerSnapshot.sha256) warn('LISTENER_SNAPSHOT_HASH_MISMATCH', 'the pre-run listener snapshot changed after the receipt was written');
      else snapshot = JSON.parse(text);
    } else warn('LISTENER_SNAPSHOT_MISSING', 'the pre-run listener snapshot is missing');
    if (snapshot && snapshot.visibility !== 'current-user') warn('LISTENER_SNAPSHOT_UNAVAILABLE', 'listener snapshot was not taken with a working lsof');

    const environment = options.environment ? readJson(options.environment, 'environment') : null;
    const baseline = options.baseline ? readJson(options.baseline, 'baseline snapshot') : null;
    const ownership = verifyOwnership({environment, baselineIds: baseline && Array.isArray(baseline.ids) ? baseline.ids : null, labels: options.labels,
      dockerFixture: options.dockerInspect ? readJson(options.dockerInspect, 'docker inspect fixture') : null});
    for (const warning of ownership.warnings) warn(warning.code, warning.detail);
    for (const violation of ownership.violations) warn('ENDPOINT_NOT_RUN_OWNED', violation.reason, {kind: violation.kind, port: violation.port, containerId: violation.containerId});

    const sharedPorts = new Set([...(receipt.policy?.sharedPorts || []), ...options.sharedPorts]);
    const ownedPorts = [...(receipt.ownedPorts || []).filter((entry) => entry.kind === 'run-owned'),
      ...ownership.verified.map((entry) => ({port: entry.port, containerId: entry.containerId}))];
    const classified = classifyConnections({receipt, snapshot, ownedPorts, sharedPorts, allowRemote: options.allowRemote});

    const observerGaps = receipt.observerGaps || [];
    for (const gap of observerGaps) warn('OBSERVER_GAP', gap.reason || gap.kind, {kind: gap.kind});
    for (const entry of classified.local) warnings.push({code: 'LOCAL_TOOL_CONTACT', port: entry.remotePort, process: entry.process, listener: entry.listener});
    for (const entry of classified.unattributed) warn('UNATTRIBUTED_CONTACT', `${entry.remoteAddress}:${entry.remotePort} was neither pre-existing, run-owned, nor the test tree's own`, {port: entry.remotePort});
    for (const entry of classified.allowedRemote) warn('REMOTE_CONTACT_ALLOWED', `${entry.remoteAddress}:${entry.remotePort} allowed by a person`, {port: entry.remotePort});
    if (ownership.declared > 0 && classified.owned.length === 0) warn('OWNED_ENDPOINT_UNUSED', 'no connection to a declared run-owned endpoint was observed; the application may have connected elsewhere, or only briefly');
    if (ownership.declared === 0) warn('NO_OWNED_ENDPOINT_DECLARED', 'no run-owned endpoint was declared, so no positive evidence exists');

    const prestartRefusals = [];
    const exceptionsApplied = [];
    for (const file of options.prestart) {
      const findings = readJson(file, 'prestart findings');
      if (findings.schema !== 'vulpora.prestart-findings/v1') throw new Error(`${file}: not a prestart findings file`);
      if (findings.refused) for (const violation of findings.violations) prestartRefusals.push({code: violation.code, key: violation.key, host: violation.host, port: violation.port});
      if (findings.refusalSuppressed) warn('PRESTART_REFUSAL_SUPPRESSED', `the ${findings.phase} scan ran in warn mode; start would have been refused`);
      for (const entry of findings.exceptionsApplied || []) { exceptionsApplied.push({...entry, phase: findings.phase}); warn('PRESTART_EXCEPTION_APPLIED', `${entry.id} (owner ${entry.owner}, expires ${entry.expires}) allowed ${entry.host}:${entry.port}`, {id: entry.id}); }
      for (const warning of findings.warnings || []) if (warning.code !== 'PRESTART_REFUSAL_SUPPRESSED') warnings.push({...warning, phase: findings.phase});
    }
    if (options.prestart.length === 0) warn('PRESTART_SCAN_MISSING', 'no pre-start scan findings were provided');

    if (receipt.observation && receipt.observation.samples === 0) warn('NO_SAMPLES', 'the observed tree was never sampled');
    const verified = unverified.length === 0 && classified.shared.length === 0 && prestartRefusals.length === 0;
    const isolation = {
      schema: SCHEMA, mode: receipt.mode, verified,
      unverifiedReasons: unverified,
      receipt: {path: path.relative(path.dirname(path.resolve(options.out)), path.resolve(options.receipt)), sha256: sha256(receiptText)},
      observation: receipt.observation,
      sharedContacts: classified.shared,
      ownedContacts: classified.owned,
      infrastructureContacts: classified.infrastructure,
      localToolContacts: classified.local,
      unattributedContacts: classified.unattributed,
      allowedRemoteContacts: classified.allowedRemote,
      ownershipViolations: ownership.violations,
      verifiedOwnedEndpoints: ownership.verified,
      observerGaps,
      prestartRefusals,
      exceptionsApplied,
      warnings,
      scope: `Observed by polling ${receipt.observation?.pollIntervalMs ?? '?'} ms apart (longest gap ${receipt.observation?.maxGapMs ?? '?'} ms); a connection shorter than the interval can be missed. "No shared contact" means none within what was observed.`,
    };
    fs.writeFileSync(options.out, `${JSON.stringify(isolation, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({isolation: options.out, verified, sharedContacts: classified.shared.length, prestartRefusals: prestartRefusals.length, warnings: warnings.length})}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 64;
  }
}

module.exports = {SCHEMA, allowedRemote, verifyOwnership, classifyConnections, idMatches};

if (require.main === module) process.exit(main(process.argv.slice(2)));
