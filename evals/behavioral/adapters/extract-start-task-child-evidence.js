#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const unavailable = 'unavailable';
const present = (value) => typeof value === 'string' && value.length > 0 && value !== unavailable;

function extractChildEvidence(messages, report) {
  const spawns = [], activities = [], deliveries = [], toolResults = [], observations = [];
  const threadRequests = new Map();
  for (const message of messages) {
    if (report.runtime === 'codex' && message.direction === 'client_to_runtime' && message.method === 'initialize') {
      const suppressed = message.params?.capabilities?.optOutNotificationMethods;
      if (suppressed !== undefined && (!Array.isArray(suppressed) || suppressed.includes('model/rerouted'))) {
        throw new Error('model_reroute_notifications_disabled');
      }
    }
    if (message.direction === 'client_to_runtime' && ['thread/start', 'thread/resume', 'thread/fork'].includes(message.method)) {
      threadRequests.set(message.id, message.method);
    }
  }
  function observe(source, eventIndex, value, binding) {
    const model = present(value.model) ? value.model : unavailable;
    const effort = value.reasoningEffort ?? value.reasoning_effort;
    observations.push({source, event_index: eventIndex, model,
      reasoning_effort: present(effort) ? effort : unavailable, ...binding});
  }
  function visit(value, eventIndex) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'function_call' && value.name === 'spawn_agent' && value.namespace === 'collaboration') {
      try { spawns.push({call_id: value.call_id, args: JSON.parse(value.arguments)}); } catch {}
      return;
    }
    if (value.type === 'tool_use' && value.name === 'Agent' && typeof value.input?.subagent_type === 'string') {
      spawns.push({call_id: value.id, args: {agent_type: value.input.subagent_type,
        task_name: value.input.subagent_type.replace(/-/g, '_'), message: value.input.prompt,
        fork_turns: value.input.fork_turns, model: value.input.model, reasoning_effort: value.input.reasoning_effort}});
      return;
    }
    if (value.type === 'tool_result') {
      if (typeof value.tool_use_id === 'string') toolResults.push(value);
      return; // Tool-returned JSON must never impersonate runtime telemetry.
    }
    if (['function_call_output', 'user_message', 'userMessage', 'agentMessage'].includes(value.type)) return;
    if (value.type === 'agent_message') {
      if (typeof value.recipient === 'string') deliveries.push(value);
      return;
    }
    if (value.type === 'subAgentActivity' && value.kind === 'started') {
      activities.push(value);
      if (report.runtime === 'codex') observe('codex:subAgentActivity', eventIndex, value, {
        call_id: value.id, thread_id: value.agentThreadId, agent_path: value.agentPath,
      });
      return;
    }
    if (report.runtime === 'codex' && value.type === 'session_configured') {
      observe('codex:session_configured', eventIndex, value, {thread_id: value.session_id});
      return;
    }
    for (const nested of Object.values(value)) visit(nested, eventIndex);
  }
  messages.forEach((message, eventIndex) => {
    // Outbound requests are selection intent, never runtime observation.
    if (message.direction === 'client_to_runtime') return;
    // Account-verification payloads are not model configuration telemetry,
    // including objects nested inside their service-provided challenge data.
    if (report.runtime === 'codex' && message.method === 'model/verification') return;
    // Service reroutes are top-level RPC notifications, never model/tool prose.
    // Keep them as negative evidence even if a later event returns to the same
    // model label: the initial effort/config is not proof for the changed turn.
    if (report.runtime === 'codex' && message.type === undefined && message.method === 'model/rerouted') {
      const params = message.params;
      if (Object.hasOwn(message, 'id') || !params || typeof params !== 'object' || Array.isArray(params)
        || !['threadId', 'turnId', 'fromModel', 'toModel', 'reason'].every((key) => present(params[key]))) {
        throw new Error('invalid_model_rerouted_notification');
      }
      observe('codex:model/rerouted', eventIndex, {model: params.toModel}, {
        thread_id: params.threadId, turn_id: params.turnId, from_model: params.fromModel,
      });
      return;
    }
    if (report.runtime === 'codex' && threadRequests.has(message.id) && !message.error && message.result?.thread?.id) {
      observe('codex:thread-response', eventIndex, message.result, {thread_id: message.result.thread.id});
    }
    if (report.runtime === 'claude-code' && present(message.parent_tool_use_id)) {
      if (message.type === 'assistant' && message.message) {
        observe('claude-code:assistant-message', eventIndex, message.message, {call_id: message.parent_tool_use_id});
      } else if (message.type === 'system' && message.subtype === 'init') {
        observe('claude-code:system-init', eventIndex, message, {call_id: message.parent_tool_use_id});
      }
    }
    visit(message, eventIndex);
  });
  function resultIds(result) {
    const ids = [];
    for (const match of JSON.stringify(result || {}).matchAll(/(?:agentId|agent_id)[^A-Za-z0-9._/-]+([A-Za-z0-9._/-]{6,})/g)) ids.push(match[1]);
    return ids;
  }
  function encrypted(value) {
    if (!value || typeof value !== 'object') return [];
    return [...(typeof value.encrypted_content === 'string' ? [value.encrypted_content] : []),
      ...Object.values(value).flatMap(encrypted)];
  }
  const children = report.children.map((child) => {
    const candidates = spawns.filter((entry) => entry.args.agent_type === child.agent_id);
    const spawn = candidates.find((entry) => report.runtime === 'codex'
      ? activities.some((activity) => activity.id === entry.call_id
        && [activity.agentThreadId, activity.agentPath].includes(child.native_child_id))
      : toolResults.some((result) => result.tool_use_id === entry.call_id && !result.is_error
        && [entry.call_id, ...resultIds(result)].includes(child.native_child_id)));
    const activity = spawn && activities.find((entry) => entry.id === spawn.call_id);
    const toolResult = spawn && toolResults.find((entry) => entry.tool_use_id === spawn.call_id && !entry.is_error);
    const delivered = report.runtime === 'codex'
      ? spawn && deliveries.find((entry) => entry.recipient.endsWith(`/${String(spawn.args.task_name || '').replace(/-/g, '_')}`)
        && encrypted(entry).includes(spawn.args.message)) : toolResult;
    const runtimeIds = report.runtime === 'codex' ? (activity ? [activity.agentThreadId, activity.agentPath] : [])
      : [spawn?.call_id, ...resultIds(toolResult)];
    const boundObservations = observations.filter((entry) => {
      const expected = {call_id: spawn?.call_id, thread_id: activity?.agentThreadId, agent_path: activity?.agentPath};
      const bindings = Object.keys(expected).filter((key) => present(entry[key]));
      return !!spawn && bindings.length > 0 && bindings.every((key) => entry[key] === expected[key]);
    });
    const modelValues = [...new Set(boundObservations.map((entry) => entry.model).filter(present))];
    const effortValues = [...new Set(boundObservations.map((entry) => entry.reasoning_effort).filter(present))];
    const conflict = modelValues.length > 1 || effortValues.length > 1;
    const rerouted = boundObservations.some((entry) => entry.source === 'codex:model/rerouted');
    return {
      agent_id: child.agent_id, native_child_id: child.native_child_id,
      runtime_thread_id: activity?.agentThreadId || null, runtime_agent_path: activity?.agentPath || null,
      reported_id_matches_runtime: runtimeIds.includes(child.native_child_id),
      matched: !!spawn && (report.runtime === 'codex' ? !!activity : !!toolResult), delivery_matched: !!delivered,
      argument_sha256: spawn && typeof spawn.args.message === 'string'
        ? crypto.createHash('sha256').update(spawn.args.message).digest('hex') : null,
      argument_bytes: spawn ? Buffer.byteLength(spawn.args.message || '') : 0,
      spawn_call_id: spawn?.call_id || null,
      task_name: spawn?.args.task_name || null, observed_fork_turns: spawn?.args.fork_turns ?? null,
      requested_model: spawn?.args.model ?? null, requested_reasoning_effort: spawn?.args.reasoning_effort ?? null,
      observed_model: !rerouted && modelValues.length === 1 ? modelValues[0] : unavailable,
      observed_reasoning_effort: !rerouted && effortValues.length === 1 ? effortValues[0] : unavailable,
      runtime_observation_status: rerouted ? 'rerouted' : conflict ? 'conflict'
        : modelValues.length && effortValues.length ? 'verified' : unavailable,
      runtime_observation_evidence: boundObservations,
      report_argument_matches_runtime: report.runtime === 'claude-code' ? child.task_argument === spawn?.args.message : true,
    };
  });
  const turnRequest = messages.find((entry) => entry.direction === 'client_to_runtime' && entry.method === 'turn/start');
  const claudeInvocation = messages.find((entry) => entry.type === 'vulpora_runtime_invocation');
  return {
    spawn_tool_calls: spawns.length, children,
    task_orchestrator_spawned: spawns.some((entry) => entry.args.agent_type === 'task-orchestrator'),
    runtime_entrypoint_activated: report.runtime === 'codex'
      ? !!turnRequest?.params?.input?.some((entry) => entry.text?.includes('$start-task'))
      : claudeInvocation?.entrypoint === '/start-task',
    runtime_network_restricted: report.runtime === 'codex'
      ? turnRequest?.params?.sandboxPolicy?.networkAccess === false
      : claudeInvocation?.network_policy === 'fixture_and_child_commands_denied',
  };
}

function main(argv) {
  if (argv.length !== 3) throw new Error('usage: extractor EVENTS REPORT OUTPUT');
  const [eventsPath, reportPath, outputPath] = argv;
  const messages = fs.readFileSync(eventsPath, 'utf8').split(/\n/).filter((line) => line.trim()).map(JSON.parse);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  fs.writeFileSync(outputPath, JSON.stringify(extractChildEvidence(messages, report)), {flag: 'wx'});
}
module.exports = {extractChildEvidence};
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch {
    process.stderr.write('child_evidence_extraction_failed\n');
    process.exitCode = 1;
  }
}
