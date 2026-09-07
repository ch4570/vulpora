#!/usr/bin/env bash
set -eu
set -f
DIR="$(cd "$(dirname "$0")" && pwd -P)"
node - "$DIR/.." <<'NODE'
'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const root = path.resolve(process.argv[2]);
const adapter = path.join(root, 'evals/behavioral/adapters');
const template = JSON.parse(fs.readFileSync(path.join(root, 'skills/start-task/reference/kb/orchestration-report.valid.json')));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-child-evidence-'));
let checks = 0;
const copy = (value) => JSON.parse(JSON.stringify(value));
function scenario() {
  const report = copy(template), id = report.runtime_configuration_id;
  const routes = new Map(report.routing_attempts.map((entry) => [`${entry.task_id}:${entry.attempt_id}`, entry]));
  const evidence = {
    schema_version: 'vulpora.start-task-evidence/v1', workflow_contract: 'vulpora.start-task/v1',
    run_id: report.run_id, runtime_instance_id: report.runtime_instance_id, runtime_configuration_id: id,
    runtime: report.runtime, runtime_entrypoint: report.runtime_entrypoint,
    runtime_configuration_identity: {initialized: id, before_discovery: id, terminal: id, stable: true,
      active_configuration_before: 'b'.repeat(64), active_configuration_after: 'b'.repeat(64),
      active_authentication_before: 'c'.repeat(64), active_authentication_after: 'c'.repeat(64), active_state_stable: true},
    runtime_activation: {fresh_install: true, fresh_runtime_instance: true, cached_discovery_used: false,
      invocation_label: report.runtime_entrypoint, discovered_skill: 'start-task',
      discovered_agents: ['requirement-dialogue', 'task-splitter', 'task-orchestrator']},
    phase_transitions: ['clarify', 'approve', 'split', 'execute', 'integrate', 'verify', 'terminal']
      .map((name, index) => ({name, sequence: index + 1, source: 'independent test fixture'})),
    actual_test: {argv: ['./run-offline.sh', 'node', '--test'], exit_code: 0, timeout_seconds: 60},
    network: {fixture_subprocess_attempts: 0, fixture_subprocess_successes: 0, probe_attempts: 1, probe_successes: 0, probe_exit: 77},
    integration: {performed_by: 'primary-owner', diff_inspected: true},
    cleanup: {attempted: true, completed: true, owned_paths_removed: true, owned_children_stopped: true, orphan_processes: 0, timeout_seconds: 30},
  };
  const events = [{direction: 'client_to_runtime', method: 'turn/start', params: {
    input: [{text: '$start-task deterministic fixture'}], sandboxPolicy: {networkAccess: false},
  }}];
  for (const [index, child] of report.children.entries()) {
    const route = routes.get(`${child.handoff.task_id}:${child.handoff.attempt_id}`);
    const model = child.handoff.requested_model || route.runtime_reported_model;
    const effort = child.handoff.requested_reasoning_effort || 'low';
    const taskName = child.agent_id.replace(/-/g, '_'), message = `Bounded independent task handoff for fixture child ${index}.`;
    child.task_argument = message;
    events.push({type: 'function_call', name: 'spawn_agent', namespace: 'collaboration', call_id: `call-${index}`,
      arguments: JSON.stringify({agent_type: child.agent_id, task_name: taskName, message,
        fork_turns: 'none', model, reasoning_effort: effort})});
    events.push({type: 'subAgentActivity', kind: 'started', id: `call-${index}`,
      agentThreadId: child.native_child_id, agentPath: `/root/${taskName}`, model, reasoningEffort: effort});
    events.push({type: 'agent_message', recipient: `/root/${taskName}`, encrypted_content: message});
  }
  return {report, evidence, events, diff: {changed_files: report.changed_files}};
}
const activities = (fixture) => fixture.events.filter((event) => event.type === 'subAgentActivity');
function reroute(fixture, index = 0, override = {}) {
  const child = activities(fixture)[index];
  return {method: 'model/rerouted', params: {threadId: child.agentThreadId, turnId: `turn-${index}`,
    fromModel: child.model, toModel: 'service-selected-model', reason: 'highRiskCyberActivity', ...override}};
}
function withoutObservedRoute(fixture, index = 0) {
  const event = activities(fixture)[index];
  delete event.model;
  delete event.reasoningEffort;
  return event;
}
function requestMutation(fixture, key, value, index = 0) {
  const spawn = fixture.events.filter((event) => event.type === 'function_call')[index];
  const args = JSON.parse(spawn.arguments);
  if (value === undefined) delete args[key]; else args[key] = value;
  spawn.arguments = JSON.stringify(args);
}
function useClaudeEvents(fixture, includeEffort = true) {
  fixture.report.runtime = fixture.evidence.runtime = 'claude-code';
  fixture.report.runtime_entrypoint = fixture.evidence.runtime_entrypoint = '/start-task';
  fixture.evidence.runtime_activation.invocation_label = '/start-task';
  const requested = fixture.events.filter((event) => event.type === 'function_call').map((event) => JSON.parse(event.arguments));
  fixture.events = [{type: 'vulpora_runtime_invocation', entrypoint: '/start-task', network_policy: 'fixture_and_child_commands_denied'}];
  for (const [index, args] of requested.entries()) {
    fixture.report.children[index].native_child_id = `call-${index}`;
    const observed = {model: args.model};
    if (includeEffort) observed.reasoningEffort = args.reasoning_effort;
    fixture.events.push({type: 'tool_use', name: 'Agent', id: `call-${index}`, input: {
      subagent_type: args.agent_type, prompt: args.message, fork_turns: args.fork_turns,
      model: args.model, reasoning_effort: args.reasoning_effort}},
    {type: 'assistant', parent_tool_use_id: `call-${index}`, message: observed},
    {type: 'tool_result', tool_use_id: `call-${index}`, content: `agent_id: child-${index}`});
  }
}
function check(name, mutate = () => {}, expectedError = null, mutateParsed = null) {
  const fixture = scenario();
  mutate(fixture);
  const dir = path.join(work, name);
  fs.mkdirSync(dir);
  for (const key of ['report', 'evidence', 'diff']) fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(fixture[key]));
  fs.writeFileSync(path.join(dir, 'events.jsonl'), fixture.events.map((event) => JSON.stringify(event)).join('\n'));
  const childPath = path.join(dir, 'children.json');
  const extract = spawnSync(process.execPath, [path.join(adapter, 'extract-start-task-child-evidence.js'),
    path.join(dir, 'events.jsonl'), path.join(dir, 'report.json'), childPath], {encoding: 'utf8', timeout: 3000});
  assert.equal(extract.status, 0, `${name}: ${extract.stderr}`);
  const parsed = JSON.parse(fs.readFileSync(childPath));
  if (mutateParsed) { mutateParsed(parsed); fs.writeFileSync(childPath, JSON.stringify(parsed)); }
  const validation = spawnSync(process.execPath, [path.join(adapter, 'validate-start-task-evidence.js'),
    path.join(dir, 'report.json'), path.join(dir, 'evidence.json'), path.join(dir, 'diff.json'), childPath,
    template.run_id, template.runtime_instance_id, fixture.report.runtime], {encoding: 'utf8', timeout: 3000});
  if (expectedError) {
    assert.equal(validation.status, 1, `${name}: weak evidence unexpectedly accepted`);
    assert(validation.stderr.includes(expectedError), `${name}: ${validation.stderr}`);
  } else assert.equal(validation.status, 0, `${name}: ${validation.stderr}`);
  checks += 1;
  return parsed;
}
function rejectEvents(name, mutate) {
  const fixture = scenario();
  mutate(fixture);
  const dir = path.join(work, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(fixture.report));
  fs.writeFileSync(path.join(dir, 'events.jsonl'), fixture.events.map(JSON.stringify).join('\n'));
  const output = path.join(dir, 'children.json');
  const result = spawnSync(process.execPath, [path.join(adapter, 'extract-start-task-child-evidence.js'),
    path.join(dir, 'events.jsonl'), path.join(dir, 'report.json'), output], {encoding: 'utf8', timeout: 3000});
  assert.equal(result.status, 1, `${name}: malformed or suppressed reroute evidence accepted`);
  assert.equal(fs.existsSync(output), false, `${name}: partial evidence must not be emitted`);
  checks += 1;
}
try {
  check('runtime-events-match');
  check('missing-handoff-guard', (x) => { delete x.report.children[0].handoff.forbidden_actions; }, 'child_handoff_0');
  check('stale-run', (x) => { x.evidence.run_id = 'stale'; }, 'evidence.run_id');
  check('stale-instance', (x) => { x.evidence.runtime_instance_id = 'stale'; }, 'evidence.runtime_instance_id');
  check('wrong-schema', (x) => { x.evidence.schema_version = 'legacy'; }, 'evidence_version');
  check('wrong-test-type', (x) => { x.evidence.actual_test.exit_code = '0'; }, 'actual_test');
  check('cached-discovery', (x) => { x.evidence.runtime_activation.cached_discovery_used = true; }, 'runtime_not_fresh');
  check('wrong-entrypoint', (x) => { x.evidence.runtime_entrypoint = '/start-task'; }, 'runtime_entrypoint');
  check('wrong-config', (x) => { x.evidence.runtime_configuration_id = 'd'.repeat(64); }, 'runtime_configuration_provenance');
  check('changed-config', (x) => { x.evidence.runtime_configuration_identity.terminal = 'd'.repeat(64); }, 'runtime_configuration_changed');
  check('changed-auth-state', (x) => { x.evidence.runtime_configuration_identity.active_authentication_after = 'd'.repeat(64); }, 'active_runtime_state_changed');
  check('orchestrator-spawn', () => {}, 'child_set', (x) => { x.task_orchestrator_spawned = true; });
  check('inherited-fork', (x) => requestMutation(x, 'fork_turns', 'all'), 'child_fork_inheritance_0');
  const mismatch = check('actual-model-mismatch', (x) => { activities(x)[0].model = 'backend-not-requested'; }, 'child_request_model_mismatch_0');
  assert.equal(mismatch.children[0].observed_model, 'backend-not-requested');
  assert.equal(mismatch.children[0].requested_model, template.children[0].handoff.requested_model);
  check('actual-effort-mismatch', (x) => { activities(x)[0].reasoningEffort = 'low'; }, 'child_request_reasoning_mismatch_0');
  const absent = check('request-is-not-observation', (x) => { withoutObservedRoute(x); }, 'child_runtime_route_unverified_0');
  assert.equal(absent.children[0].observed_model, 'unavailable');
  assert.equal(absent.children[0].observed_reasoning_effort, 'unavailable');
  assert.equal(absent.children[0].runtime_observation_status, 'unavailable');
  check('missing-model-only', (x) => { delete activities(x)[0].model; }, 'child_runtime_route_unverified_0');
  check('missing-effort-only', (x) => { delete activities(x)[0].reasoningEffort; }, 'child_runtime_route_unverified_0');
  check('missing-execution-observation', (x) => { withoutObservedRoute(x, 2); }, 'child_runtime_route_unverified_2');
  check('missing-execution-request', (x) => requestMutation(x, 'model', undefined, 2), 'execution_child_spawn_override_2');
  check('report-claim-is-not-observation', (x) => {
    withoutObservedRoute(x); x.report.children[0].runtime_reported_model = x.report.children[0].handoff.requested_model;
  }, 'child_runtime_route_unverified_0');
  check('outbound-event-is-not-observation', (x) => {
    const observed = copy(activities(x)[0]); withoutObservedRoute(x);
    x.events.push({...observed, direction: 'client_to_runtime'});
  }, 'child_runtime_route_unverified_0');
  check('parent-response-not-child', (x) => {
    const observed = copy(activities(x)[0]); withoutObservedRoute(x);
    x.events.push({direction: 'client_to_runtime', id: 100, method: 'thread/start'},
      {id: 100, result: {thread: {id: 'parent-thread'}, model: observed.model, reasoningEffort: observed.reasoningEffort}});
  }, 'child_runtime_route_unverified_0');
  check('unsolicited-response-not-child', (x) => {
    const observed = copy(activities(x)[0]); withoutObservedRoute(x);
    x.events.push({id: 100, result: {thread: {id: observed.agentThreadId}, model: observed.model, reasoningEffort: observed.reasoningEffort}});
  }, 'child_runtime_route_unverified_0');
  check('child-thread-response', (x) => {
    const observed = copy(activities(x)[0]); withoutObservedRoute(x);
    x.events.push({direction: 'client_to_runtime', id: 100, method: 'thread/start'},
      {id: 100, result: {thread: {id: observed.agentThreadId}, model: observed.model, reasoningEffort: observed.reasoningEffort}});
  });
  check('child-session-configured', (x) => {
    const observed = copy(activities(x)[0]); withoutObservedRoute(x);
    x.events.push({method: 'codex/event/session_configured', params: {msg: {type: 'session_configured',
      session_id: observed.agentThreadId, model: observed.model, reasoning_effort: observed.reasoningEffort}}});
  });
  check('conflicting-runtime-models', (x) => {
    x.events.push({...copy(activities(x)[0]), model: 'conflicting-model'});
  }, 'child_runtime_route_unverified_0');
  check('conflicting-runtime-efforts', (x) => {
    x.events.push({...copy(activities(x)[0]), reasoningEffort: 'low'});
  }, 'child_runtime_route_unverified_0');
  const rerouted = check('late-child-service-reroute', (x) => {
    x.events.push(reroute(x));
  }, 'child_runtime_route_unverified_0');
  assert.equal(rerouted.children[0].runtime_observation_status, 'rerouted');
  assert.equal(rerouted.children[0].observed_model, 'unavailable');
  assert.equal(rerouted.children[0].observed_reasoning_effort, 'unavailable');
  assert(rerouted.children[0].runtime_observation_evidence.some((entry) =>
    entry.source === 'codex:model/rerouted' && entry.turn_id === 'turn-0'
      && entry.from_model === template.children[0].handoff.requested_model));
  check('reroute-back-cannot-erase-transition', (x) => {
    x.events.push(reroute(x), reroute(x, 0, {
      fromModel: 'service-selected-model', toModel: activities(x)[0].model}));
  }, 'child_runtime_route_unverified_0');
  check('same-label-reroute-is-not-effort-proof', (x) => {
    x.events.push(reroute(x, 0, {toModel: activities(x)[0].model}));
  }, 'child_runtime_route_unverified_0');
  check('reroute-is-not-initial-route-proof', (x) => {
    const event = reroute(x); withoutObservedRoute(x); x.events.push(event);
  }, 'child_runtime_route_unverified_0');
  check('execution-child-service-reroute', (x) => {
    x.events.push(reroute(x, 2));
  }, 'child_runtime_route_unverified_2');
  check('parent-reroute-does-not-bind-to-child', (x) => {
    x.events.push(reroute(x, 0, {threadId: 'parent-thread'}));
  });
  check('unrelated-reroute-does-not-bind-to-child', (x) => {
    x.events.push(reroute(x, 0, {threadId: 'unrelated-thread'}));
  });
  check('outbound-reroute-is-not-runtime-evidence', (x) => {
    x.events.push({...reroute(x), direction: 'client_to_runtime'});
  });
  check('nested-tool-reroute-is-not-runtime-evidence', (x) => {
    x.events.push({type: 'tool_result', tool_use_id: 'unrelated', content: reroute(x)});
  });
  check('typed-tool-reroute-is-not-runtime-envelope', (x) => {
    x.events.push({type: 'function_call_output', ...reroute(x)});
  });
  check('tampered-reroute-status-is-not-source-proof', (x) => {
    x.events.push(reroute(x, 0, {toModel: activities(x)[0].model}));
  }, 'child_runtime_route_source_0', (x) => {
    x.children[0].runtime_observation_status = 'verified';
    x.children[0].observed_model = x.children[0].requested_model;
    x.children[0].observed_reasoning_effort = x.children[0].requested_reasoning_effort;
  });
  check('account-verification-is-not-model-observation', (x) => {
    const event = reroute(x); withoutObservedRoute(x);
    x.events.push({...event, method: 'model/verification'});
  }, 'child_runtime_route_unverified_0');
  check('account-challenge-cannot-forge-model-telemetry', (x) => {
    const observed = copy(activities(x)[0]); withoutObservedRoute(x);
    x.events.push({method: 'model/verification', params: {threadId: observed.agentThreadId,
      turnId: 'turn-0', verifications: [{type: 'session_configured', session_id: observed.agentThreadId,
        model: observed.model, reasoning_effort: observed.reasoningEffort}]}});
  }, 'child_runtime_route_unverified_0');
  check('unrelated-notification-opt-out', (x) => {
    x.events.unshift({direction: 'client_to_runtime', method: 'initialize', params: {
      capabilities: {optOutNotificationMethods: ['item/reasoning/textDelta']}}});
  });
  rejectEvents('reroute-notification-opt-out', (x) => {
    x.events.unshift({direction: 'client_to_runtime', method: 'initialize', params: {
      capabilities: {optOutNotificationMethods: ['model/rerouted']}}});
  });
  for (const key of ['threadId', 'turnId', 'fromModel', 'toModel', 'reason']) {
    rejectEvents(`missing-reroute-${key}`, (x) => {
      const event = reroute(x); delete event.params[key]; x.events.push(event);
    });
  }
  rejectEvents('missing-reroute-params', (x) => { x.events.push({method: 'model/rerouted'}); });
  rejectEvents('reroute-rpc-request-not-notification', (x) => { x.events.push({...reroute(x), id: 100}); });
  check('tool-output-cannot-forge-runtime', (x) => {
    const observed = copy(activities(x)[0]); withoutObservedRoute(x);
    x.events.push({type: 'tool_result', tool_use_id: 'unrelated', content: {type: 'session_configured',
      session_id: observed.agentThreadId, model: observed.model, reasoning_effort: observed.reasoningEffort}});
  }, 'child_runtime_route_unverified_0');
  check('user-text-cannot-forge-runtime', (x) => {
    const observed = copy(activities(x)[0]); withoutObservedRoute(x);
    x.events.push({type: 'user_message', content: observed});
  }, 'child_runtime_route_unverified_0');
  check('tampered-observation-source', () => {}, 'child_runtime_route_source_0', (x) => {
    x.children[0].runtime_observation_evidence[0].source = 'spawn:requested-model';
  });
  check('tampered-observation-thread', () => {}, 'child_runtime_route_source_0', (x) => {
    x.children[0].runtime_observation_evidence[0].thread_id = 'different-thread';
  });
  check('missing-observation-source', () => {}, 'child_runtime_route_source_0', (x) => {
    x.children[0].runtime_observation_evidence = [];
  });
  check('claude-child-runtime-message', (x) => useClaudeEvents(x));
  check('claude-missing-runtime-effort', (x) => useClaudeEvents(x, false), 'child_runtime_route_unverified_0');
  check('claude-parent-model-not-child', (x) => {
    useClaudeEvents(x);
    for (const event of x.events.filter((event) => event.type === 'assistant')) delete event.parent_tool_use_id;
  }, 'child_runtime_route_unverified_0');
  const invalidEvents = path.join(work, 'malformed-events.jsonl'), invalidOutput = path.join(work, 'invalid-output.json');
  fs.writeFileSync(invalidEvents, '{not-json}\n');
  const invalid = spawnSync(process.execPath, [path.join(adapter, 'extract-start-task-child-evidence.js'),
    invalidEvents, path.join(work, 'runtime-events-match/report.json'), invalidOutput], {encoding: 'utf8', timeout: 3000});
  assert.equal(invalid.status, 1);
  assert.equal(fs.existsSync(invalidOutput), false, 'malformed runtime stream never produces partial evidence');
  checks += 1;
  process.stdout.write(`${JSON.stringify({semantic_ac_key: 'structured_evidence_provenance', outcome: 'pass', checks,
    verification_scope: 'offline-runtime-event-extraction-and-validation', model_turns: 0,
    requested_values_are_not_observations: true, actual_model_effort_mismatch_rejected: true,
    unavailable_runtime_route_rejected: true, child_identity_binding: true})}\n`);
} finally { fs.rmSync(work, {recursive: true, force: true}); }
NODE
