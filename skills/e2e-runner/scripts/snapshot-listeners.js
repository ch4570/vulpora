#!/usr/bin/env node
'use strict';

// Read-only snapshot of the TCP ports this machine is listening on (RUN-7.1d).
//
// Everything that already listens before a run starts is somebody else's: the shared local
// database, cache, object store, a Docker backend, an IDE. The snapshot is taken by the
// observation wrapper before the test command starts and is the reference that later
// observations and the pre-start scan compare against.
//
//   snapshot-listeners.js [--out <file>] [--lsof-input <file>] [--ps-input <file>]
//
// `--lsof-input` / `--ps-input` replace the live `lsof` / `ps` calls with recorded text so the
// parsing and classification are testable without opening any socket.
//
// The snapshot never stores process arguments, only the category they led to: command lines
// can carry passwords. `lsof` shows only processes of the current user, so a listener owned by
// another user can be missing; the snapshot records that as `visibility`.

const fs = require('node:fs');
const {spawnSync} = require('node:child_process');

const SCHEMA = 'vulpora.listener-snapshot/v1';

// `lsof -F` emits one field per line: p<pid> c<command> f<fd> P<proto> n<name> TST=<state>. Callers ask for `f` explicitly
// (`-F pcfPnT`): macOS always prints it, Linux does not, and it delimits one socket from the next.
function parseLsofFields(text) {
  const sockets = [];
  let process = null;
  let socket = null;
  const flush = () => { if (socket && process) sockets.push({...socket, pid: process.pid, command: process.command}); socket = null; };
  for (const line of String(text).split('\n')) {
    if (line.length === 0) continue;
    const tag = line[0];
    const value = line.slice(1);
    if (tag === 'p') { flush(); process = {pid: Number(value), command: ''}; }
    else if (tag === 'c' && process) process.command = value;
    else if (tag === 'f') { flush(); socket = {protocol: null, name: null, state: null}; }
    else if (tag === 'P') {
      // Linux lsof omits the `f` field unless it is requested, so a protocol field also opens a new record.
      if (!socket || socket.protocol !== null) { flush(); socket = {protocol: null, name: null, state: null}; }
      socket.protocol = value;
    }
    else if (tag === 'n' && socket) socket.name = value;
    else if (tag === 'T' && socket && value.startsWith('ST=')) socket.state = value.slice(3);
  }
  flush();
  return sockets;
}

// `127.0.0.1:5432`, `*:8080`, `[::1]:6379`, `[fe80::1%lo0]:80`.
function splitHostPort(text) {
  const match = /^(\[[^\]]+\]|[^:]+|\*):(\d+|\*)$/.exec(text.trim());
  if (!match) return null;
  const host = match[1].replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  return {host, port: match[2] === '*' ? null : Number(match[2])};
}

// `local->remote` for connections; a single endpoint for listeners.
function parseSocketName(name) {
  if (typeof name !== 'string') return null;
  const [left, right] = name.split('->');
  const local = splitHostPort(left);
  if (!local) return null;
  return {local, remote: right === undefined ? null : splitHostPort(right)};
}

const SHARED_COMMANDS = /^(com\.docker|docker|vpnkit|orbstack|colima|limactl|qemu|rancher|rdctl|podman|gvproxy|postgres|redis|mysqld|mongod|memcached|localstack|minio|kafka|opensearch|elasticsearch|rabbit|beam\.smp|clickhouse|nats|etcd|consul|vault|ssh|kubectl)/i;
const LOCAL_TOOL_COMMANDS = /^(idea|webstorm|pycharm|goland|rider|clion|phpstorm|datagrip|studio|cursor|electron|rapportd|controlce|controlcenter|sharingd|airplay|identityse|mdnsresponder|trustd|nsurlsess)/i;
const EDITOR_COMMAND = /^code( helper.*)?$/i; // `code-server` is a network service, not the editor
// Build-tool and IDE daemons are recognised by name first; a debug agent or language server is only a weak hint, so a data service wins over it.
const STRONG_LOCAL_ARGS = /GradleDaemon|org\.gradle\.launcher\.daemon|KotlinCompileDaemon|JetBrains|\bmvnd\b/i;
const WEAK_LOCAL_ARGS = /jdwp|language-server|jdtls/i;
const SHARED_ARGS = /kafka|opensearch|elasticsearch|zookeeper|cassandra/i;

