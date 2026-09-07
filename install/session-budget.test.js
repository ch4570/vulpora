'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {initBudget, readBudget, reserveBudget, settleBudget} = require('../skills/start-task/scripts/session-budget.js');
const {canonical, hash} = require('../skills/start-task/scripts/model-routing-io.js');
const modulePath = path.resolve(__dirname, '../skills/start-task/scripts/session-budget.js');

function fixture(t, limits = {totalTokens: 1000, maxRelativeUnits: 30}) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-budget-test-')));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const filename = path.join(directory, 'budget.json');
  const budget = initBudget(filename, limits);
  const request = (attemptId = 'attempt-1', extra = {}) => ({budgetId: budget.id, attemptId,
    capsuleSha256: hash(attemptId), ...extra});
  const reserve = (attemptId = 'attempt-1', extra = {}) => reserveBudget(filename,
    request(attemptId, {estimatedTokens: 400, relativeUnits: 10, ...extra}));
  const settle = (attemptId = 'attempt-1', usage = observed(100, 20)) => settleBudget(filename, request(attemptId, {usage}));
  return {directory, filename, budget, request, reserve, settle};
}
function observed(inputTokens, outputTokens, extra = {}) {
  return {source: 'codex-jsonl:turn.completed', inputTokens, outputTokens, ...extra};
}

test('exclusive initialization returns only summary fields and cannot reset prior spend', t => {
  const f = fixture(t);
  assert.deepEqual(f.budget, {schema: 'vulpora.session-budget/v1', id: f.budget.id,
    limits: {totalTokens: 1000, maxRelativeUnits: 30}, committedTokens: 0, reservedTokens: 0,
    remainingTokens: 1000, spentRelativeUnits: 0, reservedRelativeUnits: 0, remainingRelativeUnits: 30,
    overdrawn: false, unresolvedAttempts: 0});
  f.reserve(); f.settle();
  const before = fs.readFileSync(f.filename);
  assert.throws(() => initBudget(f.filename, {totalTokens: 9000, maxRelativeUnits: 90}), {code: 'BUDGET_ALREADY_EXISTS'});
  assert.deepEqual(fs.readFileSync(f.filename), before);
  assert.equal(readBudget(f.filename).committedTokens, 120);
  assert.equal(fs.statSync(f.filename).mode & 0o777, 0o600);
  assert.equal(Object.hasOwn(readBudget(f.filename), 'attempts'), false);
});

test('all in-flight token and relative-unit reservations reduce shared capacity', t => {
  const f = fixture(t);
  f.reserve('one');
  let budget = f.reserve('two');
  assert.equal(budget.reservedTokens, 800); assert.equal(budget.remainingTokens, 200);
  assert.equal(budget.reservedRelativeUnits, 20); assert.equal(budget.remainingRelativeUnits, 10);
  assert.throws(() => f.reserve('token-overflow'), {code: 'BUDGET_EXCEEDED'});
  assert.throws(() => f.reserve('unit-overflow', {estimatedTokens: 100, relativeUnits: 11}), {code: 'BUDGET_EXCEEDED'});
  budget = f.reserve('exact-rest', {estimatedTokens: 200});
  assert.equal(budget.remainingTokens, 0); assert.equal(budget.remainingRelativeUnits, 0);
  assert.equal(budget.overdrawn, false);
});

test('settlement refunds unused estimated tokens but charges execution units exactly once', t => {
  const f = fixture(t);
  f.reserve('one'); f.reserve('two');
  const budget = f.settle('one', observed(100, 20));
  assert.equal(budget.committedTokens, 120); assert.equal(budget.reservedTokens, 400);
  assert.equal(budget.remainingTokens, 480); assert.equal(budget.spentRelativeUnits, 10);
  assert.equal(budget.reservedRelativeUnits, 10); assert.equal(budget.remainingRelativeUnits, 10);
  assert.equal(f.reserve('three', {estimatedTokens: 480}).remainingTokens, 0);
});

test('observed excess remains recorded, counts other in-flight work and blocks new dispatch', t => {
  const f = fixture(t);
  f.reserve('one'); f.reserve('two');
  const budget = f.settle('one', observed(650, 100));
  assert.equal(budget.committedTokens, 750); assert.equal(budget.reservedTokens, 400);
  assert.equal(budget.remainingTokens, 0); assert.equal(budget.overdrawn, true);
  assert.throws(() => f.reserve('three', {estimatedTokens: 1, relativeUnits: 1}), {code: 'BUDGET_OVERDRAWN'});
  const reconciled = f.settle('two', observed(50, 20));
  assert.equal(reconciled.overdrawn, false); assert.equal(reconciled.remainingTokens, 180);
  assert.equal(f.reserve('three', {estimatedTokens: 180}).remainingTokens, 0);
});

