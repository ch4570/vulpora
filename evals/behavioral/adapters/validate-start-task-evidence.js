#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

function fail(message) {
  process.stderr.write(`evidence_invalid: ${message}\n`);
  process.exit(1);
}

if (process.argv.length !== 9) {
  fail("usage: validator REPORT EVIDENCE DIFF CHILD_EVIDENCE EXPECTED_RUN_ID EXPECTED_RUNTIME_INSTANCE_ID EXPECTED_RUNTIME");
}

const [, , reportPath, evidencePath, diffPath, childPath, expectedRunId, expectedInstanceId, expectedRuntime] = process.argv;
let report, evidence, diff, child;
try { report = JSON.parse(fs.readFileSync(reportPath, "utf8")); } catch (error) { fail(`report_parse:${error.message}`); }
try { evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8")); } catch (error) { fail(`evidence_parse:${error.message}`); }
try { diff = JSON.parse(fs.readFileSync(diffPath, "utf8")); } catch (error) { fail(`diff_parse:${error.message}`); }
try { child = JSON.parse(fs.readFileSync(childPath, "utf8")); } catch (error) { fail(`child_parse:${error.message}`); }

const entrypoints = {codex: "$start-task", "claude-code": "/start-task"};
if (!Object.hasOwn(entrypoints, expectedRuntime)) fail("unsupported_expected_runtime");
for (const [name, value] of [["report.run_id", report.run_id], ["evidence.run_id", evidence.run_id]]) {
  if (value !== expectedRunId) fail(`${name}:stale_or_wrong`);
}
for (const [name, value] of [["report.runtime_instance_id", report.runtime_instance_id], ["evidence.runtime_instance_id", evidence.runtime_instance_id]]) {
  if (value !== expectedInstanceId) fail(`${name}:stale_or_wrong`);
}
if (typeof evidence.runtime_configuration_id !== "string" || !/^[a-f0-9]{64}$/.test(evidence.runtime_configuration_id)) fail("runtime_configuration_id");
if (report.runtime_configuration_id !== evidence.runtime_configuration_id) fail("runtime_configuration_provenance_mismatch");
const configuration = evidence.runtime_configuration_identity;
if (!configuration || configuration.initialized !== evidence.runtime_configuration_id || configuration.before_discovery !== evidence.runtime_configuration_id || configuration.terminal !== evidence.runtime_configuration_id || configuration.stable !== true) fail("runtime_configuration_changed");
if (configuration.active_configuration_before !== configuration.active_configuration_after || configuration.active_authentication_before !== configuration.active_authentication_after || configuration.active_state_stable !== true) fail("active_runtime_state_changed");
if (report.runtime !== expectedRuntime || evidence.runtime !== expectedRuntime) fail("runtime_mismatch");
if (report.runtime_entrypoint !== entrypoints[expectedRuntime] || evidence.runtime_entrypoint !== entrypoints[expectedRuntime]) fail("runtime_entrypoint_mismatch");
if (evidence.schema_version !== "vulpora.start-task-evidence/v1") fail("evidence_version");
if (evidence.workflow_contract !== "vulpora.start-task/v1") fail("workflow_contract");

const activation = evidence.runtime_activation;
if (!activation || activation.fresh_install !== true || activation.fresh_runtime_instance !== true || activation.cached_discovery_used !== false) fail("runtime_not_fresh");
if (activation.invocation_label !== entrypoints[expectedRuntime]) fail("invocation_label");
if (activation.discovered_skill !== "start-task") fail("skill_discovery");
if (JSON.stringify(activation.discovered_agents) !== JSON.stringify(["requirement-dialogue", "task-splitter", "task-orchestrator"])) fail("agent_discovery");

const expectedPhases = ["clarify", "approve", "split", "execute", "integrate", "verify", "terminal"];
if (!Array.isArray(evidence.phase_transitions) || evidence.phase_transitions.length !== expectedPhases.length) fail("phase_count");
for (let index = 0; index < expectedPhases.length; index += 1) {
  const phase = evidence.phase_transitions[index];
  if (phase.name !== expectedPhases[index] || phase.sequence !== index + 1 || typeof phase.source !== "string" || !phase.source) fail(`phase_${index}`);
}

if (child.runtime_entrypoint_activated !== true || child.runtime_network_restricted !== true) fail("runtime_activation_evidence");
if (child.task_orchestrator_spawned !== false || !Array.isArray(child.children) || child.children.length !== report.children.length || child.children.length < 1 || child.children.length > 5) fail("child_set");
if (report.children.filter((entry) => entry.agent_id === "task-splitter").length !== 1
  || report.children.filter((entry) => entry.agent_id === "requirement-dialogue").length > 1) fail("workflow_child_set");
const expectedChildren = new Set(["requirement-dialogue", "task-splitter"]);
for (let index = 0; index < child.children.length; index += 1) {
  const observed = child.children[index], reported = report.children[index];
  if (expectedChildren.has(reported.agent_id) && observed.agent_id !== reported.agent_id) fail(`child_identity_${index}`);
  if (observed.agent_id !== reported.agent_id) fail(`child_report_identity_${index}`);
  if (!observed.matched || !observed.delivery_matched || !observed.reported_id_matches_runtime || observed.native_child_id !== reported.native_child_id) fail(`child_runtime_binding_${index}`);
  if (typeof observed.argument_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(observed.argument_sha256) || observed.argument_bytes < 32) fail(`child_argument_${index}`);
  if (!observed.report_argument_matches_runtime) fail(`child_reported_argument_mismatch_${index}`);
  const forbiddenActions = Array.isArray(reported.handoff.forbidden_actions)
    ? reported.handoff.forbidden_actions
    : reported.handoff.authority?.forbidden_actions;
  if ((reported.handoff.timeout_seconds !== undefined
      && (!Number.isInteger(reported.handoff.timeout_seconds) || reported.handoff.timeout_seconds > 180))
    || !Array.isArray(forbiddenActions)
    || !forbiddenActions.includes("recursive delegation")) fail(`child_handoff_${index}`);
  if (reported.inheritance_used !== false) fail(`child_reported_inheritance_${index}`);
  if (observed.observed_fork_turns !== null && observed.observed_fork_turns !== "none") fail(`child_fork_inheritance_${index}`);
  const available = (value) => typeof value === "string" && value.length > 0 && value !== "unavailable";
  if (observed.runtime_observation_status !== "verified"
    || !available(observed.observed_model) || !available(observed.observed_reasoning_effort)) {
    fail(`child_runtime_route_unverified_${index}`);
  }
  const sourceTypes = expectedRuntime === "codex"
    ? ["codex:subAgentActivity", "codex:session_configured", "codex:thread-response"]
    : ["claude-code:assistant-message", "claude-code:system-init"];
  const sources = observed.runtime_observation_evidence;
  if (!Array.isArray(sources) || sources.length === 0 || sources.some((entry) => {
    if (!sourceTypes.includes(entry?.source) || !Number.isSafeInteger(entry.event_index) || entry.event_index < 0) return true;
    const binding = {call_id: observed.spawn_call_id, thread_id: observed.runtime_thread_id, agent_path: observed.runtime_agent_path};
    const keys = Object.keys(binding).filter((key) => available(entry[key]));
    return keys.length === 0 || keys.some((key) => entry[key] !== binding[key])
      || (available(entry.model) && entry.model !== observed.observed_model)
      || (available(entry.reasoning_effort) && entry.reasoning_effort !== observed.observed_reasoning_effort);
  }) || !sources.some((entry) => entry.model === observed.observed_model)
    || !sources.some((entry) => entry.reasoning_effort === observed.observed_reasoning_effort)) {
    fail(`child_runtime_route_source_${index}`);
  }
  if (observed.requested_model !== null && observed.requested_model !== observed.observed_model) fail(`child_request_model_mismatch_${index}`);
  if (observed.requested_reasoning_effort !== null
    && observed.requested_reasoning_effort !== observed.observed_reasoning_effort) fail(`child_request_reasoning_mismatch_${index}`);
  if (reported.handoff.requested_model !== undefined
    && observed.observed_model !== reported.handoff.requested_model) fail(`child_observed_model_${index}`);
  if (reported.handoff.requested_reasoning_effort !== undefined
    && observed.observed_reasoning_effort !== reported.handoff.requested_reasoning_effort) fail(`child_observed_reasoning_${index}`);
  if (available(reported.runtime_reported_model)
    && reported.runtime_reported_model !== observed.observed_model) fail(`child_reported_runtime_model_${index}`);
  if (!expectedChildren.has(reported.agent_id)) {
    if (reported.handoff.schema === "vulpora.subagent-handoff/v2") {
      const attempt = report.routing_attempts?.find((candidate) =>
        candidate.task_id === reported.handoff.task_id
        && candidate.attempt_id === reported.handoff.attempt_id);
      if (!attempt
        || attempt.dispatch_receipt?.path !== reported.handoff.dispatch_receipt?.path
        || attempt.dispatch_receipt?.sha256 !== reported.handoff.dispatch_receipt?.sha256) {
        fail(`execution_child_route_${index}`);
      }
      if (attempt.runtime_reported_model
        && observed.observed_model !== attempt.runtime_reported_model) fail(`execution_child_observed_model_${index}`);
    } else if (reported.handoff.model_selection !== "explicit-native-override") {
      fail(`execution_child_route_${index}`);
    }
    if (observed.observed_fork_turns !== "none"
      || !available(observed.requested_model) || !available(observed.requested_reasoning_effort)) {
      fail(`execution_child_spawn_override_${index}`);
    }
  }
}
if (report.ownership.mode !== "primary-inline" || report.ownership.primary_owner_count !== 1 || report.ownership.task_orchestrator_child_spawned !== false) fail("ownership");

const actualChanged = [...diff.changed_files].sort();
const reportedChanged = [...report.changed_files].sort();
if (!actualChanged.length || JSON.stringify(actualChanged) !== JSON.stringify(reportedChanged)) fail("fixture_diff_mismatch");
if (actualChanged.some((path) => !["src/numbers.js", "test/numbers.test.js"].includes(path))) fail("fixture_scope");
if (JSON.stringify(evidence.actual_test.argv) !== JSON.stringify(["./run-offline.sh", "node", "--test"]) || evidence.actual_test.exit_code !== 0 || evidence.actual_test.timeout_seconds !== 60) fail("actual_test");
if (evidence.network.fixture_subprocess_attempts !== 0 || evidence.network.fixture_subprocess_successes !== 0 || evidence.network.probe_attempts !== 1 || evidence.network.probe_successes !== 0 || evidence.network.probe_exit !== 77) fail("network_evidence");
if (!evidence.integration || evidence.integration.performed_by !== "primary-owner" || evidence.integration.diff_inspected !== true) fail("integration_evidence");
if (!evidence.cleanup || evidence.cleanup.completed !== true || evidence.cleanup.owned_paths_removed !== true || evidence.cleanup.owned_children_stopped !== true || evidence.cleanup.orphan_processes !== 0) fail("cleanup_evidence");
if (report.terminal_status !== "complete") fail("terminal_status");

process.stdout.write("evidence_valid\n");
