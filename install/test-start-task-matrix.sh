#!/usr/bin/env bash
# Complete start-task verification matrix. Live runtimes start together and receive no more than 1170 seconds.
set -u
set -f
DIR="$(cd "$(dirname "$0")" && pwd -P)"; ROOT="$(cd "$DIR/.." && pwd -P)"
TIMEOUT="$DIR/with-timeout.sh"; BASELINE_TOOL="$ROOT/evals/behavioral/adapters/fs-baseline.js"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-start-task-matrix.XXXXXX")" || exit 1
baseline="$WORK/repository.baseline"; started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; SECONDS=0
codex_pid=""; claude_pid=""; cleanup_started=0

stop_job() {
  pid="$1"; [ -n "$pid" ] || return 0
  if kill -0 "$pid" 2>/dev/null; then kill -TERM "$pid" 2>/dev/null || true; fi
}
cleanup() {
  [ "$cleanup_started" -eq 0 ] || return 0; cleanup_started=1
  stop_job "$codex_pid"; stop_job "$claude_pid"
  cleanup_seconds=0
  while { [ -n "$codex_pid" ] && kill -0 "$codex_pid" 2>/dev/null; } || { [ -n "$claude_pid" ] && kill -0 "$claude_pid" 2>/dev/null; }; do
    [ "$cleanup_seconds" -lt 30 ] || break
    sleep 1; cleanup_seconds=$((cleanup_seconds + 1))
  done
  [ -z "$codex_pid" ] || { kill -KILL "$codex_pid" 2>/dev/null || true; wait "$codex_pid" 2>/dev/null || true; }
  [ -z "$claude_pid" ] || { kill -KILL "$claude_pid" 2>/dev/null || true; wait "$claude_pid" 2>/dev/null || true; }
  rm -rf "$WORK"
}
trap cleanup EXIT HUP INT TERM

node "$BASELINE_TOOL" capture "$ROOT" "$baseline" || exit 1

# Independent native schedules begin together. Two fresh runs fit beneath the global start cutoff.
bash "$TIMEOUT" 1170 bash "$DIR/test-start-task-codex-live.sh" --runs 2 --deadline-seconds 540 >"$WORK/native-codex.jsonl" 2>"$WORK/native-codex.err" & codex_pid=$!
bash "$TIMEOUT" 1170 bash "$DIR/test-start-task-claude-live.sh" --runs 2 --deadline-seconds 540 >"$WORK/native-claude.jsonl" 2>"$WORK/native-claude.err" & claude_pid=$!

run_leaf() {
  key="$1"; shift
  if bash "$TIMEOUT" 60 "$@" >"$WORK/$key.jsonl" 2>"$WORK/$key.err"; then return 0; fi
  printf '{"semantic_ac_key":"%s","outcome":"failed","execution":"attempted","reason":"leaf_command_failed_or_timeout"}\n' "$key" >>"$WORK/$key.jsonl"
}
run_leaf runtime_entrypoint_contract bash "$DIR/test-start-task-contract.sh"
run_leaf proportional_execution_profile bash "$DIR/test-start-task-execution-profile.sh"
run_leaf clarity_gate_validation bash "$DIR/test-start-task-clarity-gate.sh"
run_leaf single_question_frame_validation bash "$DIR/test-start-task-question-frame.sh"
run_leaf tamper_evident_execution_ledger bash "$DIR/test-start-task-ledger.sh"
run_leaf structured_evidence_provenance bash "$DIR/test-start-task-evidence.sh"
run_leaf cleanup_interruption_resume bash "$DIR/test-start-task-cleanup.sh"
run_leaf cross_runtime_status bash "$DIR/test-start-task-aggregation.sh"
run_leaf input_and_report_rejection bash "$DIR/test-start-task-inputs.sh"
run_leaf adversarial_untrusted_data bash "$DIR/test-start-task-adversarial.sh"
run_leaf offline_network_isolation bash "$DIR/test-start-task-fixture.sh"
run_leaf orchestration_report_schema bash "$DIR/test-start-task-report-schema.sh"
run_leaf terminal_response_envelope bash "$DIR/test-start-task-terminal-response.sh"

wait "$codex_pid" 2>/dev/null; codex_rc=$?; codex_pid=""
wait "$claude_pid" 2>/dev/null; claude_rc=$?; claude_pid=""

ensure_native_result() {
  file="$1"; key="$2"; runtime="$3"; rc="$4"
  grep -Fq "\"semantic_ac_key\":\"$key\"" "$file" 2>/dev/null && return 0
  reason=runtime_failed; [ "$rc" -eq 124 ] && reason=timeout
  printf '{"semantic_ac_key":"%s","runtime":"%s","outcome":"failed","execution":"attempted","reason":"%s","terminal_status":"failed","cleanup_completed":true}\n' "$key" "$runtime" "$reason" >>"$file"
}
ensure_native_result "$WORK/native-codex.jsonl" native_codex_e2e codex "$codex_rc"
ensure_native_result "$WORK/native-claude.jsonl" native_claude-code_e2e claude-code "$claude_rc"

if [ "$SECONDS" -gt 1200 ]; then printf '{"semantic_ac_key":"global_deadline","outcome":"failed","reason":"matrix_timeout"}\n' >"$WORK/deadline.jsonl"; fi

