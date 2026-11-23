#!/usr/bin/env node
'use strict';

// Observation wrapper (RUN-7.1d). Runs the test command as a child with an allow-listed environment and, from
// outside the application, records which TCP connections its process tree opens. It writes
// `isolation-receipt.json`; the model does not write that file and check-isolation.js reads it.
//
//   observe-connections.js --out <dir> [--run-label <k=v>]... [--shared-port <n>]... [--interval-ms <ms>]
//                          [--pass-env <NAME>]... [--expect-process <regex>] [--run-id <id>] [--allow-unobserved]
//                          -- <command> [args...]
//
// Observation only. Nothing is blocked. Sockets are polled (default 1 s), so a connection that opens and closes
// between two polls is missed; the receipt records the interval and the longest gap so a report can say
// "no contact within what was observed", never "no contact". Blocking is a later stage.
//
// Environment (B1): only an allow list reaches the child, so shell-profile and IDE values such as SPRING_*, AWS_*,
// *_PROXY, or database URLs cannot silently redirect the application. Pass extra names with --pass-env; every
// passed name is recorded in the receipt (values never are).
// The child also receives VULPORA_LISTENER_SNAPSHOT (the pre-run listener snapshot) and VULPORA_ISOLATION_DIR.
//
// Exit: the child's exit code; 64 usage; 71 lsof unusable and --allow-unobserved not given (the command is not run).

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {liveSnapshot, lsofVersion, parseLsofFields, parseSocketName} = require('./snapshot-listeners');

const RECEIPT_SCHEMA = 'vulpora.isolation-receipt/v1';
const ENV_ALLOW = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TERM', 'LANG', 'TMPDIR', 'TZ', 'JAVA_HOME', 'GRADLE_USER_HOME', 'MAVEN_OPTS_FILE',
  'NODE_PATH', 'DOCKER_HOST', 'DOCKER_CONFIG', 'DOCKER_CONTEXT', 'DOCKER_CERT_PATH', 'DOCKER_TLS_VERIFY', 'XDG_RUNTIME_DIR', 'CI'];
const ENV_ALLOW_PREFIXES = ['LC_', 'TESTCONTAINERS_', 'VULPORA_'];

function buildEnv(source, passEnv = [], extra = {}) {
  const env = {};
  const passed = [];
  const dropped = [];
  for (const [name, value] of Object.entries(source)) {
    const listed = ENV_ALLOW.includes(name) || ENV_ALLOW_PREFIXES.some((prefix) => name.startsWith(prefix)) || passEnv.includes(name);
    if (listed) { env[name] = value; passed.push(name); } else dropped.push(name);
  }
  Object.assign(env, extra);
  return {env, passed: passed.sort(), dropped: dropped.sort()};
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const nowIso = () => new Date().toISOString();

function descendants(rootPid, psText) {
  const children = new Map();
  const comm = new Map();
  for (const line of psText.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const [pid, ppid] = [Number(match[1]), Number(match[2])];
    comm.set(pid, path.basename(match[3].trim().split(/\s+/)[0] || ''));
    children.set(ppid, [...(children.get(ppid) || []), pid]);
  }
  const tree = [];
  const queue = [rootPid];
  while (queue.length > 0) {
    const pid = queue.shift();
    if (!comm.has(pid)) continue;
    tree.push({pid, command: comm.get(pid)});
    queue.push(...(children.get(pid) || []));
  }
  return tree;
}

// `docker ps` columns: id, image, ports, labels. Run-owned = carries every run label; infrastructure = the Testcontainers reaper.
function parseDockerPs(text, runLabels) {
  const owned = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const [id, image = '', ports = '', labels = ''] = line.split('\t');
    const labelSet = new Set(labels.split(',').map((label) => label.trim()).filter(Boolean));
    const kind = /(^|\/)ryuk(:|$)/i.test(image) ? 'infrastructure' : runLabels.length > 0 && runLabels.every((label) => labelSet.has(label)) ? 'run-owned' : null;
    if (!kind) continue;
    for (const match of ports.matchAll(/(?:\d+\.\d+\.\d+\.\d+|\[?::\]?|\*):(\d+)->/g)) owned.push({port: Number(match[1]), containerId: id, image, kind});
  }
  return owned;
}

function usage(message) {
  process.stderr.write(`${message}\nusage: observe-connections.js --out <dir> [--run-label <k=v>]... [--shared-port <n>]... [--interval-ms <ms>] [--pass-env <NAME>]... [--expect-process <regex>] [--run-id <id>] [--allow-unobserved] -- <command> [args...]\n`);
  return 64;
}