test('actual spend exceeding the whole limit cannot be disguised by another estimate', t => {
  const f = fixture(t);
  f.reserve(); const budget = f.settle('attempt-1', observed(1200, 50));
  assert.equal(budget.committedTokens, 1250); assert.equal(budget.remainingTokens, 0);
  assert.equal(budget.overdrawn, true); assert.equal(budget.reservedTokens, 0);
  assert.throws(() => f.reserve('next', {estimatedTokens: 1, relativeUnits: 1}), {code: 'BUDGET_OVERDRAWN'});
});

test('missing usage retains reservations, blocks dispatch and permits later bound reconciliation', t => {
  const f = fixture(t);
  f.reserve();
  const held = f.settle('attempt-1', {source: 'unavailable'});
  assert.equal(held.committedTokens, 0); assert.equal(held.reservedTokens, 400);
  assert.equal(held.reservedRelativeUnits, 10); assert.equal(held.unresolvedAttempts, 1);
  assert.throws(() => f.reserve('next', {estimatedTokens: 1, relativeUnits: 1}), {code: 'BUDGET_USAGE_UNRESOLVED'});
  assert.deepEqual(f.settle('attempt-1', null), held);
  const reconciled = f.settle('attempt-1', observed(700, 10));
  assert.equal(reconciled.unresolvedAttempts, 0); assert.equal(reconciled.reservedTokens, 0);
  assert.equal(reconciled.committedTokens, 710); assert.equal(reconciled.remainingTokens, 290);
  assert.equal(f.reserve('next', {estimatedTokens: 290}).remainingTokens, 0);
});

test('malformed, untrusted, overflow and incompatible usage never refund capacity', t => {
  const invalid = [undefined, null, [], {}, {source: 'unavailable'},
    observed(10, 2, {source: 'agent_claim'}), observed(-1, 2), observed(10, 1.5),
    observed(10, Infinity), observed(Number.MAX_SAFE_INTEGER + 1, 2), observed(1e9 + 1, 0),
    observed(10, 2, {cachedInputTokens: 11}), observed(10, 2, {reasoningTokens: -1}),
    observed(10, 2, {scope: 'whole_run'}), observed(10, 2, {measurementKind: 'estimated'}),
    observed(10, 2, {reasoningSemantics: 'add_to_output'}), observed(10, 2, {usd: 0.01})];
  for (let index = 0; index < invalid.length; index++) {
    const f = fixture(t); f.reserve();
    // Passing undefined explicitly exercises the missing measurement value.
    const budget = settleBudget(f.filename, f.request('attempt-1', {usage: invalid[index]}));
    assert.equal(budget.reservedTokens, 400, `invalid usage #${index}`);
    assert.equal(budget.unresolvedAttempts, 1, `invalid usage #${index}`);
  }
});

test('cached input and reasoning are subsets and are not charged twice; observed zero is valid', t => {
  const f = fixture(t);
  f.reserve(); const budget = f.settle('attempt-1', observed(100, 20, {
    cachedInputTokens: 80, reasoningTokens: 15, scope: 'single_turn',
    measurementKind: 'provider_observed', reasoningSemantics: 'provider_reported_not_added'}));
  assert.equal(budget.committedTokens, 120);
  f.reserve('zero'); const zero = f.settle('zero', observed(0, 0, {cachedInputTokens: 0, reasoningTokens: 0}));
  assert.equal(zero.committedTokens, 120); assert.equal(zero.spentRelativeUnits, 20);
});

test('same usage settlement is idempotent; changed measurements cannot rewrite history', t => {
  const f = fixture(t);
  f.reserve(); const budget = f.settle(); const before = fs.readFileSync(f.filename);
  assert.deepEqual(f.settle(), budget); assert.deepEqual(fs.readFileSync(f.filename), before);
  assert.throws(() => f.settle('attempt-1', observed(99, 20)), {code: 'BUDGET_SETTLEMENT_CONFLICT'});
  assert.throws(() => f.settle('attempt-1', {source: 'unavailable'}), {code: 'BUDGET_SETTLEMENT_CONFLICT'});
  assert.deepEqual(fs.readFileSync(f.filename), before);
});