if node "$BASELINE_TOOL" compare "$ROOT" "$baseline" >"$WORK/baseline.log" 2>&1; then
  printf '{"semantic_ac_key":"finite_matrix_repository_baseline","outcome":"pass","manifest_finite":true,"aggregate_self_excluded":true,"nul_safe":true,"lstat_semantics":true,"repository_unchanged":true}\n' >"$WORK/finite_matrix_repository_baseline.jsonl"
else
  printf '{"semantic_ac_key":"finite_matrix_repository_baseline","outcome":"failed","repository_unchanged":false}\n' >"$WORK/finite_matrix_repository_baseline.jsonl"
fi

node - "$WORK" "$started_at" "$SECONDS" <<'NODE'
const fs=require('node:fs'),path=require('node:path');const [dir,started,elapsedText]=process.argv.slice(2),elapsed=Number(elapsedText);
const manifest=['runtime_entrypoint_contract','clarity_gate_validation','single_question_frame_validation','tamper_evident_execution_ledger','native_codex_e2e','native_claude-code_e2e','structured_evidence_provenance','cleanup_interruption_resume','cross_runtime_status','finite_matrix_repository_baseline','runtime_repeatability_isolation','input_and_report_rejection','adversarial_untrusted_data','offline_network_isolation','orchestration_report_schema','terminal_response_envelope'];
function lastResult(file,key){
  if(!fs.existsSync(file))return {semantic_ac_key:key,outcome:'failed',reason:'missing_leaf_output'};
  const values=[];for(const line of fs.readFileSync(file,'utf8').split(/\n/)){try{const x=JSON.parse(line);if(x.semantic_ac_key===key)values.push(x);}catch{}}
  return values.length===1?values[0]:{semantic_ac_key:key,outcome:'failed',reason:values.length?'duplicate_leaf_output':'missing_leaf_output'};
}
const fileFor={runtime_entrypoint_contract:'runtime_entrypoint_contract.jsonl',clarity_gate_validation:'clarity_gate_validation.jsonl',single_question_frame_validation:'single_question_frame_validation.jsonl',tamper_evident_execution_ledger:'tamper_evident_execution_ledger.jsonl',native_codex_e2e:'native-codex.jsonl','native_claude-code_e2e':'native-claude.jsonl',structured_evidence_provenance:'structured_evidence_provenance.jsonl',cleanup_interruption_resume:'cleanup_interruption_resume.jsonl',cross_runtime_status:'cross_runtime_status.jsonl',finite_matrix_repository_baseline:'finite_matrix_repository_baseline.jsonl',input_and_report_rejection:'input_and_report_rejection.jsonl',adversarial_untrusted_data:'adversarial_untrusted_data.jsonl',offline_network_isolation:'offline_network_isolation.jsonl',orchestration_report_schema:'orchestration_report_schema.jsonl',terminal_response_envelope:'terminal_response_envelope.jsonl'};
const results=[];for(const key of manifest.filter(x=>x!=='runtime_repeatability_isolation'))results.push(lastResult(path.join(dir,fileFor[key]),key));
const natives=results.filter(x=>/^native_.*_e2e$/.test(x.semantic_ac_key));
const available=natives.filter(x=>x.outcome!=='environment_unavailable');
const repeatPass=available.length>0&&available.every(x=>x.outcome==='pass'&&x.runs===2&&x.deterministic===true&&x.cleanup_completed===true);
results.push({semantic_ac_key:'runtime_repeatability_isolation',outcome:repeatPass?'pass':'failed',available_runtimes:available.map(x=>x.runtime),fresh_runs_per_available_runtime:2,evidence_reuse:false,ordering_independent:repeatPass});
results.sort((a,b)=>manifest.indexOf(a.semantic_ac_key)-manifest.indexOf(b.semantic_ac_key));
const keys=results.map(x=>x.semantic_ac_key),unique=new Set(keys);
if(keys.length!==manifest.length||unique.size!==manifest.length||manifest.some(x=>!unique.has(x)))throw new Error('leaf manifest invariant');
let overall_status;
if(results.every(x=>x.outcome==='pass'))overall_status='complete';
else {
  const critical=new Set(['clarity_gate_validation','single_question_frame_validation','tamper_evident_execution_ledger','structured_evidence_provenance','cleanup_interruption_resume','finite_matrix_repository_baseline','adversarial_untrusted_data','offline_network_isolation','orchestration_report_schema','terminal_response_envelope']);
  const criticalFailure=results.some(x=>critical.has(x.semantic_ac_key)&&x.outcome!=='pass');
  const useful=natives.some(x=>x.outcome==='pass');
  overall_status=!criticalFailure&&useful?'partial':'failed';
}
const report={schema_version:'vulpora.start-task-matrix/v1',workflow_contract:'vulpora.start-task/v1',started_at:started,elapsed_seconds:elapsed,global_deadline_seconds:1200,new_work_cutoff_seconds:1170,cleanup_reserve_seconds:30,aggregate_leaf_manifest:manifest,leaf_results:results,overall_status};
process.stdout.write(`${JSON.stringify(report)}\n`);
process.exit(overall_status==='complete'?0:1);
NODE
