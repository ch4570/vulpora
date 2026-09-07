#!/usr/bin/env node
'use strict';

// A fresh, explicitly owned CLI session. This transport never represents itself
// as a native subagent, proves backend identity, or verifies the worker's claims.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn, spawnSync} = require('node:child_process');
const {performance} = require('node:perf_hooks');
const {canonical, hash, regularFile, parseJson} = require('./model-routing-io.js');
const {promptFor, summarizeResult} = require('./session-io.js');
const {sourceContextFor, validateSourceContext} = require('./session-context.js');
const {createTelemetry} = require('./session-telemetry.js');
const {selectTaskExecution, resolveTaskRoute} = require('./task-router.js');
const {initBudget, readBudget, reserveBudget, settleBudget} = require('./session-budget.js');

const TASK_TYPES = ['deterministic', 'lookup', 'documentation', 'implementation', 'review', 'testing', 'architecture', 'research'];
const DEFAULT_LIMITS = {timeoutMs: 300000, maxOutputBytes: 4 * 1024 * 1024, maxResultBytes: 4096, maxPromptBytes: 8192, toolOutputTokens: 2000};
const MAX_LIMITS = {timeoutMs: 3600000, maxOutputBytes: 16 * 1024 * 1024, maxResultBytes: 65536, maxPromptBytes: 65536, toolOutputTokens: 12000};
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CANDIDATE_SCHEMA_PATH = path.join(__dirname, 'session-candidate.schema.json');
const fail = code => { throw Object.assign(new Error(code), {code}); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function keys(value, required, optional = []) {
  if (!object(value) || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail('INVALID_FIELDS');
}
function text(value, maximum, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.includes('\0')
    || Buffer.byteLength(value) > maximum) fail('INVALID_TEXT');
  return value;
}
function strings(value, count, bytes, nonempty = false) {
  if (!Array.isArray(value) || value.length > count || (nonempty && !value.length)) fail('INVALID_LIST');
  value.forEach(item => text(item, bytes));
  return value;
}
function integer(value, maximum, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail('INVALID_BOUND');
  return value;
}
function relativeFile(value) {
  text(value, 2048);
  if (path.isAbsolute(value) || /[\\\r\n]/.test(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')) fail('INVALID_SCOPED_PATH');
  return value;
}
function scopedFile(cwd, name) {
  relativeFile(name);
  let cursor = cwd;
  for (const segment of name.split('/')) {
    cursor = path.join(cursor, segment);
    try { if (fs.lstatSync(cursor).isSymbolicLink()) fail('SYMLINK_SCOPED_PATH'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return cursor;
}
function readJson(filename, maximum = 1024 * 1024) {
  return parseJson(regularFile(path.resolve(filename), maximum).toString('utf8'));
}
function writeNew(filename, value) {
  const directory = path.dirname(filename);
  const temporary = path.join(directory, `.${path.basename(filename)}.${crypto.randomUUID()}.tmp`);
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, canonical(value)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    // Publish complete bytes without replacing an existing attempt/artifact.
    fs.linkSync(temporary, filename);
    const parent = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
function validateTask(input) {
  keys(input, ['schema', 'id', 'goal', 'cwd', 'files', 'acceptance'],
    ['runtime', 'taskType', 'difficulty', 'risk', 'profile', 'constraints', 'mode', 'delegation', 'contextMode', 'estimatedTokens', 'remainingTokens', 'maxRelativeUnits', 'limits']);
  if (input.schema !== 'vulpora.session-task/v1' || !ID.test(input.id || '')) fail('INVALID_TASK_ID_OR_SCHEMA');
  text(input.goal, 8192); text(input.cwd, 4096);
  if (!path.isAbsolute(input.cwd)) fail('CWD_MUST_BE_ABSOLUTE');
  const cwd = fs.realpathSync(input.cwd);
  if (!fs.statSync(cwd).isDirectory()) fail('INVALID_CWD');
  strings(input.files, 128, 2048); input.files.forEach(file => scopedFile(cwd, file));
  if (new Set(input.files).size !== input.files.length) fail('DUPLICATE_SCOPED_PATH');
  strings(input.acceptance, 32, 2048, true);
  const task = {...input, cwd, runtime: input.runtime ?? 'codex', taskType: input.taskType ?? 'implementation',
    difficulty: input.difficulty ?? 'moderate', risk: input.risk ?? 'low', mode: input.mode ?? 'read-only',
    constraints: input.constraints ?? [], delegation: input.delegation ?? 'auto', estimatedTokens: input.estimatedTokens ?? 4000,
    remainingTokens: input.remainingTokens ?? 4000, maxRelativeUnits: input.maxRelativeUnits ?? 30};
  if (task.runtime !== 'codex') fail('UNSUPPORTED_SESSION_RUNTIME');
  if (!TASK_TYPES.includes(task.taskType) || !['simple', 'moderate', 'complex'].includes(task.difficulty)
    || !['low', 'high'].includes(task.risk) || !['read-only', 'workspace-write'].includes(task.mode)) fail('INVALID_TASK_SELECTION');
  if (task.profile !== undefined && !['auto', 'frugal', 'standard', 'frontier'].includes(task.profile)) fail('INVALID_TASK_PROFILE');
  if (task.contextMode !== undefined && !['read', 'inline'].includes(task.contextMode)) fail('INVALID_CONTEXT_MODE');
  strings(task.constraints, 32, 2048);
  if (!['auto', 'independent-session'].includes(task.delegation)) fail('INVALID_TASK_DELEGATION');
  integer(task.estimatedTokens, 1e9); integer(task.remainingTokens, 1e9); integer(task.maxRelativeUnits, 1e9);
  if (input.limits !== undefined) keys(input.limits, [], Object.keys(DEFAULT_LIMITS));
  task.limits = {...DEFAULT_LIMITS, ...(input.limits || {})};
  for (const key of Object.keys(DEFAULT_LIMITS)) integer(task.limits[key], MAX_LIMITS[key], key === 'timeoutMs' ? 50 : 256);
  return task;
}
function executable() {
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.resolve(directory, 'codex');
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      const resolved = fs.realpathSync(candidate);
      const bytes = regularFile(resolved, 256 * 1024 * 1024);
      return {executable: resolved, sha256: hash(bytes)};
    } catch {}
  }
  fail('CODEX_CLI_NOT_FOUND');
}
function git(cwd, args, optional = false) {
  const result = spawnSync('git', args, {cwd, shell: false, encoding: 'buffer', timeout: 10000,
    maxBuffer: 8 * 1024 * 1024, env: {...process.env, GIT_OPTIONAL_LOCKS: '0'}});
  if (result.error || result.status !== 0) {
    if (optional) return null;
    fail('WORKSPACE_SNAPSHOT_FAILED');
  }
  return result.stdout;
}
function snapshot(task, attemptDir) {
  const files = {};
  for (const name of task.files) {
    const filename = scopedFile(task.cwd, name);
    try { files[name] = hash(regularFile(filename, 4 * 1024 * 1024)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; files[name] = null; }
  }
  const head = git(task.cwd, ['rev-parse', '--verify', 'HEAD'], true);
  let repositorySha256 = null;
  if (head) {
    const excluded = path.relative(task.cwd, attemptDir);
    const paths = ['--', '.', ...(excluded && !excluded.startsWith(`..${path.sep}`) && !path.isAbsolute(excluded)
      ? [`:(exclude,literal)${excluded}`] : [])];
    const diff = git(task.cwd, ['diff', '--binary', 'HEAD', ...paths]);
    const status = git(task.cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', ...paths]);
    repositorySha256 = hash(Buffer.concat([diff, Buffer.from('\0'), status]));
  }
  return {headSha: head ? head.toString('utf8').trim() : null, repositorySha256, files};
}
function prepare(options) {
  if (process.env.VULPORA_SESSION_DEPTH) fail('RECURSIVE_SESSION_FORBIDDEN');
  const task = validateTask(readJson(options.task));
  const executionSelection = selectTaskExecution({...task, fileCount: task.files.length});
  if (executionSelection.kind !== 'independent-session') return {
    schema: 'vulpora.session-plan/v1', taskId: task.id,
    status: executionSelection.kind === 'deterministic' ? 'NO_MODEL' : 'PRIMARY_OWNED', execution: 'NOT_RUN',
    reason: executionSelection.kind === 'deterministic' ? 'PRIMARY_DETERMINISTIC_EXECUTION_REQUIRED' : 'PRIMARY_DIRECT_EXECUTION_REQUIRED',
    executionSelection, delegatedTokens: 0,
  };
  if (!options.budget) fail('BUDGET_REQUIRED');
  if (!options.catalog || !options.out) fail('MISSING_ARGUMENT');
  // Shared accounting must not mutate the worker's fingerprinted workspace.
  const budgetFile = path.resolve(options.budget);
  const relativeBudget = path.relative(task.cwd, budgetFile);
  if (!relativeBudget || (!relativeBudget.startsWith(`..${path.sep}`) && relativeBudget !== '..'
    && !path.isAbsolute(relativeBudget))) fail('BUDGET_MUST_BE_OUTSIDE_WORKSPACE');
  const budget = readBudget(budgetFile);
  if (budget.overdrawn || budget.unresolvedAttempts) fail('BUDGET_RECONCILIATION_REQUIRED');
  const catalog = readJson(options.catalog);
  const policy = readJson(options.policy || path.join(__dirname, 'model-routing-policy.json'));
  const route = resolveTaskRoute({runtime: task.runtime, taskType: task.taskType, difficulty: task.difficulty,
    risk: task.risk, ...(task.profile === undefined ? {} : {profile: task.profile}),
    estimatedTokens: task.estimatedTokens, remainingTokens: Math.min(task.remainingTokens, budget.remainingTokens),
    maxRelativeUnits: Math.min(task.maxRelativeUnits, budget.remainingRelativeUnits)}, catalog, policy);
  if (route.status === 'NO_MODEL') return {schema: 'vulpora.session-plan/v1', status: 'NO_MODEL', execution: 'NOT_RUN',
    reason: 'PRIMARY_DETERMINISTIC_EXECUTION_REQUIRED', taskSelection: route.taskSelection};
  if (route.status !== 'RESOLVED') fail('SESSION_ROUTE_UNAVAILABLE');
  integer(route.relativeUnits, 1e9, 1);
  const parent = fs.realpathSync(path.dirname(path.resolve(options.out)));
  const attemptDir = path.join(parent, path.basename(path.resolve(options.out)));
  if (fs.existsSync(attemptDir)) fail('ATTEMPT_ALREADY_EXISTS');
  const capsule = {schema: 'vulpora.session-capsule/v1', attemptId: crypto.randomUUID(), task, route,
    budget: {file: budgetFile, id: budget.id},
    runtime: executable(), workspace: snapshot(task, attemptDir), preparedAt: new Date().toISOString(),
    expiresAt: new Date(Date.parse(catalog.observedAt) + policy.maxCatalogAgeSeconds * 1000).toISOString(),
    outputSchemaSha256: hash(regularFile(CANDIDATE_SCHEMA_PATH, 65536))};
  // Explicit until matched measurements justify changing the default. Existing
  // capsules keep their exact prompt and workspace binding semantics.
  if (task.contextMode === 'inline') {
    const sourceContext = sourceContextFor(task.cwd, task.files, capsule.workspace.files);
    if (sourceContext && Buffer.byteLength(promptFor({...capsule, sourceContext})) <= task.limits.maxPromptBytes)
      capsule.sourceContext = sourceContext;
  }
  if (Buffer.byteLength(promptFor(capsule)) > task.limits.maxPromptBytes) fail('PROMPT_BUDGET_EXCEEDED');
  fs.mkdirSync(attemptDir, {mode: 0o700});
  writeNew(path.join(attemptDir, 'capsule.json'), capsule);
  writeNew(path.join(attemptDir, 'output.schema.json'), readJson(CANDIDATE_SCHEMA_PATH, 65536));
  writeNew(path.join(attemptDir, 'prepared.json'), {schema: 'vulpora.session-prepared/v1',
    attemptId: capsule.attemptId, capsuleSha256: hash(canonical(capsule))});
  return {schema: 'vulpora.session-plan/v1', status: 'PREPARED', execution: 'NOT_RUN',
    capsulePath: path.join(attemptDir, 'capsule.json'), capsuleSha256: hash(canonical(capsule)),
    attemptId: capsule.attemptId, model: route.model, reasoning_effort: route.reasoning_effort,
    taskSelection: route.taskSelection, executionSelection, mode: task.mode, promptBytes: Buffer.byteLength(promptFor(capsule)),
    budget: {...budget, reservation: 'AT_DISPATCH'}};
}
function loadCapsule(filename) {
  const absolute = path.resolve(filename);
  if (path.basename(absolute) !== 'capsule.json') fail('CAPSULE_FILENAME_INVALID');
  const bytes = regularFile(absolute, 1024 * 1024);
  const capsule = parseJson(bytes.toString('utf8'));
  keys(capsule, ['schema', 'attemptId', 'task', 'route', 'runtime', 'workspace', 'preparedAt', 'expiresAt', 'outputSchemaSha256'], ['budget', 'sourceContext']);
  if (capsule.schema !== 'vulpora.session-capsule/v1' || !ID.test(capsule.attemptId || '')
    || canonical(capsule) !== bytes.toString('utf8')) fail('INVALID_CAPSULE');
  if (!capsule.budget) fail('BUDGET_REQUIRED');
  keys(capsule.budget, ['file', 'id']);
  if (typeof capsule.budget.file !== 'string' || !path.isAbsolute(capsule.budget.file)
    || !ID.test(capsule.budget.id || '')) fail('INVALID_CAPSULE_BUDGET');
  const task = validateTask(capsule.task);
  if (canonical(task) !== canonical(capsule.task)) fail('NON_CANONICAL_TASK');
  if (Object.hasOwn(capsule, 'sourceContext')) validateSourceContext(capsule.sourceContext, task.files, capsule.workspace.files);
  if (capsule.route?.status !== 'RESOLVED' || capsule.route.runtime !== 'codex'
    || !/^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,199}$/.test(capsule.route.model || '')
    || !['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(capsule.route.reasoning_effort)) fail('INVALID_CAPSULE_ROUTE');
  keys(capsule.runtime, ['executable', 'sha256']);
  if (!path.isAbsolute(capsule.runtime.executable) || !/^[a-f0-9]{64}$/.test(capsule.runtime.sha256 || '')) fail('INVALID_RUNTIME_IDENTITY');
  if (!Number.isFinite(Date.parse(capsule.expiresAt)) || new Date(capsule.expiresAt).toISOString() !== capsule.expiresAt) fail('INVALID_CAPSULE_EXPIRY');
  const prepared = readJson(path.join(path.dirname(absolute), 'prepared.json'), 4096);
  if (prepared.schema !== 'vulpora.session-prepared/v1' || prepared.attemptId !== capsule.attemptId
    || prepared.capsuleSha256 !== hash(bytes)) fail('CAPSULE_PREPARATION_MISMATCH');
  return {capsule, capsuleSha256: hash(bytes), attemptDir: path.dirname(absolute), absolute};
}
function status(options) {
  const loaded = loadCapsule(options.capsule);
  const resultPath = path.join(loaded.attemptDir, 'result.json');
  if (fs.existsSync(resultPath)) {
    const result = readJson(resultPath, 256 * 1024);
    if (result.capsuleSha256 !== loaded.capsuleSha256 || result.attemptId !== loaded.capsule.attemptId) fail('RESULT_BINDING_MISMATCH');
    const receiptPath = path.join(loaded.attemptDir, 'budget-receipt.json');
    if (fs.existsSync(receiptPath)) {
      const receipt = readJson(receiptPath, 16384);
      if (receipt.capsuleSha256 !== loaded.capsuleSha256 || receipt.attemptId !== result.attemptId) fail('BUDGET_RECEIPT_BINDING_MISMATCH');
      result.budget = receipt.budget;
    }
    return options.detail ? result : summarizeResult(result, resultPath);
  }
  return {schema: 'vulpora.session-status/v1', status: fs.existsSync(path.join(loaded.attemptDir, 'launch.json'))
    ? 'STARTED_OUTCOME_UNKNOWN' : 'PREPARED', attemptId: loaded.capsule.attemptId,
  taskId: loaded.capsule.task.id, budget: readBudget(loaded.capsule.budget.file),
  execution: fs.existsSync(path.join(loaded.attemptDir, 'launch.json')) ? 'UNKNOWN' : 'NOT_RUN',
  retryAllowed: false, verification: 'NOT_VERIFIED'};
}
function reconcile(options) {
  if (process.env.VULPORA_SESSION_DEPTH) fail('RECURSIVE_SESSION_FORBIDDEN');
  const loaded = loadCapsule(options.capsule);
  const resultPath = path.join(loaded.attemptDir, 'result.json');
  if (!fs.existsSync(resultPath)) {
    // A lost launcher has no completion evidence. Do not release its reserve,
    // infer zero cost or relaunch it. A later real result can still settle it.
    const budget = settleBudget(loaded.capsule.budget.file, {budgetId: loaded.capsule.budget.id,
      attemptId: loaded.capsule.attemptId, capsuleSha256: loaded.capsuleSha256, usage: {source: 'unavailable'}});
    return {schema: 'vulpora.session-accounting/v1', taskId: loaded.capsule.task.id,
      attemptId: loaded.capsule.attemptId, status: 'RECONCILIATION_REQUIRED', reason: 'COMPLETION_USAGE_UNAVAILABLE', budget};
  }
  const result = readJson(resultPath, 256 * 1024);
  if (result.capsuleSha256 !== loaded.capsuleSha256 || result.attemptId !== loaded.capsule.attemptId) fail('RESULT_BINDING_MISMATCH');
  const budget = settleBudget(loaded.capsule.budget.file, {budgetId: loaded.capsule.budget.id,
    attemptId: result.attemptId, capsuleSha256: loaded.capsuleSha256, usage: result.runtime?.usage});
  const receiptPath = path.join(loaded.attemptDir, 'budget-receipt.json');
  try { writeNew(receiptPath, {schema: 'vulpora.session-budget-receipt/v1',
    attemptId: result.attemptId, capsuleSha256: loaded.capsuleSha256, budget}); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = readJson(receiptPath, 16384);
    if (previous.attemptId !== result.attemptId || previous.capsuleSha256 !== loaded.capsuleSha256) fail('BUDGET_RECEIPT_BINDING_MISMATCH');
  }
  return {schema: 'vulpora.session-accounting/v1', taskId: result.taskId, attemptId: result.attemptId,
    status: budget.unresolvedAttempts ? 'RECONCILIATION_REQUIRED' : 'RECONCILED', budget};
}
function validateCandidate(value, capsule) {
  keys(value, ['schema', 'task_id', 'attempt_id', 'status', 'summary', 'changed_files', 'evidence', 'risks', 'blocker']);
  if (value.schema !== 'vulpora.session-candidate/v1' || value.task_id !== capsule.task.id
    || value.attempt_id !== capsule.attemptId) fail('CANDIDATE_BINDING_MISMATCH');
  if (!['candidate', 'blocked', 'failed'].includes(value.status)) fail('INVALID_CANDIDATE_STATUS');
  text(value.summary, 2048); strings(value.changed_files, 128, 2048); value.changed_files.forEach(relativeFile);
  if (value.changed_files.some(file => !capsule.task.files.includes(file))) fail('CANDIDATE_OUTSIDE_DECLARED_FILES');
  if (capsule.task.mode === 'read-only' && value.changed_files.length) fail('READ_ONLY_CANDIDATE_CLAIMS_MUTATION');
  strings(value.evidence, 32, 1024); strings(value.risks, 16, 1024);
  if (value.blocker !== null) text(value.blocker, 2048);
  if (value.status === 'blocked' && value.blocker === null) fail('BLOCKED_CANDIDATE_WITHOUT_REASON');
  return value;
}

async function execute(capsule, attemptDir) {
  const finalPath = path.join(attemptDir, 'candidate.json');
  const args = ['exec', '--ephemeral', '--strict-config', '--json', '--output-schema', path.join(attemptDir, 'output.schema.json'),
    '--output-last-message', finalPath, '--cd', capsule.task.cwd, '--color', 'never', '--model', capsule.route.model,
    '--sandbox', capsule.task.mode, '-c', `model_reasoning_effort="${capsule.route.reasoning_effort}"`,
    '-c', `tool_output_token_limit=${capsule.task.limits.toolOutputTokens}`,
    '-c', 'approval_policy="never"', '--disable', 'multi_agent', '--disable', 'multi_agent_v2', '-'];
  const limits = capsule.task.limits;
  const started = performance.now();
  const telemetry = createTelemetry();
  const stdoutHash = crypto.createHash('sha256'), stderrHash = crypto.createHash('sha256');
  let outputBytes = 0, buffer = '', reason = null, usage = null, usageEvents = 0, eventCount = 0, threadId = null;
  let child, deadline, killTimer, drainTimer, fileTimer, closed = false, exited = false;
  let resolveCompletion;
  const completed = new Promise(resolve => { resolveCompletion = resolve; });
  const signal = name => {
    if (!child || exited || closed || child.exitCode !== null || child.signalCode !== null || !child.pid) return;
    try { process.kill(-child.pid, name); } catch (error) { if (error.code !== 'ESRCH') reason ||= 'CLEANUP_UNVERIFIED'; }
  };
  const stop = code => {
    reason ||= code; signal('SIGTERM');
    killTimer ||= setTimeout(() => signal('SIGKILL'), 200);
    drainTimer ||= setTimeout(() => {
      reason ||= 'CLEANUP_UNVERIFIED'; child?.stdout.destroy(); child?.stderr.destroy(); child?.stdin.destroy(); child?.unref();
      resolveCompletion({exitCode: child?.exitCode ?? null, signal: child?.signalCode ?? null, closeObserved: closed});
    }, 1500);
  };
  const interrupt = () => stop('CANCELLED');
  function event(line) {
    let value;
    try { value = JSON.parse(line); } catch { stop('INVALID_RUNTIME_EVENT'); return; }
    eventCount++;
    telemetry.observe(value);
    if (value.type === 'thread.started' && typeof value.thread_id === 'string' && ID.test(value.thread_id)) threadId = value.thread_id;
    // Only top-level CLI protocol events provide usage; model/tool text and the
    // candidate response are never scanned for measurements.
    if (value.type === 'turn.completed') {
      // Count every completion: malformed usage must not hide an additional turn.
      usageEvents++;
      if (usageEvents > 1) {
        usage = {source: 'unavailable', reason: 'MULTIPLE_FINAL_USAGE_EVENTS'}; return;
      }
      const observed = value.usage;
      if (!object(observed)
        || !['input_tokens', 'output_tokens'].every(key => Number.isSafeInteger(observed[key]) && observed[key] >= 0)
        || (observed.cached_input_tokens !== undefined && (!Number.isSafeInteger(observed.cached_input_tokens)
          || observed.cached_input_tokens < 0 || observed.cached_input_tokens > observed.input_tokens))) {
        usage = {source: 'unavailable', reason: 'INVALID_USAGE_EVENT'}; return;
      }
      usage = {source: 'codex-jsonl:turn.completed', inputTokens: observed.input_tokens,
        cachedInputTokens: observed.cached_input_tokens ?? null, outputTokens: observed.output_tokens,
        scope: 'single_turn', measurementKind: 'provider_observed',
        reasoningTokens: Number.isSafeInteger(observed.reasoning_output_tokens) && observed.reasoning_output_tokens >= 0
          ? observed.reasoning_output_tokens : null, reasoningSemantics: 'provider_reported_not_added'};
    }
    if (value.type === 'turn.failed' || value.type === 'error') stop('RUNTIME_REPORTED_FAILURE');
  }
  try {
    child = spawn(capsule.runtime.executable, args, {cwd: capsule.task.cwd, env: {...process.env, VULPORA_SESSION_DEPTH: '1'},
      shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe']});
    process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt); process.once('SIGHUP', interrupt);
    child.once('error', () => { reason ||= 'RUNTIME_START_FAILED'; });
    child.stdin.on('error', () => { if (!closed) stop('RUNTIME_INPUT_FAILED'); });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => {
      outputBytes += Buffer.byteLength(data); stdoutHash.update(data);
      if (outputBytes > limits.maxOutputBytes) { stop('OUTPUT_BUDGET_EXCEEDED'); return; }
      buffer += data;
      for (;;) {
        const newline = buffer.indexOf('\n');
        if (newline < 0) break;
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (line.trim()) event(line);
      }
    });
    child.stderr.on('data', data => {
      outputBytes += data.length; stderrHash.update(data);
      if (outputBytes > limits.maxOutputBytes) stop('OUTPUT_BUDGET_EXCEEDED');
    });
    child.once('exit', () => {
      exited = true;
      drainTimer ||= setTimeout(() => {
        reason ||= 'CLEANUP_UNVERIFIED'; child.stdout.destroy(); child.stderr.destroy(); child.unref();
        resolveCompletion({exitCode: child.exitCode, signal: child.signalCode, closeObserved: false});
      }, 1000);
    });
    child.once('close', (exitCode, exitSignal) => {
      closed = true;
      if (buffer.trim()) event(buffer);
      resolveCompletion({exitCode, signal: exitSignal, closeObserved: true});
    });
    deadline = setTimeout(() => stop('TIME_BUDGET_EXCEEDED'), limits.timeoutMs);
    fileTimer = setInterval(() => {
      try {
        const stat = fs.lstatSync(finalPath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limits.maxResultBytes) stop('RESULT_BUDGET_OR_FILE_VIOLATION');
      } catch (error) { if (error.code !== 'ENOENT') stop('RESULT_FILE_UNREADABLE'); }
    }, 50);
    child.stdin.end(promptFor(capsule));
    const completion = await completed;
    if (completion.exitCode !== 0 || completion.signal) reason ||= 'RUNTIME_EXIT_FAILED';
    return {reason, ...completion, runtimeThreadId: threadId, usage: usage || {source: 'unavailable'}, eventCount,
      elapsedMs: Math.round(performance.now() - started), outputBytes, stdoutSha256: stdoutHash.digest('hex'),
      stderrSha256: stderrHash.digest('hex'), invocationSha256: hash(canonical({executable: capsule.runtime.executable, args})),
      telemetry: telemetry.summary(), promptBytes: Buffer.byteLength(promptFor(capsule)),
      sourceContextBytes: capsule.sourceContext ? Buffer.byteLength(canonical(capsule.sourceContext)) : 0,
      rawTranscriptRetained: false, backendIdentity: 'NOT_ATTESTED', descendantCleanup: 'NOT_ATTESTED'};
  } finally {
    clearTimeout(deadline); clearTimeout(killTimer); clearTimeout(drainTimer); clearInterval(fileTimer);
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); process.removeListener('SIGHUP', interrupt);
    if (!closed) signal('SIGKILL');
  }
}
async function run(options) {
  if (process.env.VULPORA_SESSION_DEPTH) fail('RECURSIVE_SESSION_FORBIDDEN');
  const loaded = loadCapsule(options.capsule);
  const {capsule, attemptDir, capsuleSha256} = loaded;
  if (fs.existsSync(path.join(attemptDir, 'launch.json')) || fs.existsSync(path.join(attemptDir, 'result.json'))) fail('ATTEMPT_ALREADY_STARTED');
  if (Date.now() > Date.parse(capsule.expiresAt)) fail('STALE_SESSION_ROUTE');
  if (hash(regularFile(capsule.runtime.executable, 256 * 1024 * 1024)) !== capsule.runtime.sha256) fail('RUNTIME_CHANGED');
  const schema = readJson(path.join(attemptDir, 'output.schema.json'), 65536);
  if (hash(canonical(schema)) !== hash(canonical(readJson(CANDIDATE_SCHEMA_PATH, 65536)))
    || hash(regularFile(CANDIDATE_SCHEMA_PATH, 65536)) !== capsule.outputSchemaSha256) fail('OUTPUT_SCHEMA_CHANGED');
  if (canonical(snapshot(capsule.task, attemptDir)) !== canonical(capsule.workspace)) fail('STALE_WORKSPACE');
  if (Buffer.byteLength(promptFor(capsule)) > capsule.task.limits.maxPromptBytes) fail('PROMPT_BUDGET_EXCEEDED');
  // Recheck the live ledger atomically: two prepared capsules may have seen the
  // same balance, but cannot both spend the same reserved tokens at dispatch.
  const reservation = reserveBudget(capsule.budget.file, {budgetId: capsule.budget.id,
    attemptId: capsule.attemptId, capsuleSha256, estimatedTokens: capsule.route.estimatedTokens,
    relativeUnits: capsule.route.relativeUnits});
  try { writeNew(path.join(attemptDir, 'launch.json'), {schema: 'vulpora.session-launch/v1',
    attemptId: capsule.attemptId, capsuleSha256, startedAt: new Date().toISOString()}); }
  catch (error) { if (error.code === 'EEXIST') fail('ATTEMPT_ALREADY_STARTED'); throw error; }
  let runtime;
  try { runtime = await execute(capsule, attemptDir); }
  catch (error) { runtime = {reason: /^[A-Z_]+$/.test(error.code || '') ? error.code : 'RUNTIME_EXECUTION_FAILED',
    usage: {source: 'unavailable'}, closeObserved: false, backendIdentity: 'NOT_ATTESTED', descendantCleanup: 'NOT_ATTESTED'}; }
  let candidate = null, after = null, reason = runtime.reason;
  try {
    if (hash(regularFile(loaded.absolute, 1024 * 1024)) !== capsuleSha256) fail('CAPSULE_CHANGED_DURING_EXECUTION');
    if (hash(regularFile(capsule.runtime.executable, 256 * 1024 * 1024)) !== capsule.runtime.sha256) fail('RUNTIME_CHANGED_DURING_EXECUTION');
    after = snapshot(capsule.task, attemptDir);
    if (!reason) candidate = validateCandidate(readJson(path.join(attemptDir, 'candidate.json'), capsule.task.limits.maxResultBytes), capsule);
    if (capsule.task.mode === 'read-only' && canonical(after) !== canonical(capsule.workspace)) fail('READ_ONLY_WORKSPACE_CHANGED');
  } catch (error) { reason ||= error.code === 'ENOENT' ? 'CANDIDATE_MISSING' : (/^[A-Z_]+$/.test(error.message) ? error.message : 'CANDIDATE_INVALID'); }
  const changed = after ? capsule.task.files.filter(file => after.files[file] !== capsule.workspace.files[file]) : [];
  const result = {schema: 'vulpora.session-result/v1', taskId: capsule.task.id, attemptId: capsule.attemptId, capsuleSha256,
    status: reason ? 'failed' : candidate.status, execution: reason ? 'FAILED' : 'EXIT_ZERO', reason: reason || null,
    verification: 'NOT_VERIFIED', mutationState: reason ? 'unknown' : canonical(after) === canonical(capsule.workspace) ? 'effect_none' : 'known_effect',
    scopedFilesChanged: changed, requestedRoute: {model: capsule.route.model, reasoning_effort: capsule.route.reasoning_effort},
    candidate: reason ? null : candidate, runtime, retryAllowed: false,
    budget: {...reservation, status: 'RECONCILIATION_REQUIRED'}};
  // Preserve observed usage before accounting so interrupted settlement can be
  // retried from this artifact without launching a model or trusting worker text.
  try { writeNew(path.join(attemptDir, 'result.json'), result); }
  catch (error) { error.execution = 'UNKNOWN'; throw error; }
  try { result.budget = reconcile({capsule: loaded.absolute}).budget; }
  catch (error) { result.budget.reason = /^[A-Z_]+$/.test(error.code || error.message || '') ? (error.code || error.message) : 'BUDGET_SETTLEMENT_FAILED'; }
  return result;
}
async function main(args = process.argv.slice(2)) {
  const command = args[0], options = {};
  const commands = {
    prepare: {allowed: ['task', 'catalog', 'out', 'policy', 'budget'], required: ['task']},
    run: {allowed: ['capsule'], required: ['capsule']},
    status: {allowed: ['capsule', 'detail'], required: ['capsule']},
    reconcile: {allowed: ['capsule'], required: ['capsule']},
    'budget-init': {allowed: ['out', 'tokens', 'units'], required: ['out', 'tokens', 'units']},
    'budget-status': {allowed: ['budget'], required: ['budget']},
  };
  if (!Object.hasOwn(commands, command)) fail('USAGE_SESSION_COMMAND');
  for (let index = 1; index < args.length; index++) {
    const key = args[index]?.slice(2);
    if (!args[index]?.startsWith('--') || !commands[command].allowed.includes(key)
      || Object.hasOwn(options, key)) fail('INVALID_ARGUMENTS');
    if (key === 'detail') options[key] = true;
    else {
      if (!args[index + 1] || args[index + 1].startsWith('--')) fail('INVALID_ARGUMENTS');
      options[key] = args[++index];
    }
  }
  if (commands[command].required.some(key => !options[key])) fail('MISSING_ARGUMENT');
  if (['prepare', 'run', 'reconcile', 'budget-init'].includes(command) && process.env.VULPORA_SESSION_DEPTH) fail('RECURSIVE_SESSION_FORBIDDEN');
  if (command === 'budget-init') return initBudget(path.resolve(options.out),
    {totalTokens: Number(options.tokens), maxRelativeUnits: Number(options.units)});
  if (command === 'budget-status') return readBudget(path.resolve(options.budget));
  return command === 'prepare' ? prepare(options) : command === 'run' ? run(options)
    : command === 'reconcile' ? reconcile(options) : status(options);
}
function errorResult(error) {
  const reason = /^[A-Z_]+$/.test(error.code || '') ? error.code
    : /^[A-Z_]+$/.test(error.message || '') ? error.message : 'INVALID_OR_CHANGED_SESSION_INPUT';
  return {schema: 'vulpora.session-error/v1', status: 'BLOCKED', reason, execution: error.execution || 'NOT_RUN'};
}
module.exports = {main, prepare, run, status, reconcile, validateTask, validateCandidate, promptFor, errorResult};
if (require.main === module) main().then(result => {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (['failed', 'blocked'].includes(result.status)) process.exitCode = 3;
}).catch(error => {
  process.stderr.write(`${JSON.stringify(errorResult(error))}\n`);
  process.exitCode = 2;
});
