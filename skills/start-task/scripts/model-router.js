#!/usr/bin/env node
'use strict';

// A route is selected from explicit operator policy AND a current runtime
// catalog. Resolution is not dispatch, model execution, or billing evidence.
const path = require('node:path');
const { canonical, hash, regularFile, parseJson } = require('./model-routing-io.js');
const PROFILES = ['frugal', 'standard', 'frontier'];
const EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const fail = (code) => { throw new Error(code); };
function fields(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || required.some(key => !Object.hasOwn(value, key))
      || Object.keys(value).some(key => ![...required, ...optional].includes(key))) fail('INVALID_FIELDS');
}
function identifier(value) {
  if (typeof value !== 'string' || value.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/.test(value)
      || value === 'inherit' || value === 'auto') fail('INVALID_IDENTIFIER');
}
function positive(value, maximum = 1e9) {
  if (!Number.isFinite(value) || value <= 0 || value > maximum) fail('INVALID_BUDGET');
}
function uniqueStrings(values, validator = identifier) {
  if (!Array.isArray(values) || !values.length || values.length > 1000) fail('INVALID_LIST');
  values.forEach(validator);
  if (new Set(values).size !== values.length) fail('DUPLICATE_ENTRY');
}
function validatePolicy(policy) {
  fields(policy, ['schema', 'id', 'maxCatalogAgeSeconds', 'profiles', 'runtimes']);
  if (policy.schema !== 'vulpora.model-routing-policy/v1') fail('INVALID_POLICY_SCHEMA');
  identifier(policy.id); positive(policy.maxCatalogAgeSeconds, 86400);
  fields(policy.profiles, PROFILES); fields(policy.runtimes, ['codex', 'claude-code']);
  let previousUnits = 0;
  for (const profile of PROFILES) {
    const entry = policy.profiles[profile];
    fields(entry, ['effort', 'relativeUnits']); positive(entry.relativeUnits);
    if (!EFFORTS.includes(entry.effort) || entry.relativeUnits <= previousUnits) fail('INVALID_PROFILE');
    previousUnits = entry.relativeUnits;
  }
  for (const entries of Object.values(policy.runtimes)) {
    fields(entries, PROFILES);
    for (const models of Object.values(entries)) uniqueStrings(models);
  }
  return policy;
}
function validateCatalog(catalog, runtime, now, maxAgeSeconds) {
  if (!Number.isSafeInteger(now) || now < 0) fail('INVALID_CLOCK');
  positive(maxAgeSeconds, 86400);
  fields(catalog, ['schema', 'runtime', 'source', 'observedAt', 'models']);
  if (catalog.schema !== 'vulpora.runtime-model-catalog/v1' || catalog.runtime !== runtime) fail('CATALOG_RUNTIME_MISMATCH');
  identifier(catalog.source);
  const observed = Date.parse(catalog.observedAt);
  if (typeof catalog.observedAt !== 'string' || !Number.isFinite(observed)
      || new Date(observed).toISOString() !== catalog.observedAt || observed > now
      || now - observed > maxAgeSeconds * 1000) fail('STALE_CATALOG');
  if (!Array.isArray(catalog.models) || catalog.models.length === 0 || catalog.models.length > 10000) fail('EMPTY_CATALOG');
  const ids = new Set();
  for (const model of catalog.models) {
    fields(model, ['id', 'reasoningEfforts']); identifier(model.id);
    if (ids.has(model.id)) fail('DUPLICATE_MODEL'); ids.add(model.id);
    // A visible model with no reasoning control must not poison other routes.
    if (!Array.isArray(model.reasoningEfforts) || model.reasoningEfforts.length > 1000) fail('INVALID_LIST');
    if (model.reasoningEfforts.length) uniqueStrings(model.reasoningEfforts, effort => {
      if (typeof effort !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(effort)) fail('INVALID_EFFORT');
    });
  }
  return catalog;
}
function resolveRoute(request, catalog, policy, now = Date.now()) {
  validatePolicy(policy);
  fields(request, ['runtime', 'profile', 'risk', 'kind', 'maxRelativeUnits', 'estimatedTokens', 'remainingTokens']);
  if (!['codex', 'claude-code'].includes(request.runtime) || !PROFILES.includes(request.profile)
      || !['low', 'high'].includes(request.risk) || !['deterministic', 'native-subagent', 'independent-session'].includes(request.kind)) fail('INVALID_REQUEST');
  for (const key of ['maxRelativeUnits', 'estimatedTokens', 'remainingTokens']) {
    if (!Number.isFinite(request[key]) || request[key] < 0 || request[key] > 1e9) fail('INVALID_BUDGET');
  }
  if (!Number.isSafeInteger(request.estimatedTokens) || !Number.isSafeInteger(request.remainingTokens)) fail('INVALID_BUDGET');
  if (request.kind === 'deterministic') return {
    schema: 'vulpora.model-route/v1', status: 'NO_MODEL', runtime: request.runtime,
    model: null, reasoning_effort: null, relativeUnits: 0, estimatedTokens: 0, execution: 'NOT_RUN'
  };
  positive(request.estimatedTokens);
  validateCatalog(catalog, request.runtime, now, policy.maxCatalogAgeSeconds);
  const profile = request.risk === 'high' ? 'frontier' : request.profile;
  const { effort, relativeUnits } = policy.profiles[profile];
  if (relativeUnits > request.maxRelativeUnits || request.estimatedTokens > request.remainingTokens) fail('BUDGET_EXCEEDED');
  const rejected = [];
  let selected;
  for (const id of policy.runtimes[request.runtime][profile]) {
    const exposed = catalog.models.find(model => model.id === id);
    if (!exposed) { rejected.push({ model: id, reason: 'NOT_EXPOSED' }); continue; }
    if (!exposed.reasoningEfforts.includes(effort)) { rejected.push({ model: id, reason: 'EFFORT_UNSUPPORTED' }); continue; }
    selected = id; break;
  }
  if (!selected) fail('ROUTE_UNAVAILABLE');
  return {
    schema: 'vulpora.model-route/v1', status: 'RESOLVED', runtime: request.runtime,
    profile, requestedProfile: request.profile, riskFloorApplied: request.risk === 'high',
    model: selected, reasoning_effort: effort, relativeUnits, estimatedTokens: request.estimatedTokens,
    ...(request.kind === 'independent-session' ? {
      executionKind: 'independent-session', nativeArguments: null,
      sessionArguments: { model: selected, reasoning_effort: effort, inheritHistory: false },
    } : { nativeArguments: request.runtime === 'codex'
      ? { model: selected, reasoning_effort: effort, fork_turns: 'none' }
      : { model: selected } }),
    agentFileSettings: request.runtime === 'codex'
      ? { model: selected, model_reasoning_effort: effort }
      : { model: selected, effort },
    inheritanceUsed: false, execution: 'NOT_RUN', rejected,
    preflight: { status: 'NOT_CHECKED' },
    evidence: { requestSha256: hash(canonical(request)), policySha256: hash(canonical(policy)),
      catalogSha256: hash(canonical(catalog)), catalogSource: catalog.source, observedAt: catalog.observedAt },
    budgetScope: 'per-attempt-estimate-not-billing-enforcement'
  };
}

