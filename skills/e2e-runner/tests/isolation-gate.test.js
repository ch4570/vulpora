'use strict';

// Isolation gate tests (RUN-7.1a-d). The only "shared resource" here is a decoy: a listener this test opens on
// 127.0.0.1:<ephemeral port> that records connections and does nothing else. No real database, cache, object
// store, or dev/stg host is contacted, and no test points at a well-known shared port.
//
// Layers: parsing and classification from recorded text, the pre-start scan on incident-shaped property maps,
// post-run checks on synthetic receipts, and a few real connections to the decoy through the wrapper.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');

const scripts = path.resolve(__dirname, '../scripts');
const script = (name) => path.join(scripts, name);
const node = (name, ...args) => spawnSync(process.execPath, [script(name), ...args], {encoding: 'utf8'});
const listeners = require(script('snapshot-listeners.js'));
const prestart = require(script('check-prestart.js'));
const observer = require(script('observe-connections.js'));
const checker = require(script('check-isolation.js'));

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-isolation-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
}
const write = (root, name, value) => {
  const file = path.join(root, name);
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  return file;
};

// The decoy: records who connected, answers nothing.
async function decoy(t) {
  const accepted = [];
  const server = net.createServer((socket) => { accepted.push({at: Date.now(), remotePort: socket.remotePort}); socket.on('data', () => {}); socket.on('error', () => {}); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return {port: server.address().port, accepted};
}

const snapshotOf = (...entries) => ({schema: 'vulpora.listener-snapshot/v1', takenAt: '2026-11-23T00:00:00Z', source: 'lsof', toolVersion: 'test', visibility: 'current-user',
  listeners: entries.map(([port, command, category, pid = 100]) => ({port, address: '127.0.0.1', command, pid, category, rule: 'test'}))});

test('lsof is available, because a silent skip would hide a missing guard', () => {
  const result = spawnSync('lsof', ['-v'], {encoding: 'utf8'});
  assert.ok(!result.error, `lsof is required for the socket observer and was not found (${result.error && result.error.code}). Install it; do not skip these tests.`);
});

// ---- parsing and classification -----------------------------------------------------------------------------------

test('lsof field output becomes a listener snapshot with categories and no command-line text', () => {
  const lsof = ['p10', 'credis-server', 'f6', 'PTCP', 'n127.0.0.1:7001', 'TST=LISTEN', 'f7', 'PTCP', 'n[::1]:7001', 'TST=LISTEN',
    'p11', 'cjava', 'f9', 'PTCP', 'n*:7002', 'TST=LISTEN', 'p12', 'cjava', 'f9', 'PTCP', 'n*:7003', 'TST=LISTEN',
    'p13', 'cnode', 'f3', 'PTCP', 'n127.0.0.1:50000->127.0.0.1:7001', 'TST=ESTABLISHED', ''].join('\n');
  const ps = ' 10 /usr/local/bin/redis-server *:7001 --requirepass hunter2\n 11 java -Dorg.gradle.appname=gradle org.gradle.launcher.daemon.bootstrap.GradleDaemon 8.5\n 12 java -jar app.jar\n';
  const snapshot = listeners.buildSnapshot({lsofText: lsof, psText: ps, takenAt: '2026-11-23T00:00:00Z'});
  assert.deepEqual(snapshot.listeners.map((item) => [item.port, item.command, item.category]), [
    [7001, 'redis-server', 'shared-resource'], [7001, 'redis-server', 'shared-resource'], [7002, 'java', 'local-tool'], [7003, 'java', 'unknown']]);
  assert.ok(!JSON.stringify(snapshot).includes('hunter2'), 'process arguments must never be stored');
  assert.equal(listeners.parseSocketName('127.0.0.1:50000->127.0.0.1:7001').remote.port, 7001);
  assert.deepEqual(listeners.parseSocketName('[::1]:80').local, {host: '::1', port: 80});
});

test('snapshot-listeners.js reads recorded lsof text and a live snapshot sees a real decoy listener', async (t) => {
  const root = workspace(t);
  const recorded = node('snapshot-listeners.js', '--lsof-input', write(root, 'lsof.txt', 'p1\ncpostgres\nf4\nPTCP\nn127.0.0.1:7005\nTST=LISTEN\n'));
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(JSON.parse(recorded.stdout).listeners[0].category, 'shared-resource');
  const bait = await decoy(t);
  const out = path.join(root, 'live.json');
  assert.equal(node('snapshot-listeners.js', '--out', out).status, 0);
  const live = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.ok(live.listeners.some((item) => item.port === bait.port && item.pid === process.pid), 'the decoy appears in the live snapshot');
  assert.equal(node('snapshot-listeners.js', '--bogus').status, 64);
});

// ---- pre-start scan (owner decision 3) ----------------------------------------------------------------------------

const SHARED = snapshotOf([7101, 'redis-server', 'shared-resource', 9], [7102, 'com.docker.backend', 'shared-resource', 8], [7103, 'postgres', 'shared-resource', 7]);

test('T1: default settings that point at an already-listening port are refused, with a message and a finding', (t) => {
  const root = workspace(t);
  const properties = write(root, 'props.json', {spring: {datasource: {url: 'jdbc:postgresql://user:secret-pw@localhost:7103/app'}, data: {redis: {host: 'localhost', port: 7101}}},
    cloud: {aws: {s3: {endpoint: 'http://localhost:7102'}}}, server: {port: 8080}});
  const out = path.join(root, 'findings.json');
  const result = node('check-prestart.js', '--properties', properties, '--listeners', write(root, 'listeners.json', SHARED), '--out', out);
  assert.equal(result.status, 3, result.stderr);
  const findings = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(findings.refused, true);
  assert.deepEqual(findings.violations.map((item) => `${item.code} ${item.port}`).sort(), [
    'PRESTART_ENDPOINT_NOT_OWNED 7101', 'PRESTART_ENDPOINT_NOT_OWNED 7102', 'PRESTART_ENDPOINT_NOT_OWNED 7103']);
  assert.match(result.stderr, /REFUSED \(PRESTART_ENDPOINT_NOT_OWNED\): spring\.data\.redis\.host -> localhost:7101/);
  assert.match(result.stderr, /person-written entry in isolation-exceptions\.json/);
  assert.ok(!fs.readFileSync(out, 'utf8').includes('secret-pw'), 'findings must not copy property values');
  assert.ok(!result.stderr.includes('secret-pw'));
  assert.equal(findings.violations.some((item) => item.port === 8080), false, 'the application\'s own server.port is not an outbound endpoint');
});

test('T2: a mistyped or prefixed key is still caught because the scan reads values, not key names', () => {
  const properties = {spring: {data: {redis: {host: 'localhost', port: 7101, harness: {host: '127.0.0.1', port: '55001'}}}}};
  const findings = prestart.scanProperties({properties, listeners: SHARED.listeners, ownedPorts: [55001]});
  assert.equal(findings.refused, true);
  assert.deepEqual(findings.violations.map((item) => item.key), ['spring.data.redis.host']);
  // a lone port key falls back to the default host, which is this machine
  assert.equal(prestart.scanProperties({properties: {'redis.port': 7101}, listeners: SHARED.listeners}).refused, true);
  // host:port lists and bracketed IPv6
  assert.equal(prestart.scanProperties({properties: {'kafka.servers': 'a.example.test:9092,localhost:7103'}, listeners: SHARED.listeners}).refused, true);
  assert.equal(prestart.scanProperties({properties: {'x.url': 'redis://[::1]:7101/0'}, listeners: SHARED.listeners}).refused, true);
  assert.equal(prestart.scanProperties({properties: {'x.url': 'postgresql://localhost/app'}, listeners: [{port: 5432, command: 'postgres', pid: 1, category: 'shared-resource'}]}).refused, true,
    'a URL without a port uses its scheme default');
});

test('T10: run-owned ports, unlistened ports, remote hosts, and the application\'s own port do not refuse', () => {
  const properties = {a: {url: 'redis://localhost:55001'}, b: {host: 'localhost', port: '55002'}, c: 'http://localhost:7999/health', d: 'db.dev.example.test:5432',
    server: {port: 7101}, docs: 'https://example.com/guide'};
  const findings = prestart.scanProperties({properties, listeners: SHARED.listeners, ownedPorts: [55001, 55002]});
  assert.equal(findings.refused, false);
  assert.deepEqual(findings.violations, []);
  assert.deepEqual(findings.warnings.map((item) => item.code).sort(), ['PRESTART_REMOTE_ENDPOINT', 'PRESTART_UNLISTENED_PORT_NOT_OWNED']);
});

test('the declared environment supplies the owned ports, and a missing listener snapshot fails closed', (t) => {
  const root = workspace(t);
  const properties = write(root, 'props.json', {redis: {url: 'redis://localhost:55001'}});
  const environment = write(root, 'environment.json', {schemaVersion: 2, endpoints: [{kind: 'redis', host: '127.0.0.1', port: 55001, containerId: 'c'.repeat(12), propertyKeys: ['redis.url']}]});
  const listenersFile = write(root, 'listeners.json', snapshotOf([55001, 'com.docker.backend', 'shared-resource']));
  assert.equal(node('check-prestart.js', '--properties', properties, '--listeners', listenersFile).status, 3, 'without the environment the port is not owned');
  assert.equal(node('check-prestart.js', '--properties', properties, '--listeners', listenersFile, '--environment', environment).status, 0);
  assert.equal(node('check-prestart.js', '--properties', properties, '--listeners', path.join(root, 'missing.json')).status, 64);
  assert.equal(node('check-prestart.js', '--phase', 'nope', '--properties', properties).status, 64);
});

test('client observation uses the client code and the same rule', () => {
  const findings = prestart.scanProperties({properties: {redisConnectionFactory: '127.0.0.1:7101', s3Client: 'http://127.0.0.1:55001'}, listeners: SHARED.listeners, ownedPorts: [55001], phase: 'client'});
  assert.deepEqual(findings.violations.map((item) => [item.code, item.key]), [['CLIENT_ENDPOINT_NOT_OWNED', 'redisConnectionFactory']]);
});

test('bypass: only a complete, unexpired, person-written exception lets a start through, and it is recorded', (t) => {
  const root = workspace(t);
  const properties = write(root, 'props.json', {redis: {host: 'localhost', port: 7101}});
  const listenersFile = write(root, 'listeners.json', SHARED);
  const exception = (overrides) => write(root, 'exceptions.json', {schema: 'vulpora.isolation-exceptions/v1', exceptions: [{id: 'EX-1', match: {host: 'localhost', port: 7101},
    reason: 'metrics sidecar, never written', owner: 'platform-team', expires: '2027-01-31', ...overrides}]});
  const run = (file) => { const out = path.join(root, 'f.json'); const r = node('check-prestart.js', '--properties', properties, '--listeners', listenersFile, '--exceptions', file, '--now', '2026-12-01T00:00:00Z', '--out', out); return {...r, findings: JSON.parse(fs.readFileSync(out, 'utf8'))}; };

  const allowed = run(exception({}));
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(allowed.findings.refused, false);
  assert.deepEqual(allowed.findings.exceptionsApplied.map((item) => [item.id, item.owner, item.expires, item.port]), [['EX-1', 'platform-team', '2027-01-31', 7101]]);

  for (const [label, overrides, reason] of [['expired', {expires: '2026-11-30'}, 'expired'], ['no owner', {owner: ''}, 'missing owner'], ['no reason', {reason: ' '}, 'missing reason'],
    ['no expiry', {expires: undefined}, 'missing or invalid expires'], ['key only', {match: {key: 'redis.host'}}, 'match needs a host or a port; a key alone is too broad'],
    ['other port', {match: {host: 'localhost', port: 7102}}, null]]) {
    const result = run(exception(overrides));
    assert.equal(result.status, 3, `${label} must not bypass`);
    if (reason) assert.deepEqual(result.findings.exceptionsRejected.map((item) => item.reason), [reason], label);
  }
  assert.equal(run(write(root, 'bad.json', {wrong: true})).status, 3, 'an exceptions file with the wrong schema bypasses nothing');
});

test('warn mode records the refusal it suppressed and never becomes the default', () => {
  const properties = {redis: {host: 'localhost', port: 7101}};
  const enforce = prestart.scanProperties({properties, listeners: SHARED.listeners});
  const warn = prestart.scanProperties({properties, listeners: SHARED.listeners, mode: 'warn'});
  assert.equal(enforce.mode, 'enforce');
  assert.equal(warn.refused, false);
  assert.equal(warn.refusalSuppressed, true);
  assert.deepEqual(warn.warnings.map((item) => [item.code, item.wouldBe]), [['PRESTART_REFUSAL_SUPPRESSED', 'PRESTART_ENDPOINT_NOT_OWNED']]);
});

test('end to end with a real decoy: a live snapshot makes the scan refuse the decoy port and accept an unrelated one', async (t) => {
  const root = workspace(t);
  const bait = await decoy(t);
  const listenersFile = path.join(root, 'live.json');
  assert.equal(node('snapshot-listeners.js', '--out', listenersFile).status, 0);
  const refused = node('check-prestart.js', '--properties', write(root, 'p1.json', {redis: {url: `redis://127.0.0.1:${bait.port}`}}), '--listeners', listenersFile);
  assert.equal(refused.status, 3, refused.stderr);
  const ok = node('check-prestart.js', '--properties', write(root, 'p2.json', {redis: {url: 'redis://127.0.0.1:1'}}), '--listeners', listenersFile);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(bait.accepted.length, 0, 'the scan reads listener state and never connects');
});

// ---- post-run check on synthetic receipts -----------------------------------------------------------------------------

function receipt(overrides = {}) {
  const policy = {mode: 'observe', pollIntervalMs: 1000, envPassed: ['PATH'], sharedPorts: [], runLabels: ['vulpora.run=r1']};
  return {schema: 'vulpora.isolation-receipt/v1', mode: 'observe', startedAt: '2026-11-23T00:00:00Z', finishedAt: '2026-11-23T00:00:10Z', runId: 'r1',
    command: {name: 'gradle', argCount: 2}, policy, policySha256: crypto.createHash('sha256').update(JSON.stringify(policy)).digest('hex'),
    env: {passed: ['PATH'], droppedNames: ['AWS_SECRET']}, listenerSnapshot: {path: 'listeners-before.json', sha256: '', takenAt: 'x', count: 0, visibility: 'current-user'},
    observation: {pollIntervalMs: 1000, samples: 9, maxGapMs: 1100, wallMs: 9500}, observerGaps: [], treeListenPorts: [], ownedPorts: [], connections: [],
    tools: {lsof: 'lsof test', node: process.version, platform: process.platform}, exit: {code: 0, signal: null}, ...overrides};
}
const connection = (port, extra = {}) => ({pid: 200, command: 'java', remoteAddress: '127.0.0.1', remotePort: port, firstSeen: '2026-11-23T00:00:02Z', lastSeen: '2026-11-23T00:00:08Z', samples: 6, localPortCount: 1, states: ['ESTABLISHED'], ...extra});

function check(t, {connections = [], snapshot = SHARED, environment, docker, baseline = {labels: ['vulpora.run=r1'], ids: []}, gaps = [], ownedPorts = [], extraArgs = [], prestartFindings = true, receiptOverrides = {}}) {
  const root = workspace(t);
  const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
  fs.writeFileSync(path.join(root, 'listeners-before.json'), snapshotText);
  const base = receipt({connections, observerGaps: gaps, ownedPorts, ...receiptOverrides});
  base.listenerSnapshot.sha256 = crypto.createHash('sha256').update(snapshotText).digest('hex');
  const args = ['--receipt', write(root, 'isolation-receipt.json', base), '--out', path.join(root, 'isolation.json'), '--label', 'vulpora.run=r1', '--baseline', write(root, 'baseline.json', baseline), ...extraArgs];
  if (environment) args.push('--environment', write(root, 'environment.json', environment));
  if (docker) args.push('--docker-inspect', write(root, 'docker.json', docker));
  if (prestartFindings) {
    // both scans ran and saw values (an empty scan proves nothing)
    for (const phase of ['prestart', 'client']) args.push('--prestart', write(root, `${phase}.json`, prestart.scanProperties({properties: {'app.url': 'http://localhost:55001'}, listeners: [], ownedPorts: [55001], phase})));
  }
  const result = node('check-isolation.js', ...args);
  assert.equal(result.status, 0, result.stderr);
  return {root, isolation: JSON.parse(fs.readFileSync(path.join(root, 'isolation.json'), 'utf8'))};
}

const ownedEnvironment = {schemaVersion: 2, endpoints: [{kind: 'redis', host: '127.0.0.1', port: 55001, containerId: 'a'.repeat(64), propertyKeys: ['redis.url']}]};
const ownedDocker = {containers: {['a'.repeat(64)]: {labels: {'vulpora.run': 'r1'}, ports: [55001]}}};

test('check-isolation (a): a connection to a port that was listening before the run is a shared contact', (t) => {
  const {isolation} = check(t, {connections: [connection(7101)]});
  assert.equal(isolation.sharedContacts.length, 1);
  assert.deepEqual([isolation.sharedContacts[0].remotePort, isolation.sharedContacts[0].category, isolation.sharedContacts[0].process.command], [7101, 'shared-resource', 'java']);
  assert.equal(isolation.verified, false);
});

test('check-isolation (b): only a run-owned endpoint, proven by Docker state, verifies clean', (t) => {
  const {isolation} = check(t, {connections: [connection(55001)], environment: ownedEnvironment, docker: ownedDocker, treeListen: [],
    receiptOverrides: {treeListenPorts: [8080]}});
  assert.deepEqual(isolation.sharedContacts, []);
  assert.deepEqual(isolation.ownedContacts.map((item) => item.remotePort), [55001]);
  assert.deepEqual(isolation.ownershipViolations, []);
  assert.deepEqual(isolation.unverifiedReasons, []);
  assert.equal(isolation.verified, true);
  assert.match(isolation.scope, /within what was observed/);
});

test('check-isolation (c): a non-loopback address is shared unless a person allows it, and the allowance is recorded', (t) => {
  const connections = [connection(443, {remoteAddress: '192.0.2.10'})];
  const shared = check(t, {connections, environment: ownedEnvironment, docker: ownedDocker});
  assert.equal(shared.isolation.sharedContacts[0].remoteAddress, '192.0.2.10');
  assert.equal(shared.isolation.sharedContacts[0].category, 'remote-address');
  const allowed = check(t, {connections, environment: ownedEnvironment, docker: ownedDocker, extraArgs: ['--allow-remote', '192.0.2.0/24']});
  assert.deepEqual(allowed.isolation.sharedContacts, []);
  assert.equal(allowed.isolation.allowedRemoteContacts.length, 1);
  assert.equal(allowed.isolation.verified, false, 'an allowed remote contact is not "no shared contact"');
  assert.ok(allowed.isolation.warnings.some((item) => item.code === 'REMOTE_CONTACT_ALLOWED'));
  assert.equal(checker.allowedRemote('192.0.2.77', ['192.0.2.0/24']), true);
  assert.equal(checker.allowedRemote('198.51.100.1', ['192.0.2.0/24']), false);
});

test('check-isolation (d): a build daemon or IDE port is a warning, not a breach (risk: false violations)', (t) => {
  const snapshot = snapshotOf([7201, 'java', 'local-tool', 77], [7101, 'redis-server', 'shared-resource', 9]);
  const {isolation} = check(t, {connections: [connection(7201)], snapshot, environment: ownedEnvironment, docker: ownedDocker});
  assert.deepEqual(isolation.sharedContacts, []);
  assert.deepEqual(isolation.localToolContacts.map((item) => item.remotePort), [7201]);
  assert.ok(isolation.warnings.some((item) => item.code === 'LOCAL_TOOL_CONTACT'));
});

test('check-isolation (e): no test JVM in the observed tree is an observer gap, so nothing is verified', (t) => {
  const {isolation} = check(t, {connections: [connection(55001)], environment: ownedEnvironment, docker: ownedDocker,
    gaps: [{kind: 'EXPECTED_PROCESS_NOT_OBSERVED', reason: 'no java in the tree'}]});
  assert.equal(isolation.verified, false);
  assert.deepEqual(isolation.observerGaps.map((item) => item.kind), ['EXPECTED_PROCESS_NOT_OBSERVED']);
  assert.ok(isolation.unverifiedReasons.some((reason) => reason.startsWith('OBSERVER_GAP')));
});

test('T11 / check-isolation (f): an environment that lists a shared port as run-owned is an ownership violation', (t) => {
  const forged = {schemaVersion: 2, endpoints: [
    {kind: 'redis', host: '127.0.0.1', port: 7101, containerId: 'b'.repeat(64), propertyKeys: ['redis.url']},
    {kind: 'db', host: 'db.dev.example.test', port: 5432, containerId: 'a'.repeat(64), propertyKeys: ['db.url']},
    {kind: 's3', host: '127.0.0.1', port: 55001, containerId: 'd'.repeat(64), propertyKeys: ['s3.url']},
    {kind: 'old', host: '127.0.0.1', port: 55001, containerId: 'e'.repeat(64), propertyKeys: []},
    {kind: 'wrong-port', host: '127.0.0.1', port: 55009, containerId: 'a'.repeat(64), propertyKeys: []}]};
  const docker = {containers: {
    ['b'.repeat(64)]: {labels: {}, ports: [7101]},                       // a shared container: no run label
    ['a'.repeat(64)]: {labels: {'vulpora.run': 'r1'}, ports: [55001]},
    ['e'.repeat(64)]: {labels: {'vulpora.run': 'r1'}, ports: [55001]}}};  // existed before the run (baseline)
  const {isolation} = check(t, {connections: [], environment: forged, docker, baseline: {labels: ['vulpora.run=r1'], ids: ['e'.repeat(64)]}});
  assert.deepEqual(isolation.ownershipViolations.map((item) => `${item.kind}: ${item.reason}`), [
    'redis: container lacks run label vulpora.run=r1', 'db: host is not a loopback address', 's3: container not found',
    'old: container existed before the run', 'wrong-port: port is not published by that container']);
  assert.deepEqual(isolation.verifiedOwnedEndpoints, []);
  assert.equal(isolation.verified, false);
  assert.ok(isolation.warnings.some((item) => item.code === 'ENDPOINT_NOT_RUN_OWNED'));
});

test('check-isolation: missing or tampered evidence leaves the run unverified instead of guessing', (t) => {
  // v1 environment: no endpoints to check
  assert.equal(check(t, {environment: {owner: 'repository-harness'}}).isolation.verified, false);
  // tampered policy
  const tampered = check(t, {connections: [connection(55001)], environment: ownedEnvironment, docker: ownedDocker, receiptOverrides: {policySha256: '0'.repeat(64)}});
  assert.ok(tampered.isolation.warnings.some((item) => item.code === 'ISOLATION_POLICY_HASH_MISMATCH'));
  assert.equal(tampered.isolation.verified, false);
  // pre-start scan never ran
  const noScan = check(t, {connections: [connection(55001)], environment: ownedEnvironment, docker: ownedDocker, prestartFindings: false});
  assert.ok(noScan.isolation.warnings.some((item) => item.code === 'PRESTART_SCAN_MISSING'));
  assert.ok(noScan.isolation.warnings.some((item) => item.code === 'CLIENT_SCAN_MISSING'));
  // a declared endpoint nobody used
  const unused = check(t, {connections: [], environment: ownedEnvironment, docker: ownedDocker});
  assert.ok(unused.isolation.warnings.some((item) => item.code === 'OWNED_ENDPOINT_UNUSED'));
  assert.equal(node('check-isolation.js', '--receipt', path.join(unused.root, 'nope.json'), '--out', path.join(unused.root, 'x.json')).status, 64);
});

test('check-isolation carries a pre-start refusal, a suppressed refusal, and an applied exception into the isolation record', (t) => {
  const refusal = prestart.scanProperties({properties: {redis: {host: 'localhost', port: 7101}}, listeners: SHARED.listeners});
  const suppressed = prestart.scanProperties({properties: {redis: {host: 'localhost', port: 7101}}, listeners: SHARED.listeners, mode: 'warn'});
  const excepted = prestart.scanProperties({properties: {redis: {host: 'localhost', port: 7101}}, listeners: SHARED.listeners,
    exceptions: [{id: 'EX-9', owner: 'owner', expires: '2027-01-01', reason: 'reviewed', match: {port: 7101}}]});
  for (const [label, findings, verify] of [
    ['refusal', refusal, (iso) => { assert.deepEqual(iso.prestartRefusals.map((item) => [item.code, item.port]), [['PRESTART_ENDPOINT_NOT_OWNED', 7101]]); }],
    ['suppressed', suppressed, (iso) => { assert.ok(iso.warnings.some((item) => item.code === 'PRESTART_REFUSAL_SUPPRESSED')); }],
    ['exception', excepted, (iso) => { assert.deepEqual(iso.exceptionsApplied.map((item) => item.id), ['EX-9']); assert.ok(iso.warnings.some((item) => item.code === 'PRESTART_EXCEPTION_APPLIED')); }]]) {
    const {root} = check(t, {environment: ownedEnvironment, docker: ownedDocker, prestartFindings: false});
    const out = path.join(root, `${label}.json`);
    const result = node('check-isolation.js', '--receipt', path.join(root, 'isolation-receipt.json'), '--out', out, '--prestart', write(root, `${label}-findings.json`, findings), '--label', 'vulpora.run=r1');
    assert.equal(result.status, 0, result.stderr);
    const iso = JSON.parse(fs.readFileSync(out, 'utf8'));
    verify(iso);
    assert.equal(iso.verified, false, label);
  }
});

// ---- wrapper -----------------------------------------------------------------------------------------------------------

test('B1: only allow-listed environment names reach the command, and the receipt records names, never values', () => {
  const {env, passed, dropped} = observer.buildEnv({PATH: '/bin', HOME: '/h', JAVA_HOME: '/j', SPRING_DATA_REDIS_HOST: 'localhost', AWS_SECRET_ACCESS_KEY: 'x', HTTPS_PROXY: 'p', TESTCONTAINERS_HOST_OVERRIDE: 'h', LC_ALL: 'C', CUSTOM: '1'}, ['CUSTOM'], {VULPORA_X: '1'});
  assert.deepEqual(Object.keys(env).sort(), ['CUSTOM', 'HOME', 'JAVA_HOME', 'LC_ALL', 'PATH', 'TESTCONTAINERS_HOST_OVERRIDE', 'VULPORA_X']);
  assert.deepEqual(dropped, ['AWS_SECRET_ACCESS_KEY', 'HTTPS_PROXY', 'SPRING_DATA_REDIS_HOST']);
  assert.ok(passed.includes('PATH'));
});

test('the wrapper refuses to run without a working lsof unless unobserved running is explicitly allowed', (t) => {
  const root = workspace(t);
  const marker = path.join(root, 'ran');
  const command = ['--', process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, '1')`];
  const noLsof = {...process.env, PATH: root};
  const refused = spawnSync(process.execPath, [script('observe-connections.js'), '--out', path.join(root, 'o1'), ...command], {encoding: 'utf8', env: noLsof});
  assert.equal(refused.status, 71, refused.stderr);
  assert.match(refused.stderr, /ISOLATION_GUARD_UNAVAILABLE/);
  assert.equal(fs.existsSync(marker), false, 'the command must not run when the guard is unavailable');
  const allowed = spawnSync(process.execPath, [script('observe-connections.js'), '--out', path.join(root, 'o2'), '--allow-unobserved', ...command], {encoding: 'utf8', env: noLsof});
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(fs.existsSync(marker), true);
  const gaps = JSON.parse(fs.readFileSync(path.join(root, 'o2/isolation-receipt.json'), 'utf8')).observerGaps;
  assert.ok(gaps.some((gap) => gap.kind === 'TOOL_UNAVAILABLE'));
  assert.equal(spawnSync(process.execPath, [script('observe-connections.js'), '--out', root], {encoding: 'utf8'}).status, 64);
});

// A client that connects to the decoy, writes, holds the connection for `holdMs`, and closes.
const CLIENT = 'const n=require("net");const c=n.connect(Number(process.argv[1]),"127.0.0.1",()=>{c.write("PING");setTimeout(()=>c.end(),Number(process.argv[2]))});c.on("error",()=>{});';

async function observeClient(root, port, holdMs, intervalMs = 200) {
  const out = path.join(root, `obs-${holdMs}`);
  const child = spawn(process.execPath, [script('observe-connections.js'), '--out', out, '--interval-ms', String(intervalMs), '--run-id', 'real', '--',
    process.execPath, '-e', CLIENT, String(port), String(holdMs)], {stdio: 'ignore'});
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(code, 0);
  return out;
}

test('real connection: the wrapper catches a held connection to the decoy, and the result is an ISOLATION_BREACH input', async (t) => {
  const root = workspace(t);
  const bait = await decoy(t);
  const out = await observeClient(root, bait.port, 2000);
  assert.equal(bait.accepted.length, 1, 'the decoy saw the connection');
  const receiptJson = JSON.parse(fs.readFileSync(path.join(out, 'isolation-receipt.json'), 'utf8'));
  assert.equal(receiptJson.mode, 'observe');
  assert.ok(receiptJson.observation.samples >= 3);
  assert.deepEqual(receiptJson.connections.map((item) => item.remotePort), [bait.port]);
  assert.ok(Object.keys(receiptJson.env).length > 0 && !JSON.stringify(receiptJson).includes(process.env.HOME || '\u0000nohome'), 'values stay out of the receipt');

  const iso = path.join(root, 'isolation.json');
  assert.equal(node('check-isolation.js', '--receipt', path.join(out, 'isolation-receipt.json'), '--out', iso).status, 0);
  const isolation = JSON.parse(fs.readFileSync(iso, 'utf8'));
  assert.deepEqual(isolation.sharedContacts.map((item) => item.remotePort), [bait.port]);
  assert.equal(isolation.sharedContacts[0].process.command, 'node');
  assert.equal(isolation.verified, false);
});

test('T5: short connections - the 2 s hold is always caught; shorter holds are measured and recorded, not promised', async (t) => {
  const root = workspace(t);
  const bait = await decoy(t);
  const seen = {};
  for (const holdMs of [2000, 400, 20]) {
    const out = await observeClient(root, bait.port, holdMs);
    seen[holdMs] = JSON.parse(fs.readFileSync(path.join(out, 'isolation-receipt.json'), 'utf8')).connections.some((item) => item.remotePort === bait.port);
  }
  assert.equal(seen[2000], true);
  // This is a measurement of the 200 ms poll, not an assertion: a poll can miss a 20 ms connection. The decoy always saw all three.
  assert.equal(bait.accepted.length, 3);
  t.diagnostic(`caught by the observer at a 200 ms poll: ${JSON.stringify(seen)}`);
});

test('the wrapper passes the command exit code through and records an expected-process gap for a reused daemon', async (t) => {
  const root = workspace(t);
  const out = path.join(root, 'o');
  const child = spawn(process.execPath, [script('observe-connections.js'), '--out', out, '--interval-ms', '200', '--expect-process', '^definitely-not-running$', '--', process.execPath, '-e', 'setTimeout(()=>process.exit(7),500)'], {stdio: 'ignore'});
  assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 7);
  const gaps = JSON.parse(fs.readFileSync(path.join(out, 'isolation-receipt.json'), 'utf8')).observerGaps.map((gap) => gap.kind);
  assert.ok(gaps.includes('EXPECTED_PROCESS_NOT_OBSERVED'));
  assert.deepEqual(observer.defaultExpectation(['./gradlew', 'test']), /^java(w)?$/);
  assert.equal(observer.defaultExpectation(['node', 'x.js']), null);
  assert.deepEqual(observer.parseDockerPs('abc123abc123\ttestcontainers/ryuk:0.5\t0.0.0.0:55100->8080/tcp\t\nfeed12345678\tredis:7\t0.0.0.0:55001->6379/tcp, :::55001->6379/tcp\tvulpora.run=r1,x=y\nbeef12345678\tredis:7\t0.0.0.0:16379->6379/tcp\t\n', ['vulpora.run=r1'])
    .map((item) => `${item.kind}:${item.port}`), ['infrastructure:55100', 'run-owned:55001', 'run-owned:55001']);
});

// ---- Java example (G1 / G2) ---------------------------------------------------------------------------------------------

const hasJdk = spawnSync('javac', ['-version']).status === 0 && spawnSync('java', ['-version']).status === 0;

test('The Java guard refuses a decoy port, passes a run-owned one, and fails closed without listener evidence', {skip: hasJdk ? false : 'JDK unavailable'}, async (t) => {
  const root = workspace(t);
  const bait = await decoy(t);
  const listenersFile = path.join(root, 'listeners.json');
  assert.equal(node('snapshot-listeners.js', '--out', listenersFile).status, 0);
  const driver = write(root, 'Driver.java', `import example.e2e.EndpointGuardInitializer;
import java.util.Map;
public class Driver { public static void main(String[] a) {
  try {
    if (a[0].equals("client")) EndpointGuardInitializer.checkClients(Map.of("redisConnectionFactory", a[1]));
    else EndpointGuardInitializer.checkProperties(Map.of("spring.data.redis.url", a[1], "note", "line1\\nquote\\"back\\\\slash", "password", "hunter2"));
  } catch (EndpointGuardInitializer.Refused refused) { System.out.println(refused.getMessage()); System.exit(3); }
  catch (IllegalStateException other) { System.out.println(other.getMessage()); System.exit(9); }
} }
`);
  const classes = path.join(root, 'classes');
  const compiled = spawnSync('javac', ['-d', classes, path.resolve(__dirname, '../reference/examples/EndpointGuardInitializer.java'), driver], {encoding: 'utf8'});
  assert.equal(compiled.status, 0, compiled.stderr);
  const isolationDir = path.join(root, 'iso');
  const runJava = (args, env = {}) => new Promise((resolve) => {
    const child = spawn('java', ['-cp', classes, `-Dvulpora.scripts.dir=${scripts}`, `-Dvulpora.isolation.dir=${isolationDir}`, 'Driver', ...args],
      {env: {...process.env, VULPORA_LISTENER_SNAPSHOT: listenersFile, ...env}});
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => resolve({code, output}));
  });

  const refused = await runJava(['prestart', `redis://127.0.0.1:${bait.port}`]);
  assert.equal(refused.code, 3, refused.output);
  assert.match(refused.output, /REFUSED \(PRESTART_ENDPOINT_NOT_OWNED\)/);
  const findings = JSON.parse(fs.readFileSync(path.join(isolationDir, 'prestart-findings-prestart.json'), 'utf8'));
  assert.equal(findings.refused, true);
  assert.ok(!JSON.stringify(findings).includes('hunter2'));
  assert.deepEqual(fs.readdirSync(isolationDir).filter((name) => name.startsWith('prestart-prestart-')), [], 'the temporary property file is deleted');

  assert.equal((await runJava(['prestart', 'redis://127.0.0.1:1'])).code, 0);
  const clientRefused = await runJava(['client', `127.0.0.1:${bait.port}`]);
  assert.equal(clientRefused.code, 3);
  assert.match(clientRefused.output, /CLIENT_ENDPOINT_NOT_OWNED/);

  // owned through environment.json
  const environment = write(root, 'environment.json', {schemaVersion: 2, endpoints: [{kind: 'redis', host: '127.0.0.1', port: bait.port, containerId: 'a'.repeat(12), propertyKeys: []}]});
  assert.equal((await runJava(['prestart', `redis://127.0.0.1:${bait.port}`], {VULPORA_ISOLATION_ENVIRONMENT: environment})).code, 0);
  // warn mode is explicit and recorded
  const warn = await runJava(['prestart', `redis://127.0.0.1:${bait.port}`], {VULPORA_ISOLATION_PRESTART: 'warn'});
  assert.equal(warn.code, 0, warn.output);
  assert.equal(JSON.parse(fs.readFileSync(path.join(isolationDir, 'prestart-findings-prestart.json'), 'utf8')).refusalSuppressed, true);
  // no listener evidence: fail closed
  const noEvidence = await runJava(['prestart', 'redis://127.0.0.1:1'], {VULPORA_LISTENER_SNAPSHOT: path.join(root, 'missing.json')});
  assert.equal(noEvidence.code, 9, noEvidence.output);
  assert.equal(bait.accepted.length, 0, 'the guard never connects to the decoy');
});

// ---- fixes from review ----------------------------------------------------------------------------------------------------

test('review: odd URL and host spellings are still recognised as this machine', () => {
  const refuses = (value) => prestart.scanProperties({properties: {'x.url': value}, listeners: SHARED.listeners}).refused;
  assert.equal(refuses('redis://:p@ss@localhost:7101'), true, 'an unencoded @ in a password must not hide the host');
  assert.equal(refuses('redis://127.1:7101'), true);
  assert.equal(refuses('redis://localhost.:7101'), true);
  assert.equal(refuses('redis://2130706433:7101'), true);
  assert.equal(refuses('redis://[::ffff:7f00:1]:7101'), true);
  assert.equal(refuses('redis://[0:0:0:0:0:ffff:7f00:1]:7101'), true);
  assert.equal(refuses('redis://10.255.255.1:7101'), false, 'a different network is only a warning');
  assert.equal(prestart.scanProperties({properties: {server: {address: '127.0.0.1', port: 7101}}, listeners: SHARED.listeners}).refused, false, 'the application\'s own bind');
});

test('review: a data service with a debug agent is shared, an editor helper is local, code-server is not', () => {
  assert.equal(listeners.classifyListener({command: 'java', args: '-agentlib:jdwp=transport=dt_socket kafka.Kafka'}).category, 'shared-resource');
  assert.equal(listeners.classifyListener({command: 'java', args: '-agentlib:jdwp=transport=dt_socket app.jar'}).category, 'local-tool');
  assert.equal(listeners.classifyListener({command: 'java', args: 'org.gradle.launcher.daemon.bootstrap.GradleDaemon'}).category, 'local-tool');
  assert.equal(listeners.classifyListener({command: 'code'}).category, 'local-tool');
  assert.equal(listeners.classifyListener({command: 'code-server'}).category, 'unknown');
});

test('review: a pre-existing labelled container is not run-owned, label values may contain =, empty scans are flagged, clock overrides are recorded', (t) => {
  const stale = 'f'.repeat(64);
  const out = check(t, {connections: [connection(55555)], environment: ownedEnvironment, docker: ownedDocker, baseline: {labels: ['vulpora.run=r1'], ids: [stale]},
    receiptOverrides: {ownedPorts: [{port: 55555, containerId: stale, image: 'redis:7', kind: 'run-owned'}]}});
  assert.deepEqual(out.isolation.sharedContacts, [], 'no listener snapshot entry for 55555, so it is unattributed rather than owned');
  assert.ok(out.isolation.warnings.some((item) => item.code === 'OWNED_PORT_CONTAINER_PRE_EXISTING'));
  assert.deepEqual(out.isolation.ownedContacts, []);
  assert.equal(out.isolation.verified, false);
  const eq = check(t, {connections: [connection(55001)], environment: ownedEnvironment, docker: {containers: {['a'.repeat(64)]: {labels: {'vulpora.run': 'r=1'}, ports: [55001]}}}, extraArgs: []});
  assert.ok(eq.isolation.ownershipViolations.length > 0, 'a label that does not match is a violation');
  const empty = prestart.scanProperties({properties: {}, listeners: []});
  assert.equal(empty.scanned.properties, 0);
  const root = workspace(t);
  const base = check(t, {environment: ownedEnvironment, docker: ownedDocker, prestartFindings: false});
  const result = node('check-isolation.js', '--receipt', path.join(base.root, 'isolation-receipt.json'), '--out', path.join(root, 'i.json'), '--label', 'vulpora.run=r1',
    '--prestart', write(root, 'p.json', {...empty, nowOverride: '2020-01-01T00:00:00.000Z'}), '--prestart', write(root, 'c.json', {...empty, phase: 'client'}));
  assert.equal(result.status, 0, result.stderr);
  const codes = JSON.parse(fs.readFileSync(path.join(root, 'i.json'), 'utf8')).warnings.map((item) => item.code);
  assert.ok(codes.includes('PRESTART_SCAN_EMPTY') && codes.includes('PRESTART_CLOCK_OVERRIDDEN'), codes.join());
  const clocked = node('check-prestart.js', '--properties', write(root, 'props.json', {a: 1}), '--listeners', write(root, 'l.json', SHARED), '--now', '2020-01-01T00:00:00Z', '--out', path.join(root, 'f.json'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'f.json'), 'utf8')).nowOverride, '2020-01-01T00:00:00.000Z', String(clocked.status));
});