function parseArgs(argv) {
  const split = argv.indexOf('--');
  if (split < 0 || split === argv.length - 1) return {error: 'a command after -- is required'};
  const head = argv.slice(0, split);
  const options = {command: argv.slice(split + 1), runLabels: [], sharedPorts: [], passEnv: [], intervalMs: 1000, allowUnobserved: false, expect: null, runId: null, out: null};
  for (let index = 0; index < head.length; index += 1) {
    const flag = head[index];
    if (flag === '--allow-unobserved') { options.allowUnobserved = true; continue; }
    const value = head[++index];
    if (value === undefined) return {error: `missing value for ${flag}`};
    if (flag === '--out') options.out = value;
    else if (flag === '--run-label' && /^[A-Za-z0-9_.-]+=[^\s]+$/.test(value)) options.runLabels.push(value);
    else if (flag === '--shared-port' && /^\d{1,5}$/.test(value) && Number(value) > 0 && Number(value) < 65536) options.sharedPorts.push(Number(value));
    else if (flag === '--interval-ms' && /^[1-9]\d*$/.test(value) && Number(value) >= 100) options.intervalMs = Number(value);
    else if (flag === '--pass-env' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) options.passEnv.push(value);
    else if (flag === '--expect-process') { try { options.expect = new RegExp(value); } catch { return {error: `invalid --expect-process regex: ${value}`}; } }
    else if (flag === '--run-id' && /^[A-Za-z0-9._-]+$/.test(value)) options.runId = value;
    else return {error: `invalid argument: ${flag} ${value}`};
  }
  if (!options.out) return {error: '--out is required'};
  return {options};
}

function defaultExpectation(command) {
  const name = path.basename(command[0] || '');
  if (/^(gradle|gradlew|mvn|mvnw|java)(\.bat)?$/.test(name)) return /^java(w)?$/;
  return null;
}