test('budget, attempt and capsule bindings prevent settlement mixups and duplicate dispatch', t => {
  const f = fixture(t); f.reserve();
  assert.throws(() => f.reserve(), {code: 'BUDGET_ATTEMPT_ALREADY_RESERVED'});
  assert.throws(() => reserveBudget(f.filename, f.request('next', {
    budgetId: 'wrong', estimatedTokens: 1, relativeUnits: 1})), {code: 'BUDGET_ID_MISMATCH'});
  assert.throws(() => settleBudget(f.filename, f.request('attempt-1', {
    budgetId: 'wrong', usage: observed(10, 2)})), {code: 'BUDGET_ID_MISMATCH'});
  assert.throws(() => f.settle('missing'), {code: 'BUDGET_ATTEMPT_NOT_FOUND'});
  assert.throws(() => settleBudget(f.filename, f.request('attempt-1', {
    capsuleSha256: hash('wrong'), usage: observed(10, 2)})), {code: 'BUDGET_ATTEMPT_BINDING_MISMATCH'});
  f.settle(); assert.throws(() => f.reserve(), {code: 'BUDGET_ATTEMPT_ALREADY_RESERVED'});
});

test('limits and reservation counts must be bounded positive safe integers', t => {
  const f = fixture(t);
  for (const value of [0, -1, 0.5, Infinity, NaN, '100', 1e9 + 1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => initBudget(path.join(f.directory, 'invalid.json'), {
      totalTokens: value, maxRelativeUnits: 30}), {code: 'BUDGET_INVALID_LIMITS'});
    assert.throws(() => initBudget(path.join(f.directory, 'invalid.json'), {
      totalTokens: 100, maxRelativeUnits: value}), {code: 'BUDGET_INVALID_LIMITS'});
    assert.throws(() => f.reserve('invalid', {estimatedTokens: value}), {code: 'BUDGET_INVALID_RESERVATION'});
    assert.throws(() => f.reserve('invalid', {relativeUnits: value}), {code: 'BUDGET_INVALID_RESERVATION'});
  }
  assert.throws(() => reserveBudget(f.filename, f.request('invalid', {
    attemptId: 123, estimatedTokens: 1, relativeUnits: 1})), {code: 'BUDGET_INVALID_REQUEST'});
  assert.equal(readBudget(f.filename).reservedTokens, 0);
});

test('large observed counts do not wrap or erase an overdraft', t => {
  const f = fixture(t, {totalTokens: 1e9, maxRelativeUnits: 1e9});
  f.reserve('large', {estimatedTokens: 1e9, relativeUnits: 1e9});
  const budget = f.settle('large', observed(1e9, 1e9));
  assert.equal(budget.committedTokens, 2e9); assert.equal(budget.overdrawn, true);
  assert.equal(budget.remainingTokens, 0); assert.equal(budget.remainingRelativeUnits, 0);
});

test('an existing lock fails closed and is never automatically stolen or deleted', t => {
  const f = fixture(t); const lock = `${f.filename}.lock`;
  fs.mkdirSync(lock); fs.writeFileSync(path.join(lock, 'owner'), 'possibly still running');
  assert.throws(() => f.reserve(), {code: 'BUDGET_BUSY'});
  assert.throws(() => initBudget(f.filename, f.budget.limits), {code: 'BUDGET_BUSY'});
  assert.equal(fs.readFileSync(path.join(lock, 'owner'), 'utf8'), 'possibly still running');
  assert.equal(readBudget(f.filename).reservedTokens, 0);
});

test('symlinks and nonregular files are rejected before replacing targets', t => {
  const f = fixture(t);
  const alias = path.join(f.directory, 'alias.json'); fs.symlinkSync(f.filename, alias);
  assert.throws(() => readBudget(alias), {code: 'BUDGET_UNSAFE_PATH'});
  assert.throws(() => initBudget(alias, f.budget.limits), {code: 'BUDGET_UNSAFE_PATH'});
  const nested = path.join(f.directory, 'nested'); fs.mkdirSync(nested);
  const directoryAlias = path.join(f.directory, 'nested-alias'); fs.symlinkSync(nested, directoryAlias);
  assert.throws(() => initBudget(path.join(directoryAlias, 'budget.json'), f.budget.limits), {code: 'BUDGET_UNSAFE_PATH'});
  assert.throws(() => readBudget(nested), {code: 'BUDGET_UNSAFE_PATH'});
  assert.equal(readBudget(f.filename).reservedTokens, 0);
});

