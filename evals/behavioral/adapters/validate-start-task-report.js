#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const {parseTaskDag} = require("../../../skills/start-task/scripts/validate-task-dag.js");

function fail(message) { process.stderr.write(`report_invalid: ${message}\n`); process.exit(1); }
if (![6, 7, 8].includes(process.argv.length)) fail("usage: validator SCHEMA REPORT EXPECTED_RUN_ID EXPECTED_RUNTIME_INSTANCE_ID [EXPECTED_RUNTIME_CONFIGURATION_ID] [TASK_DAG_PATH]");
const [, , schemaPath, reportPath, expectedRunId, expectedInstanceId, expectedConfigurationId, taskDagPath] = process.argv;
let schema, report;
try { schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")); } catch (error) { fail(`schema_parse:${error.message}`); }
try { report = JSON.parse(fs.readFileSync(reportPath, "utf8")); } catch (error) { fail(`report_parse:${error.message}`); }

if (schema.$id !== "https://vulpora.local/schemas/orchestration-report-v3.schema.json") fail("schema_id_mismatch");

function resolve(ref) {
  if (!ref.startsWith("#/$defs/")) throw new Error(`unsupported_ref:${ref}`);
  return schema.$defs[ref.slice("#/$defs/".length)];
}
function kind(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}
function validate(rule, value, path) {
  if (rule.$ref) return validate(resolve(rule.$ref), value, path);
  if (rule.allOf) for (const item of rule.allOf) validate(item, value, path);
  if (rule.anyOf) {
    const matches = rule.anyOf.filter((item) => { try { validate(item, value, path); return true; } catch { return false; } });
    if (matches.length === 0) throw new Error(`${path}:anyOf`);
  }
  if (rule.oneOf) {
    const matches = rule.oneOf.filter((item) => { try { validate(item, value, path); return true; } catch { return false; } });
    if (matches.length !== 1) throw new Error(`${path}:oneOf:${matches.length}`);
  }
  if (Object.hasOwn(rule, "const") && value !== rule.const) throw new Error(`${path}:const`);
  if (rule.enum && !rule.enum.some((item) => item === value)) throw new Error(`${path}:enum`);
  if (rule.type) {
    const allowed = Array.isArray(rule.type) ? rule.type : [rule.type];
    const actual = kind(value);
    if (!allowed.includes(actual) && !(allowed.includes("number") && actual === "integer")) throw new Error(`${path}:type:${actual}`);
  }
  if (typeof value === "string") {
    if (rule.minLength !== undefined && value.length < rule.minLength) throw new Error(`${path}:minLength`);
    if (rule.maxLength !== undefined && value.length > rule.maxLength) throw new Error(`${path}:maxLength`);
    if (rule.pattern && !(new RegExp(rule.pattern)).test(value)) throw new Error(`${path}:pattern`);
  }
  if (typeof value === "number") {
    if (rule.minimum !== undefined && value < rule.minimum) throw new Error(`${path}:minimum`);
    if (rule.maximum !== undefined && value > rule.maximum) throw new Error(`${path}:maximum`);
  }
  if (Array.isArray(value)) {
    if (rule.minItems !== undefined && value.length < rule.minItems) throw new Error(`${path}:minItems`);
    if (rule.maxItems !== undefined && value.length > rule.maxItems) throw new Error(`${path}:maxItems`);
    if (rule.uniqueItems && new Set(value.map(JSON.stringify)).size !== value.length) throw new Error(`${path}:uniqueItems`);
    if (rule.prefixItems) rule.prefixItems.forEach((item, index) => validate(item, value[index], `${path}[${index}]`));
    if (rule.items && rule.items !== false) value.slice(rule.prefixItems?.length || 0).forEach((item, index) => validate(rule.items, item, `${path}[${index}]`));
    if (rule.items === false && value.length > (rule.prefixItems?.length || 0)) throw new Error(`${path}:extraItems`);
    if (rule.contains && !value.some((item) => { try { validate(rule.contains, item, path); return true; } catch { return false; } })) throw new Error(`${path}:contains`);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of rule.required || []) if (!Object.hasOwn(value, key)) throw new Error(`${path}.${key}:required`);
    for (const [key, childRule] of Object.entries(rule.properties || {})) if (Object.hasOwn(value, key)) validate(childRule, value[key], `${path}.${key}`);
    if (rule.additionalProperties === false) for (const key of Object.keys(value)) if (!Object.hasOwn(rule.properties || {}, key)) throw new Error(`${path}.${key}:additionalProperty`);
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sameStringSet(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function readBoundTaskDag(report, taskDagPath) {
  if (!taskDagPath) fail("task_dag_inventory_evidence_required");
  let text;
  try { text = fs.readFileSync(taskDagPath, "utf8"); } catch { fail("task_dag_unreadable"); }
  const actualSha256 = crypto.createHash("sha256").update(text).digest("hex");
  if (actualSha256 !== report.task_dag.sha256) fail("task_dag_hash_mismatch");
  try { return parseTaskDag(text); } catch (error) { fail(`task_dag_contract_invalid:${error.code || error.message}`); }
}

function validateTaskInventory(report, dag, requireComplete) {
  if (!dag.tasks.size) fail("task_dag_inventory_empty");
  if (dag.specId !== report.clarified_spec.id) fail("task_dag_spec_drift");
  const reportTaskIds = [...new Set(report.task_results.map((task) => task.task_id))].sort();
  const dagTaskIds = [...dag.tasks.keys()].sort();
  if (JSON.stringify(reportTaskIds) !== JSON.stringify(dagTaskIds)) fail("task_inventory_mismatch");
  const executionChildren = report.children.filter((child) =>
    !['requirement-dialogue', 'task-splitter'].includes(child.agent_id));
  for (const task of dag.tasks.values()) {
    const children = executionChildren.filter((child) => child.handoff.task_id === task.id);
    const attempts = report.routing_attempts.filter((attempt) => attempt.task_id === task.id);
    const executedResults = report.task_results.filter((result) => result.task_id === task.id && result.status !== "not_run");
    if (task.executionKind === "native-subagent") {
      for (const result of executedResults) {
        const keyMatches = (value) => value.task_id === result.task_id && value.attempt_id === result.attempt_id;
        if (!children.some((child) => keyMatches(child.handoff)) || !attempts.some(keyMatches)) {
          fail("native_task_result_lineage_missing");
        }
      }
    } else if (children.length > 0 || attempts.length > 0) {
      fail("inline_task_has_child_route");
    }
  }
  for (const child of executionChildren) {
    const task = dag.tasks.get(child.handoff.task_id);
    if (!task) fail("execution_handoff_task_unbound");
    if (child.handoff.spec_slice.spec_id !== dag.specId) fail("execution_handoff_spec_drift");
    if (!sameStringSet(child.handoff.spec_slice.acceptance_criterion_ids, task.acceptanceCriterionIds)) {
      fail("execution_handoff_acceptance_drift");
    }
    if (!sameStringSet(child.handoff.write_scope, task.writeScope)) fail("execution_handoff_scope_drift");
  }
  for (const result of report.task_results) {
    const task = dag.tasks.get(result.task_id);
    for (const evidence of result.acceptance_evidence) {
      const check = report.verification[evidence.verification_index];
      if (!task.acceptanceCriterionIds.includes(evidence.acceptance_criterion_id)
        || !dag.coverage.get(evidence.acceptance_criterion_id)?.includes(result.task_id)
        || !check || check.outcome !== "pass" || check.exit_code !== 0) {
        fail("complete_ac_evidence_unbound");
      }
      const digest = crypto.createHash("sha256")
        .update(canonicalJson({argv: check.argv, stdin_sha256: check.stdin_sha256}))
        .digest("hex");
      if (evidence.observed_ref !== `command-sha256:${digest}`) fail("acceptance_evidence_observation_mismatch");
    }
  }
  if (!requireComplete) return;
  for (const taskId of dag.tasks.keys()) {
    if (report.task_results.filter((result) => result.task_id === taskId && result.status === "verified").length !== 1) {
      fail("complete_without_one_verified_result_per_task");
    }
  }
  for (const [criterionId, taskIds] of dag.coverage) {
    for (const taskId of taskIds) {
      const passed = report.task_results.some((result) => result.task_id === taskId && result.status === "verified"
        && result.acceptance_evidence.some((evidence) => evidence.acceptance_criterion_id === criterionId));
      if (!passed) fail("complete_ac_task_evidence_missing");
    }
  }
}

try { validate(schema, report, "$"); } catch (error) { fail(error.message); }
if (report.run_id !== expectedRunId) fail("stale_or_wrong_run_id");
if (report.runtime_instance_id !== expectedInstanceId) fail("stale_or_wrong_runtime_instance_id");
if (expectedConfigurationId !== undefined && report.runtime_configuration_id !== expectedConfigurationId) fail("stale_or_wrong_runtime_configuration_id");
const expectedEntrypoints = {codex: new Set(["$start-task", "/skills selection"]), "claude-code": new Set(["/start-task"])};
if (!expectedEntrypoints[report.runtime]?.has(report.runtime_entrypoint)) fail("runtime_entrypoint_mismatch");
if (report.children.some((child) => child.agent_id === "task-orchestrator")) fail("task_orchestrator_child_forbidden");
if (report.children.filter((child) => child.agent_id === "task-splitter").length !== 1) fail("task_splitter_child_required");
if (report.children.filter((child) => child.agent_id === "requirement-dialogue").length > 1) fail("duplicate_requirement_dialogue_child");
for (const [index, child] of report.children.entries()) {
  if (child.inheritance_used !== false) fail(`child_${index}_model_inheritance_forbidden`);
  if (["requirement-dialogue", "task-splitter"].includes(child.agent_id)) {
    if (child.handoff.schema !== "vulpora.subagent-handoff/v1"
      || child.handoff.model_profile !== "fixed"
      || child.handoff.model_selection !== "fixed-agent-config"
      || child.handoff.route_resolution_source !== "fixed-agent-config") {
      fail(`child_${index}_fixed_route_invalid`);
    }
    if (child.runtime_reported_model !== "unavailable"
      && child.runtime_reported_model !== child.handoff.requested_model) {
      fail(`child_${index}_runtime_model_mismatch`);
    }
  } else {
    if (child.handoff.schema !== "vulpora.subagent-handoff/v2"
      || child.handoff.result_schema !== "vulpora.task-result/v2"
      || child.handoff.task_id.length === 0
      || child.handoff.attempt_id.length === 0) {
      fail(`child_${index}_v2_execution_handoff_required`);
    }
  }
}
if (report.task_dag.schema !== "vulpora.task-dag/v2") fail("task_dag_v2_required");
const executionChildren = report.children.filter((child) =>
  !["requirement-dialogue", "task-splitter"].includes(child.agent_id));
const routeByAttempt = new Map();
const resultByAttempt = new Map();
for (const [index, result] of report.task_results.entries()) {
  const key = `${result.task_id}\n${result.attempt_id}`;
  if (resultByAttempt.has(key)) fail(`task_result_${index}_duplicate_lineage`);
  resultByAttempt.set(key, result);
}
for (const [index, attempt] of report.routing_attempts.entries()) {
  const key = `${attempt.task_id}\n${attempt.attempt_id}`;
  if (routeByAttempt.has(key)) fail(`routing_attempt_${index}_duplicate_lineage`);
  routeByAttempt.set(key, attempt);
  const expectedPrefix = `.vulpora/tasks/${report.run_id}/routing/`;
  if (!attempt.dispatch_receipt.path.startsWith(expectedPrefix)
    || !attempt.attempt_receipt.path.startsWith(expectedPrefix)) fail(`routing_attempt_${index}_wrong_run_path`);
  const allowedActions = {
    null: new Set(["success"]),
    transient_effect_none: new Set(["retry_same_route", "block", "stop"]),
    route_health: new Set(["failover_same_tier", "block"]),
    provider_health: new Set(["failover_same_tier", "block"]),
    capability_insufficient: new Set(["escalate_capability_tier", "block"]),
    deterministic_implementation_failure: new Set(["repair", "block"]),
    authentication: new Set(["block"]),
    quota: new Set(["block"]),
    missing_tool: new Set(["block"]),
    authority: new Set(["block"]),
    budget: new Set(["block"]),
    unknown_mutation_state: new Set(["reconcile"]),
    unclassified: new Set(["stop"]),
  };
  const failureKey = attempt.failure_class === null ? "null" : attempt.failure_class;
  if (!allowedActions[failureKey]?.has(attempt.action)) fail(`routing_attempt_${index}_invalid_action_failure_pair`);
  if (attempt.mutation_state === "unknown" && !["reconcile", "stop"].includes(attempt.action)) {
    fail(`routing_attempt_${index}_unknown_mutation_reroute`);
  }
}
for (const [index, child] of executionChildren.entries()) {
  const key = `${child.handoff.task_id}\n${child.handoff.attempt_id}`;
  const route = routeByAttempt.get(key);
  if (!route) fail(`execution_child_${index}_routing_attempt_missing`);
  if (JSON.stringify(route.dispatch_receipt) !== JSON.stringify(child.handoff.dispatch_receipt)) {
    fail(`execution_child_${index}_dispatch_receipt_mismatch`);
  }
  if (child.runtime_reported_model !== route.runtime_reported_model) {
    fail(`execution_child_${index}_runtime_model_mismatch`);
  }
  const results = report.task_results.filter((result) =>
    result.task_id === child.handoff.task_id && result.attempt_id === child.handoff.attempt_id);
  if (results.length !== 1) fail(`execution_child_${index}_task_result_lineage_mismatch`);
  const successfulAttempt = route.failure_class === null && route.action === "success";
  if (results[0].status === "verified" && !successfulAttempt) {
    fail(`execution_child_${index}_result_outcome_mismatch`);
  }
  if (!successfulAttempt && results[0].acceptance_evidence.some((evidence) => evidence.outcome === "pass")) {
    fail(`execution_child_${index}_failed_result_has_passing_evidence`);
  }
  routeByAttempt.delete(key);
  resultByAttempt.delete(key);
}
if (routeByAttempt.size) fail("orphan_routing_attempt");
if (report.execution_ledger.path !== `.vulpora/tasks/${report.run_id}/execution-ledger.jsonl`) fail("ledger_run_path_mismatch");
if (report.clarity_gate_evidence.projection_path !== `.vulpora/tasks/${report.run_id}/clarity-projection.json`) fail("clarity_projection_run_path_mismatch");
if (/^0+$/.test(report.execution_ledger.head_sha256)) fail("ledger_head_placeholder");
if (report.execution_ledger.integrity_level !== "local_tamper_evident" || report.execution_ledger.external_anchor !== null) {
  fail("unsupported_or_unverified_ledger_anchor");
}
let clarityValidatorCount = 0;
for (const check of report.verification) {
  if (check.outcome === "pass" && check.exit_code !== 0) fail("pass_without_zero_exit_code");
  if (["not_run", "cancelled", "timeout"].includes(check.outcome) && check.exit_code !== null) fail("nonexecution_with_exit_code");
  if (check.network_successes > check.network_attempts) fail("network_successes_exceed_attempts");
  const isClarityValidator = check.argv.length === 2 && check.argv[0] === "node"
    && check.argv[1].split(/[\\/]/).at(-1) === "validate-clarity-gate.js";
  if (isClarityValidator) {
    clarityValidatorCount += 1;
    if (check.stdin_sha256 !== report.clarity_gate_evidence.projection_sha256) fail("clarity_projection_stdin_mismatch");
  } else if (check.stdin_sha256 !== null) fail("unexpected_verification_stdin");
}
if (clarityValidatorCount !== 1) fail("clarity_validator_count_mismatch");
if (report.terminal_status === "complete") {
  const dag = readBoundTaskDag(report, taskDagPath);
  validateTaskInventory(report, dag, true);
  if (report.phases.some((phase) => phase.outcome !== "pass")) fail("complete_with_nonpass_phase");
  if (report.verification.some((check) => check.outcome !== "pass" || check.exit_code !== 0)) fail("complete_with_nonpass_verification");
  if (!report.cleanup.completed || !report.cleanup.owned_paths_removed || !report.cleanup.owned_children_stopped || report.cleanup.orphan_processes !== 0) fail("complete_without_cleanup");
  if (report.gaps.length) fail("complete_with_gaps");
  if (report.continuation.status !== "none" || report.continuation.resumable || report.continuation.question !== null) fail("complete_with_continuation");
  if (report.continuation.resume_from !== "none" || report.continuation.completed_task_ids.length || report.continuation.pending_task_ids.length || report.continuation.remaining_acceptance_criterion_ids.length) fail("complete_with_pending_work");
}
if (report.terminal_status === "partial") {
  const continuation = report.continuation;
  const dag = readBoundTaskDag(report, taskDagPath);
  validateTaskInventory(report, dag, false);
  if (!report.task_results.some((task) => task.status === "verified")) fail("partial_without_verified_subset");
  if (!report.gaps.length) fail("partial_without_gap");
  if (continuation.status !== "ready_to_resume" || !continuation.resumable || continuation.same_session_only
    || continuation.question !== null) {
    fail("partial_without_resumable_checkpoint");
  }
  if (!continuation.pending_task_ids.length && !continuation.remaining_acceptance_criterion_ids.length) fail("partial_without_pending_work");
  if (continuation.workspace_snapshot.captured_at_phase !== "terminal") fail("partial_workspace_snapshot_wrong_phase");
  if (/^0+$/.test(continuation.workspace_snapshot.head_sha) || /^0+$/.test(continuation.workspace_snapshot.diff_sha256)) fail("partial_workspace_snapshot_placeholder");
  const verifiedTaskIds = [...dag.tasks.keys()].filter((taskId) =>
    report.task_results.some((task) => task.task_id === taskId && task.status === "verified")).sort();
  const unfinishedTaskIds = [...dag.tasks.keys()].filter((taskId) => !verifiedTaskIds.includes(taskId)).sort();
  if (JSON.stringify([...continuation.completed_task_ids].sort()) !== JSON.stringify(verifiedTaskIds)) fail("partial_completed_task_mismatch");
  if (JSON.stringify([...continuation.pending_task_ids].sort()) !== JSON.stringify(unfinishedTaskIds)) fail("partial_pending_task_mismatch");
  const expectedResumeFrom = unfinishedTaskIds.length ? "execute" : report.integration.result !== "pass" ? "integrate" : "verify";
  if (continuation.resume_from !== expectedResumeFrom) fail("partial_resume_frontier_mismatch");
  const gapText = report.gaps.join("\n");
  const unresolvedCriteria = [...dag.coverage].filter(([criterionId, taskIds]) => taskIds.some((taskId) =>
    !report.task_results.some((result) => result.task_id === taskId && result.status === "verified"
      && result.acceptance_evidence.some((evidence) => evidence.acceptance_criterion_id === criterionId))))
    .map(([criterionId]) => criterionId).sort();
  if (JSON.stringify([...continuation.remaining_acceptance_criterion_ids].sort()) !== JSON.stringify(unresolvedCriteria)) {
    fail("partial_acceptance_frontier_mismatch");
  }
  for (const criterionId of unresolvedCriteria) if (!gapText.includes(criterionId)) fail("partial_acceptance_criterion_without_gap");
  for (const key of ["blocker", "next_action"]) {
    if (typeof continuation[key] !== "string" || continuation[key].trim().length === 0) fail(`partial_without_${key}`);
  }
  if (!continuation.resume_conditions.length) fail("partial_without_resume_conditions");
  const expectedArtifacts = new Map([
    [report.clarified_spec.path, report.clarified_spec.sha256],
    [report.task_dag.path, report.task_dag.sha256]
  ]);
  if (continuation.preserved_artifacts.length !== expectedArtifacts.size) fail("partial_incomplete_preserved_artifacts");
  for (const artifact of continuation.preserved_artifacts) {
    if (expectedArtifacts.get(artifact.path) !== artifact.sha256) fail("partial_stale_preserved_artifact");
    expectedArtifacts.delete(artifact.path);
  }
  if (expectedArtifacts.size) fail("partial_missing_preserved_artifact");
  const hasIncompleteEvidence = report.phases.some((phase) => phase.outcome !== "pass") ||
    report.verification.some((check) => check.outcome !== "pass") ||
    report.task_results.some((task) => task.status !== "verified");
  if (!hasIncompleteEvidence) fail("partial_without_incomplete_evidence");
}
process.stdout.write("report_valid\n");