// Process names are a heuristic. A wrong "local-tool" entry hides a contact as a warning; a missing one
// turns a harmless contact into a breach. Both are expected to be tuned during the observation period.
function classifyListener({command = '', args = ''}) {
  if (/^(java|javaw)$/i.test(command)) {
    if (STRONG_LOCAL_ARGS.test(args)) return {category: 'local-tool', rule: 'java-build-or-ide-process'};
    if (SHARED_ARGS.test(args)) return {category: 'shared-resource', rule: 'java-data-service'};
    if (WEAK_LOCAL_ARGS.test(args)) return {category: 'local-tool', rule: 'java-debug-or-language-server'};
    return {category: 'unknown', rule: 'java-unclassified'};
  }
  if (LOCAL_TOOL_COMMANDS.test(command) || EDITOR_COMMAND.test(command)) return {category: 'local-tool', rule: 'known-local-tool'};
  if (SHARED_COMMANDS.test(command)) return {category: 'shared-resource', rule: 'known-shared-resource'};
  return {category: 'unknown', rule: 'unclassified'};
}

function parsePsCommands(text) {
  const byPid = new Map();
  for (const line of String(text).split('\n')) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (match) byPid.set(Number(match[1]), match[2]);
  }
  return byPid;
}

function buildSnapshot({lsofText, psText = '', takenAt = new Date().toISOString(), toolVersion = null}) {
  const argsByPid = parsePsCommands(psText);
  const seen = new Set();
  const listeners = [];
  for (const socket of parseLsofFields(lsofText)) {
    if (socket.protocol !== 'TCP' || socket.state !== 'LISTEN') continue;
    const parsed = parseSocketName(socket.name);
    if (!parsed || parsed.local.port === null) continue;
    const key = `${socket.pid}|${parsed.local.host}|${parsed.local.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const {category, rule} = classifyListener({command: socket.command, args: argsByPid.get(socket.pid) || ''});
    listeners.push({port: parsed.local.port, address: parsed.local.host, command: socket.command, pid: socket.pid, category, rule});
  }
  listeners.sort((a, b) => a.port - b.port || a.pid - b.pid || (a.address < b.address ? -1 : 1));
  return {schema: SCHEMA, takenAt, source: 'lsof', toolVersion, visibility: 'current-user', listeners};
}

function run(command, args) {
  return spawnSync(command, args, {encoding: 'utf8', timeout: 15000, maxBuffer: 32 * 1024 * 1024});
}

function lsofVersion() {
  const result = run('lsof', ['-v']);
  if (result.error) return null;
  const match = /revision:\s*(\S+)/.exec(`${result.stdout}${result.stderr}`);
  return match ? `lsof ${match[1]}` : 'lsof';
}

// Live snapshot. Returns {ok:false, reason} instead of throwing when lsof is unusable; callers must
// treat that as "no evidence", never as "no listeners".
function liveSnapshot() {
  const listed = run('lsof', ['+c', '0', '-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcfPnT']);
  if (listed.error) return {ok: false, reason: `lsof unavailable: ${listed.error.code || listed.error.message}`};
  // lsof exits 1 when it lists nothing; any output at all or a clean empty run is a valid snapshot.
  if (listed.status !== 0 && listed.status !== 1) return {ok: false, reason: `lsof exited ${listed.status}: ${(listed.stderr || '').trim().slice(0, 200)}`};
  const pids = [...new Set(parseLsofFields(listed.stdout).filter((socket) => socket.state === 'LISTEN').map((socket) => socket.pid))];
  let psText = '';
  if (pids.length > 0) {
    const ps = run('ps', ['-ww', '-o', 'pid=,command=', '-p', pids.join(',')]);
    if (!ps.error) psText = ps.stdout;
  }
  return {ok: true, snapshot: buildSnapshot({lsofText: listed.stdout, psText, toolVersion: lsofVersion()})};
}

function main(argv) {
  let out = null;
  let lsofInput = null;
  let psInput = null;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--out' && argv[index + 1]) out = argv[++index];
    else if (flag === '--lsof-input' && argv[index + 1]) lsofInput = argv[++index];
    else if (flag === '--ps-input' && argv[index + 1]) psInput = argv[++index];
    else { process.stderr.write(`usage: snapshot-listeners.js [--out <file>] [--lsof-input <file>] [--ps-input <file>]\n`); return 64; }
  }
  let snapshot;
  if (lsofInput) {
    snapshot = buildSnapshot({lsofText: fs.readFileSync(lsofInput, 'utf8'), psText: psInput ? fs.readFileSync(psInput, 'utf8') : '', toolVersion: 'recorded-input'});
  } else {
    const live = liveSnapshot();
    if (!live.ok) { process.stderr.write(`${live.reason}\n`); return 2; }
    snapshot = live.snapshot;
  }
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (out) fs.writeFileSync(out, text); else process.stdout.write(text);
  return 0;
}

module.exports = {SCHEMA, parseLsofFields, parseSocketName, splitHostPort, classifyListener, parsePsCommands, buildSnapshot, liveSnapshot, lsofVersion};

if (require.main === module) process.exit(main(process.argv.slice(2)));