function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.error) return Promise.resolve(usage(parsed.error));
  const options = parsed.options;
  fs.mkdirSync(options.out, {recursive: true});

  const live = liveSnapshot();
  const gaps = [];
  if (!live.ok) {
    if (!options.allowUnobserved) {
      process.stderr.write(`ISOLATION_GUARD_UNAVAILABLE: ${live.reason}. The command was not run. Install lsof, or pass --allow-unobserved to run it with isolation left unverified.\n`);
      return Promise.resolve(71);
    }
    gaps.push({kind: 'TOOL_UNAVAILABLE', reason: live.reason});
  }
  const snapshot = live.ok ? live.snapshot : {schema: 'vulpora.listener-snapshot/v1', takenAt: nowIso(), source: 'lsof', toolVersion: null, visibility: 'unavailable', listeners: []};
  const snapshotPath = path.join(options.out, 'listeners-before.json');
  const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
  fs.writeFileSync(snapshotPath, snapshotText);

  const {env, passed, dropped} = buildEnv(process.env, options.passEnv, {
    VULPORA_LISTENER_SNAPSHOT: path.resolve(snapshotPath), VULPORA_ISOLATION_DIR: path.resolve(options.out), ...(options.runId ? {VULPORA_RUN_ID: options.runId} : {}),
  });
  const commandName = path.basename(options.command[0]);
  const expect = options.expect || defaultExpectation(options.command);
  if (/^gradlew?(\.bat)?$/.test(commandName) && !options.command.includes('--no-daemon')) {
    gaps.push({kind: 'BUILD_DAEMON_NOT_DISABLED', reason: 'a reused Gradle daemon starts the test JVM outside the observed process tree; run with --no-daemon'});
  }

  const startedAt = nowIso();
  const started = Date.now();
  const connections = new Map();
  const treeListenPorts = new Set();
  const owned = new Map();
  let samples = 0;
  let lastSampleAt = null;
  let maxGapMs = 0;
  let toolErrors = 0;
  let expectedSeen = expect === null;
  let rootPid = null;

  function sample() {
    const at = Date.now();
    if (lastSampleAt !== null) {
      const gap = at - lastSampleAt;
      if (gap > maxGapMs) maxGapMs = gap;
      if (gap > options.intervalMs * 3) gaps.push({kind: 'POLL_GAP', gapMs: gap, at: new Date(at).toISOString()});
    }
    lastSampleAt = at;
    const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,comm='], {encoding: 'utf8', timeout: 10000});
    if (ps.error || ps.status !== 0) { toolErrors += 1; return; }
    const tree = descendants(rootPid, ps.stdout);
    if (tree.length === 0) return;
    samples += 1;
    if (expect && tree.some((entry) => expect.test(entry.command))) expectedSeen = true;
    const byPid = new Map(tree.map((entry) => [entry.pid, entry.command]));
    const lsof = spawnSync('lsof', ['+c', '0', '-nP', '-a', '-iTCP', '-p', tree.map((entry) => entry.pid).join(','), '-F', 'pcPnT'],
      {encoding: 'utf8', timeout: 15000, maxBuffer: 32 * 1024 * 1024});
    if (lsof.error || (lsof.status !== 0 && lsof.status !== 1)) { toolErrors += 1; return; }
    const stamp = new Date(at).toISOString();
    for (const socket of parseLsofFields(lsof.stdout)) {
      if (socket.protocol !== 'TCP') continue;
      const name = parseSocketName(socket.name);
      if (!name) continue;
      if (socket.state === 'LISTEN' && name.local.port !== null) { treeListenPorts.add(name.local.port); continue; }
      if (!name.remote || name.remote.port === null) continue;
      const key = `${socket.pid}|${name.remote.host}|${name.remote.port}`;
      const entry = connections.get(key) || {pid: socket.pid, command: byPid.get(socket.pid) || socket.command, remoteAddress: name.remote.host, remotePort: name.remote.port,
        firstSeen: stamp, lastSeen: stamp, samples: 0, localPorts: new Set(), states: new Set()};
      entry.lastSeen = stamp;
      entry.samples += 1;
      entry.localPorts.add(name.local.port);
      if (socket.state) entry.states.add(socket.state);
      connections.set(key, entry);
    }
    if (options.runLabels.length > 0) {
      const docker = spawnSync('docker', ['ps', '--format', '{{.ID}}\t{{.Image}}\t{{.Ports}}\t{{.Labels}}'], {encoding: 'utf8', timeout: 10000});
      if (docker.error || docker.status !== 0) toolErrors += 1;
      else for (const port of parseDockerPs(docker.stdout, options.runLabels)) owned.set(`${port.containerId}|${port.port}`, port);
    }
  }

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(options.command[0], options.command.slice(1), {stdio: 'inherit', env});
    } catch (error) { process.stderr.write(`could not start command: ${error.message}\n`); resolve(127); return; }
    rootPid = child.pid;
    let finished = false;
    let timer = null;
    const loop = () => {
      if (finished) return;
      sample();
      timer = setTimeout(loop, options.intervalMs);
    };
    child.on('error', (error) => { process.stderr.write(`could not start command: ${error.message}\n`); finish(127, null); });
    child.on('exit', (code, signal) => finish(code, signal));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { try { child.kill(signal); } catch { /* already gone */ } });
    loop();

    function finish(code, signal) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (samples < 2) gaps.push({kind: 'TOO_FEW_SAMPLES', reason: `${samples} sample(s) in ${Date.now() - started} ms at ${options.intervalMs} ms intervals; a short command is mostly unobserved`});
      if (!expectedSeen) gaps.push({kind: 'EXPECTED_PROCESS_NOT_OBSERVED', reason: `no process matching ${expect} appeared in the observed tree (for example a reused build daemon started the test JVM)`});
      if (toolErrors > 0) gaps.push({kind: 'TOOL_ERROR', count: toolErrors, reason: 'lsof, ps, or docker failed during polling'});
      const policy = {mode: 'observe', pollIntervalMs: options.intervalMs, envPassed: passed, sharedPorts: [...options.sharedPorts].sort((a, b) => a - b), runLabels: [...options.runLabels].sort()};
      const receipt = {
        schema: RECEIPT_SCHEMA, mode: 'observe', startedAt, finishedAt: nowIso(), runId: options.runId,
        command: {name: commandName, argCount: options.command.length - 1},
        policy, policySha256: sha256(JSON.stringify(policy)),
        env: {passed, droppedNames: dropped},
        listenerSnapshot: {path: path.basename(snapshotPath), sha256: sha256(snapshotText), takenAt: snapshot.takenAt, count: snapshot.listeners.length, visibility: snapshot.visibility},
        observation: {pollIntervalMs: options.intervalMs, samples, maxGapMs, wallMs: Date.now() - started},
        observerGaps: gaps,
        treeListenPorts: [...treeListenPorts].sort((a, b) => a - b),
        ownedPorts: [...owned.values()].sort((a, b) => a.port - b.port),
        connections: [...connections.values()].map((entry) => ({...entry, localPorts: undefined, localPortCount: entry.localPorts.size, states: [...entry.states].sort()}))
          .sort((a, b) => (a.remoteAddress < b.remoteAddress ? -1 : a.remoteAddress > b.remoteAddress ? 1 : a.remotePort - b.remotePort)),
        tools: {lsof: live.ok ? snapshot.toolVersion : lsofVersion(), node: process.version, platform: process.platform},
        exit: {code, signal},
      };
      fs.writeFileSync(path.join(options.out, 'isolation-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
      resolve(typeof code === 'number' ? code : 128 + (signal === 'SIGINT' ? 2 : 15));
    }
  });
}

module.exports = {RECEIPT_SCHEMA, ENV_ALLOW, buildEnv, descendants, parseDockerPs, parseArgs, defaultExpectation};

if (require.main === module) main(process.argv.slice(2)).then((code) => process.exit(code));