test('corrupt, duplicate-key, noncanonical and inconsistent persisted states fail closed', t => {
  const f = fixture(t); f.reserve(); f.settle();
  const valid = JSON.parse(fs.readFileSync(f.filename, 'utf8'));
  const invalidStates = [
    '{', '{}', JSON.stringify(valid, null, 2),
    canonical(valid).replace('"schema":', '"schema":"shadowed","schema":'),
    canonical({...valid, id: 123}), canonical({...valid, limits: {...valid.limits, totalTokens: -1}}),
    canonical({...valid, attempts: [...valid.attempts, valid.attempts[0]]}),
    canonical({...valid, attempts: [{...valid.attempts[0], usageSha256: hash('forged')}]}),
    canonical({...valid, attempts: [{...valid.attempts[0], state: 'reserved'}]}),
    canonical({...valid, attempts: [{...valid.attempts[0], estimatedTokens: Number.MAX_SAFE_INTEGER + 1}]}),
    canonical({...valid, attempts: [{...valid.attempts[0], usage: {inputTokens: 1, outputTokens: 2}}]}),
  ];
  for (const bytes of invalidStates) {
    fs.writeFileSync(f.filename, bytes);
    assert.throws(() => readBudget(f.filename), {code: 'BUDGET_INVALID_FILE'});
    assert.throws(() => f.reserve('next'), {code: 'BUDGET_INVALID_FILE'});
    assert.equal(fs.readFileSync(f.filename, 'utf8'), bytes);
    assert.equal(fs.existsSync(`${f.filename}.lock`), false);
  }
});

test('concurrent independent processes cannot reserve beyond the shared budget', {timeout: 15000}, async t => {
  const f = fixture(t, {totalTokens: 1000, maxRelativeUnits: 100});
  const worker = `
    const {reserveBudget} = require(process.argv[1]);
    const request = JSON.parse(process.argv[3]);
    process.send({ready:true});
    process.once('message', async () => {
      for (let retry=0; retry<300; retry++) {
        try {
          const snapshot = reserveBudget(process.argv[2], request);
          process.send({ok:true,snapshot}, () => process.exit(0)); return;
        } catch (error) {
          if (error.code === 'BUDGET_BUSY') { await new Promise(resolve => setTimeout(resolve, 2)); continue; }
          process.send({ok:false,code:error.code}, () => process.exit(0)); return;
        }
      }
      process.send({ok:false,code:'RETRY_TIMEOUT'}, () => process.exit(0));
    });`;
  const children = [];
  const tasks = Array.from({length: 8}, (_, index) => {
    const child = spawn(process.execPath, ['-e', worker, modulePath, f.filename,
      JSON.stringify(f.request(`worker-${index}`, {estimatedTokens: 500, relativeUnits: 10}))],
    {stdio: ['ignore', 'ignore', 'pipe', 'ipc']});
    children.push(child);
    let stderr = '', result;
    child.stderr.on('data', data => { stderr += data; });
    const ready = new Promise((resolve, reject) => {
      child.once('message', message => message.ready ? resolve() : reject(new Error('Missing ready signal')));
      child.once('error', reject);
    });
    const finished = new Promise((resolve, reject) => {
      child.on('message', message => { if (!message.ready) result = message; });
      child.once('error', reject);
      child.once('exit', code => code === 0 && result ? resolve(result)
        : reject(new Error(`worker exit ${code}: ${stderr}`)));
    });
    return {ready, finished};
  });
  t.after(() => children.forEach(child => { if (child.exitCode === null) child.kill('SIGKILL'); }));
  await Promise.all(tasks.map(task => task.ready));
  children.forEach(child => child.send({go: true}));
  const results = await Promise.all(tasks.map(task => task.finished));
  assert.equal(results.filter(result => result.ok).length, 2);
  assert.ok(results.every(result => result.ok || result.code === 'BUDGET_EXCEEDED'));
  assert.ok(results.filter(result => result.ok).every(result => result.snapshot.reservedTokens <= 1000));
  const budget = readBudget(f.filename);
  assert.equal(budget.reservedTokens, 1000); assert.equal(budget.remainingTokens, 0);
  assert.equal(budget.reservedRelativeUnits, 20); assert.equal(budget.overdrawn, false);
  assert.equal(fs.existsSync(`${f.filename}.lock`), false);
  assert.deepEqual(fs.readdirSync(f.directory), ['budget.json']);
});