function verifyObservedRoute(route, observed) {
  fields(observed, ['runtime', 'model', 'reasoning_effort', 'source']);
  if (route?.schema !== 'vulpora.model-route/v1' || route.status !== 'RESOLVED') fail('INVALID_ROUTE');
  identifier(route.model);
  if (!['codex', 'claude-code'].includes(route.runtime) || !EFFORTS.includes(route.reasoning_effort)) fail('INVALID_ROUTE');
  if (!['runtime-event', 'runtime-config'].includes(observed.source)) fail('UNOBSERVED_ROUTE');
  if (observed.runtime !== route.runtime || observed.model !== route.model
      || observed.reasoning_effort !== route.reasoning_effort) fail('RUNTIME_ROUTE_MISMATCH');
  return { status: 'MATCHED', source: observed.source, backendIdentity: 'NOT_ATTESTED' };
}

// Only parse leading metadata, never instructions or embedded examples. A
// conflicting custom Codex model/effort takes precedence over native spawn args.
function checkAgentSettings(route, settings, env = {}) {
  if (route?.status !== 'RESOLVED' || !['codex', 'claude-code'].includes(route.runtime)) fail('INVALID_ROUTE');
  identifier(route.model);
  if (!EFFORTS.includes(route.reasoning_effort)) fail('INVALID_ROUTE');
  fields(settings, [], route.runtime === 'codex' ? ['model', 'model_reasoning_effort'] : ['model', 'effort']);
  if (route.runtime === 'codex') {
    if ((settings.model !== undefined && settings.model !== route.model)
        || (settings.model_reasoning_effort !== undefined && settings.model_reasoning_effort !== route.reasoning_effort)) fail('AGENT_CONFIG_OVERRIDES_ROUTE');
  } else {
    if (env.CLAUDE_CODE_SUBAGENT_MODEL && env.CLAUDE_CODE_SUBAGENT_MODEL !== route.model) fail('ENV_OVERRIDES_ROUTE');
    if (env.CLAUDE_CODE_EFFORT_LEVEL && env.CLAUDE_CODE_EFFORT_LEVEL !== route.reasoning_effort) fail('ENV_OVERRIDES_ROUTE');
    if ((env.CLAUDE_CODE_EFFORT_LEVEL || settings.effort) !== route.reasoning_effort) fail('AGENT_EFFORT_NOT_CONFIGURED');
  }
  return true;
}
function readAgentSettings(filename, runtime) {
  const text = regularFile(path.resolve(filename), 2 * 1024 * 1024).toString('utf8');
  const settings = {}, seen = new Set(), lines = text.split(/\r?\n/);
  let end = false, bodyDelimiter = null, table = false;
  if (runtime === 'claude-code' && lines.shift() !== '---') fail('UNSUPPORTED_AGENT_CONFIG');
  for (const line of lines) {
    if (bodyDelimiter) {
      if (line === bodyDelimiter) { bodyDelimiter = null; end = true; }
      continue;
    }
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (runtime === 'claude-code' && line === '---') { end = true; break; }
    if (runtime === 'codex' && /^developer_instructions = ("""|''')$/.test(line)) {
      if (end || table) fail('UNSUPPORTED_AGENT_CONFIG');
      bodyDelimiter = line.endsWith("'''") ? "'''" : '"""'; continue;
    }
    if (runtime === 'codex' && /^\[/.test(line)) {
      if (!end || !/^\[(history|mcp_servers\.[a-z0-9-]+)\]$/.test(line)) fail('UNSUPPORTED_AGENT_CONFIG');
      table = true; continue;
    }
    if (table) continue;
    if (runtime === 'claude-code' && /^\s/.test(line)) continue; // nested metadata / folded description
    const entry = runtime === 'codex' ? line.match(/^([a-z_]+) = (.+)$/) : line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?: +(.*))?$/);
    if (!entry || seen.has(entry[1])) fail('UNSUPPORTED_AGENT_CONFIG');
    const [, key, raw] = entry; seen.add(key);
    if (runtime === 'codex' && !['name', 'description', 'model', 'model_reasoning_effort', 'approval_policy',
      'sandbox_mode', 'web_search', 'allow_login_shell'].includes(key)) fail('UNSUPPORTED_AGENT_CONFIG');
    const keys = runtime === 'codex' ? ['model', 'model_reasoning_effort'] : ['model', 'effort'];
    if (keys.includes(key)) {
      const scalar = runtime === 'codex' ? raw.match(/^"([A-Za-z0-9][A-Za-z0-9._:/+-]*)"$/)
        : (raw || '').match(/^(?:"([A-Za-z0-9][A-Za-z0-9._:/+-]*)"|'([A-Za-z0-9][A-Za-z0-9._:/+-]*)'|([A-Za-z0-9][A-Za-z0-9._:/+-]*))$/);
      if (!scalar) fail('UNSUPPORTED_AGENT_CONFIG');
      settings[key] = scalar.slice(1).find(value => value !== undefined);
    }
  }
  if (!end || bodyDelimiter) fail('UNSUPPORTED_AGENT_CONFIG');
  return { settings, sha256: hash(text) };
}
function readJson(filename) {
  return parseJson(regularFile(path.resolve(filename), 2 * 1024 * 1024).toString('utf8'));
}
function main(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!['--runtime', '--profile', '--risk', '--kind', '--catalog', '--policy', '--max-units', '--estimated-tokens', '--remaining-tokens', '--agent-config', '--task-type', '--difficulty'].includes(key)
        || options[key] !== undefined || !args[index + 1] || args[index + 1].startsWith('--')) fail('INVALID_ARGUMENTS');
    options[key] = args[index + 1];
  }
  const policy = readJson(options['--policy'] || path.join(__dirname, 'model-routing-policy.json'));
  const shared = { runtime: options['--runtime'], risk: options['--risk'] || 'low',
    maxRelativeUnits: Number(options['--max-units'] || 30), estimatedTokens: Number(options['--estimated-tokens'] || 4000),
    remainingTokens: Number(options['--remaining-tokens'] || 4000) };
  let request, route;
  if (options['--task-type'] !== undefined || options['--difficulty'] !== undefined) {
    if (!options['--task-type']) fail('TASK_TYPE_REQUIRED');
    request = { ...shared, taskType: options['--task-type'], difficulty: options['--difficulty'] || 'moderate',
      ...(options['--profile'] ? { profile: options['--profile'] } : {}),
      ...(options['--kind'] ? { kind: options['--kind'] } : {}) };
    if (request.taskType !== 'deterministic' && !options['--catalog']) fail('CATALOG_REQUIRED');
    route = require('./task-router.js').resolveTaskRoute(request,
      options['--catalog'] ? readJson(options['--catalog']) : null, policy);
  } else {
    request = { ...shared, profile: options['--profile'], kind: options['--kind'] || 'native-subagent' };
    if (request.kind !== 'deterministic' && !options['--catalog']) fail('CATALOG_REQUIRED');
    route = resolveRoute(request, options['--catalog'] ? readJson(options['--catalog']) : null, policy);
  }
  if (route.status === 'RESOLVED' && options['--agent-config']) {
    if (route.executionKind === 'independent-session') fail('SESSION_HAS_NO_NATIVE_AGENT_CONFIG');
    const agent = options['--agent-config'] === 'none'
      ? { settings: {}, sha256: null } : readAgentSettings(options['--agent-config'], request.runtime);
    checkAgentSettings(route, agent.settings, process.env);
    route.preflight = { status: 'CONFIG_CHECKED', agentConfigSha256: agent.sha256,
      scope: 'supplied-agent-file-and-current-process-env-not-live-host-attestation' };
  }
  return route;
}
module.exports = { validatePolicy, validateCatalog, resolveRoute, verifyObservedRoute, checkAgentSettings, readAgentSettings, main };
if (require.main === module) {
  try { process.stdout.write(JSON.stringify(main(process.argv.slice(2)), null, 2) + '\n'); }
  catch (error) {
    process.stderr.write(JSON.stringify({ status: 'BLOCKED', reason: /^[A-Z_]+$/.test(error.message) ? error.message : 'INVALID_INPUT' }) + '\n');
    process.exitCode = 2;
  }
}
