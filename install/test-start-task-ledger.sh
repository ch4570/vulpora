#!/usr/bin/env bash
set -eu
DIR="$(cd "$(dirname "$0")" && pwd -P)"; ROOT="$(cd "$DIR/.." && pwd -P)"
APPEND="$ROOT/skills/start-task/scripts/append-execution-ledger.js"
RECORD_COMMAND="$ROOT/skills/start-task/scripts/record-execution-command.js"
VALIDATE="$ROOT/skills/start-task/scripts/validate-execution-ledger.js"
CLARITY_VALIDATOR="$ROOT/skills/start-task/scripts/validate-clarity-gate.js"
VALIDATE_VISIBILITY="$ROOT/evals/behavioral/adapters/validate-start-task-ledger-visibility.js"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-execution-ledger.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
LEDGER="$WORK/execution-ledger.jsonl"
BASE_RUN_DIR="$WORK/.vulpora/tasks/run-ledger-1234"

append_event() {
  (cd "$WORK" && printf '%s' "$1" | node "$APPEND" "$LEDGER")
}
append_event_to() {
  target="$1"; event="$2"
  (cd "$WORK" && printf '%s' "$event" | node "$APPEND" "$target")
}

printf 'frozen bytes\n' > "$WORK/artifact.txt"
mkdir -p "$BASE_RUN_DIR"
printf 'spec bytes\n' > "$BASE_RUN_DIR/clarified-spec.yaml"
printf 'dag bytes\n' > "$BASE_RUN_DIR/task-dag.yaml"
node - "$VALIDATE" "$BASE_RUN_DIR/clarity-projection.json" <<'NODE'
const fs=require('node:fs');const {canonicalJson}=require(process.argv[2]);
const dimensions=[['goal',20],['scope',20],['acceptance',20],['constraints',15],['authority_risk',15],['verification',10]]
  .map(([id,weight])=>({id,weight,rating:4,awarded:weight,evidence:`${id==='goal'?'user':id==='authority_risk'?'policy':'repository'}: ${id} contract is observed in fixture`}));
const projection={spec_status:'ready',approval:true,unknowns:[],clarity_gate:{score:100,threshold:85,status:'passed',dimensions,skip:{requested:false,basis:null,reason:null,accepted_risk_unknown_ids:[],non_bypassable_blocker_ids:[]}}};
fs.writeFileSync(process.argv[3],canonicalJson(projection));
NODE
node - "$APPEND" <<'NODE'
const api = require(process.argv[2]);
if (api && (api.appendEvent || api.resultForRecord)) process.exit(1);
NODE
append_event '{"run_id":"run-ledger-1234","phase":"clarify","event_type":"run_initialized","status":"reported","source_type":"agent_claim","source_ref":"agent:primary","message":"Run initialization requested."}' > "$WORK/first.json"
append_event '{"run_id":"run-ledger-1234","phase":"approve","event_type":"spec_committed","status":"reported","source_type":"user_decision","source_ref":"task-input-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","message":"Implementation intent committed."}' >/dev/null
append_event '{"run_id":"run-ledger-1234","phase":"approve","event_type":"clarity_projection_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-ledger-1234/clarity-projection.json","message":"Clarity projection frozen."}' >/dev/null
(cd "$WORK" && node "$RECORD_COMMAND" "$LEDGER" run-ledger-1234 approve 10 'Clarity gate validation' \
  --stdin-file '.vulpora/tasks/run-ledger-1234/clarity-projection.json' --contract clarity-gate -- \
  node "$CLARITY_VALIDATOR") >/dev/null 2>/dev/null
append_event '{"run_id":"run-ledger-1234","phase":"approve","event_type":"artifact_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-ledger-1234/clarified-spec.yaml","message":"Spec frozen."}' >/dev/null
append_event '{"run_id":"run-ledger-1234","phase":"split","event_type":"artifact_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-ledger-1234/task-dag.yaml","message":"DAG frozen."}' >/dev/null
append_event '{"run_id":"run-ledger-1234","phase":"split","event_type":"artifact_frozen","status":"passed","source_type":"filesystem_digest","source_ref":"artifact.txt","message":"Artifact bytes were re-read and hashed."}' > "$WORK/second.json"
node "$RECORD_COMMAND" "$LEDGER" run-ledger-1234 verify 10 "Deterministic verification" -- \
  node -e 'process.exit(0)' > "$WORK/command.json" 2> "$WORK/command-progress.log"

node - "$WORK/first.json" "$WORK/command.json" <<'NODE'
const fs = require('node:fs');
const first = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const second = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
if (first.sequence !== 1 || first.seq !== 1) process.exit(1);
if (second.sequence !== 11 || second.seq !== 11 || second.exit_code !== 0) process.exit(1);
if (second.stdin_sha256 !== null || second.stdin_path !== null) process.exit(1);
const expected = `작업 로그: #11 verify/command_finished — Passed: Deterministic verification (exit:0) [head ${second.event_sha256.slice(0, 12)}]`;
if (second.progress_line !== expected) process.exit(1);
NODE
grep -Fq '작업 로그: #10 verify/command_started' "$WORK/command-progress.log"
grep -Fq '작업 로그: #11 verify/command_finished' "$WORK/command-progress.log"

node "$VALIDATE" "$LEDGER" run-ledger-1234 > "$WORK/validation.json"
grep -Fq '"outcome":"pass"' "$WORK/validation.json"
grep -Fq '"record_count":11' "$WORK/validation.json"
grep -Fq '"integrity_level":"local_tamper_evident"' "$WORK/validation.json"

CLAIM_ONLY_DIR="$WORK/.vulpora/tasks/run-claim-only-1234"
CLAIM_ONLY_LEDGER="$CLAIM_ONLY_DIR/execution-ledger.jsonl"
mkdir -p "$CLAIM_ONLY_DIR"
cp "$BASE_RUN_DIR/clarity-projection.json" "$CLAIM_ONLY_DIR/clarity-projection.json"
printf 'spec bytes\n' > "$CLAIM_ONLY_DIR/clarified-spec.yaml"
printf 'dag bytes\n' > "$CLAIM_ONLY_DIR/task-dag.yaml"
append_event_to "$CLAIM_ONLY_LEDGER" '{"run_id":"run-claim-only-1234","phase":"clarify","event_type":"run_initialized","status":"reported","source_type":"agent_claim","source_ref":"agent:primary","message":"Run initialized."}' >/dev/null
append_event_to "$CLAIM_ONLY_LEDGER" '{"run_id":"run-claim-only-1234","phase":"approve","event_type":"spec_committed","status":"reported","source_type":"user_decision","source_ref":"task-input-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","message":"Spec committed."}' >/dev/null
append_event_to "$CLAIM_ONLY_LEDGER" '{"run_id":"run-claim-only-1234","phase":"approve","event_type":"clarity_projection_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-claim-only-1234/clarity-projection.json","message":"Projection frozen."}' >/dev/null
append_event_to "$CLAIM_ONLY_LEDGER" '{"run_id":"run-claim-only-1234","phase":"approve","event_type":"clarity_gate_validated","status":"reported","source_type":"agent_claim","source_ref":"agent:primary","message":"Claim-only clarity pass."}' >/dev/null
append_event_to "$CLAIM_ONLY_LEDGER" '{"run_id":"run-claim-only-1234","phase":"approve","event_type":"artifact_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-claim-only-1234/clarified-spec.yaml","message":"Spec frozen."}' >/dev/null
append_event_to "$CLAIM_ONLY_LEDGER" '{"run_id":"run-claim-only-1234","phase":"split","event_type":"artifact_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-claim-only-1234/task-dag.yaml","message":"DAG frozen."}' >/dev/null
append_event_to "$CLAIM_ONLY_LEDGER" '{"run_id":"run-claim-only-1234","phase":"execute","event_type":"phase_started","status":"reported","source_type":"agent_claim","source_ref":"agent:primary","message":"Execute started."}' >/dev/null
if node "$VALIDATE" "$CLAIM_ONLY_LEDGER" run-claim-only-1234 >/dev/null 2>&1; then
  echo 'active execution accepted claim-only clarity validation' >&2; exit 1
fi

LOOKALIKE_DIR="$WORK/.vulpora/tasks/run-lookalike-1234"
LOOKALIKE_LEDGER="$LOOKALIKE_DIR/execution-ledger.jsonl"
mkdir -p "$LOOKALIKE_DIR" "$WORK/fake"
cp "$BASE_RUN_DIR/clarity-projection.json" "$LOOKALIKE_DIR/clarity-projection.json"
cp "$CLARITY_VALIDATOR" "$WORK/fake/validate-clarity-gate.js"
if (cd "$WORK" && node "$RECORD_COMMAND" "$LOOKALIKE_LEDGER" run-lookalike-1234 approve 10 'Lookalike clarity validator' \
  --stdin-file '.vulpora/tasks/run-lookalike-1234/clarity-projection.json' --contract clarity-gate -- \
  node "$WORK/fake/validate-clarity-gate.js") >/dev/null 2>&1; then
  echo 'lookalike clarity validator accepted as bundled validator' >&2; exit 1
fi
[ ! -e "$LOOKALIKE_LEDGER" ] || { echo 'rejected clarity command mutated ledger' >&2; exit 1; }

SKIP_DIR="$WORK/.vulpora/tasks/run-skip-missing-1234"
SKIP_LEDGER="$SKIP_DIR/execution-ledger.jsonl"
mkdir -p "$SKIP_DIR"
node - "$VALIDATE" "$SKIP_DIR/clarity-projection.json" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');const {canonicalJson}=require(process.argv[2]);
const runId='run-skip-missing-1234',answer='b'.repeat(64);
const dimensions=[['goal',20,4,'user'],['scope',20,4,'repository'],['acceptance',20,4,'user'],['constraints',15,0,'policy'],['authority_risk',15,4,'policy'],['verification',10,0,'repository']]
  .map(([id,weight,rating,source])=>({id,weight,rating,awarded:Math.floor(weight*rating/4+0.5),evidence:`${source}: ${id} evidence is explicit for the skipped fixture`}));
const unknown={id:'U-1',category:'scope',summary:'A reversible scope risk remains unresolved.',blocking:false,disposition:'accepted_risk'};
const unknownsSha=crypto.createHash('sha256').update(canonicalJson([unknown])).digest('hex');
const offer={run_id:runId,offered_clarity_score:75,offered_ambiguity_score:25,offered_unknown_ids:['U-1'],offered_unknowns_sha256:unknownsSha,question_signature:'blocker:U-1'};
const offerSha=crypto.createHash('sha256').update(canonicalJson(offer)).digest('hex');
const decisionContext={...offer,answer_sha256:answer,offer_sha256:offerSha,offer_ref:`file-sha256:${offerSha}:.vulpora/tasks/${runId}/clarification-offer-${offerSha}.json`};
const projection={spec_status:'ready',approval:true,unknowns:[unknown],clarity_gate:{score:75,threshold:85,status:'skipped',dimensions,skip:{requested:true,basis:'explicit_user_request',reason:'user chose implementation with known uncertainty',decision_ref:`answer-sha256:${answer}`,decision_context:decisionContext,accepted_risk_unknown_ids:['U-1'],non_bypassable_blocker_ids:[]}}};
fs.writeFileSync(process.argv[3],canonicalJson(projection));
NODE
append_event_to "$SKIP_LEDGER" '{"run_id":"run-skip-missing-1234","phase":"approve","event_type":"spec_committed","status":"reported","source_type":"user_decision","source_ref":"answer-sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","message":"Skip decision claimed."}' >/dev/null
append_event_to "$SKIP_LEDGER" '{"run_id":"run-skip-missing-1234","phase":"approve","event_type":"clarity_projection_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-skip-missing-1234/clarity-projection.json","message":"Projection frozen."}' >/dev/null
if (cd "$WORK" && node "$RECORD_COMMAND" "$SKIP_LEDGER" run-skip-missing-1234 approve 10 'Skipped clarity validation' \
  --stdin-file '.vulpora/tasks/run-skip-missing-1234/clarity-projection.json' --contract clarity-gate -- \
  node "$CLARITY_VALIDATOR") >/dev/null 2>&1; then
  echo 'skipped clarity accepted without offer and question receipts' >&2; exit 1
fi
[ "$(wc -l < "$SKIP_LEDGER" | tr -d ' ')" -eq 2 ] || { echo 'rejected skipped clarity mutated ledger' >&2; exit 1; }

if append_event '{"run_id":"run-ledger-1234","phase":"verify","event_type":"command_finished","status":"passed","source_type":"runtime_result","source_ref":"command-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:exit:0","message":"Fabricated pass."}' >/dev/null 2>&1; then
  echo 'caller-authored runtime result accepted' >&2; exit 1
fi

failed_rc=0
node "$RECORD_COMMAND" "$LEDGER" run-ledger-1234 verify 10 "Known failure" -- \
  node -e 'process.exit(7)' > "$WORK/failed-command.json" 2> "$WORK/failed-command-progress.log" || failed_rc=$?
[ "$failed_rc" -eq 7 ] || { echo 'command recorder hid actual nonzero exit' >&2; exit 1; }
grep -Fq '"exit_code":7' "$WORK/failed-command.json"
node "$VALIDATE" "$LEDGER" run-ledger-1234 > "$WORK/validation.json"

head_sha256="$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).head_sha256" "$WORK/validation.json")"
node "$VALIDATE" "$LEDGER" run-ledger-1234 "$head_sha256" 13 > /dev/null
zero_sha256='0000000000000000000000000000000000000000000000000000000000000000'
if node "$VALIDATE" "$LEDGER" run-ledger-1234 "$zero_sha256" 13 >/dev/null 2>&1; then
  echo 'mismatched trusted head accepted' >&2; exit 1
fi
if node "$VALIDATE" "$LEDGER" run-ledger-1234 "$head_sha256" 14 >/dev/null 2>&1; then
  echo 'mismatched trusted record count accepted' >&2; exit 1
fi
sed '$d' "$LEDGER" > "$WORK/tail-deleted.jsonl"
if node "$VALIDATE" "$WORK/tail-deleted.jsonl" run-ledger-1234 "$head_sha256" 13 >/dev/null 2>&1; then
  echo 'complete tail deletion accepted against trusted head/count' >&2; exit 1
fi

before_failed_append="$(shasum -a 256 "$LEDGER" | awk '{print $1}')"
if append_event '{"run_id":"run-ledger-1234","phase":"verify","event_type":"verification_recorded","status":"passed","source_type":"agent_claim","source_ref":"agent:self","message":"Trust me."}' >/dev/null 2>&1; then
  echo 'trusted pass accepted from agent self-report' >&2; exit 1
fi
after_failed_append="$(shasum -a 256 "$LEDGER" | awk '{print $1}')"
[ "$before_failed_append" = "$after_failed_append" ] || { echo 'failed append mutated ledger' >&2; exit 1; }

MANY_QUESTIONS_LEDGER="$WORK/many-questions-ledger.jsonl"
append_event_to "$MANY_QUESTIONS_LEDGER" '{"run_id":"run-many-questions","phase":"clarify","event_type":"run_initialized","status":"reported","source_type":"agent_claim","source_ref":"agent:primary","message":"Run initialized."}' >/dev/null
for question_index in 1 2 3 4; do
  append_event_to "$MANY_QUESTIONS_LEDGER" "{\"run_id\":\"run-many-questions\",\"phase\":\"clarify\",\"event_type\":\"question_requested\",\"status\":\"reported\",\"source_type\":\"agent_claim\",\"source_ref\":\"blocker:decision-$question_index\",\"message\":\"User chose to clarify another decision.\"}" >/dev/null
done
node "$VALIDATE" "$MANY_QUESTIONS_LEDGER" run-many-questions >/dev/null

BAD_QUESTION_LEDGER="$WORK/bad-question-ledger.jsonl"
append_event_to "$BAD_QUESTION_LEDGER" '{"run_id":"run-bad-question","phase":"clarify","event_type":"run_initialized","status":"reported","source_type":"agent_claim","source_ref":"agent:primary","message":"Run initialized."}' >/dev/null
append_event_to "$BAD_QUESTION_LEDGER" '{"run_id":"run-bad-question","phase":"execute","event_type":"question_requested","status":"reported","source_type":"agent_claim","source_ref":"blocker:late-scope","message":"Late question requested."}' >/dev/null
if node "$VALIDATE" "$BAD_QUESTION_LEDGER" run-bad-question >/dev/null 2>&1; then
  echo 'post-execute question event accepted by active ledger profile' >&2; exit 1
fi

mkdir -p "$WORK/reopen"
printf 'spec bytes\n' > "$WORK/reopen/clarified-spec.yaml"
BAD_REOPEN_LEDGER="$WORK/bad-reopen-ledger.jsonl"
append_event_to "$BAD_REOPEN_LEDGER" '{"run_id":"run-bad-reopen","phase":"clarify","event_type":"run_initialized","status":"reported","source_type":"agent_claim","source_ref":"agent:primary","message":"Run initialized."}' >/dev/null
append_event_to "$BAD_REOPEN_LEDGER" '{"run_id":"run-bad-reopen","phase":"approve","event_type":"artifact_frozen","status":"passed","source_type":"filesystem_digest","source_ref":"reopen/clarified-spec.yaml","message":"Spec frozen."}' >/dev/null
append_event_to "$BAD_REOPEN_LEDGER" '{"run_id":"run-bad-reopen","phase":"split","event_type":"spec_reopened","status":"reported","source_type":"agent_claim","source_ref":"agent:primary","message":"Spec reopened."}' >/dev/null
if node "$VALIDATE" "$BAD_REOPEN_LEDGER" run-bad-reopen >/dev/null 2>&1; then
  echo 'spec reopen accepted by active ledger profile' >&2; exit 1
fi

BAD_PREFLIGHT_LEDGER="$WORK/bad-preflight-ledger.jsonl"
append_event_to "$BAD_PREFLIGHT_LEDGER" '{"run_id":"run-bad-preflight","phase":"clarify","event_type":"run_initialized","status":"reported","source_type":"agent_claim","source_ref":"agent:primary","message":"Run initialized."}' >/dev/null
append_event_to "$BAD_PREFLIGHT_LEDGER" '{"run_id":"run-bad-preflight","phase":"split","event_type":"phase_started","status":"reported","source_type":"agent_claim","source_ref":"agent:primary","message":"Split started."}' >/dev/null
if node "$VALIDATE" "$BAD_PREFLIGHT_LEDGER" run-bad-preflight >/dev/null 2>&1; then
  echo 'split started without committed frozen spec' >&2; exit 1
fi

node - "$LEDGER" <<'NODE'
const fs = require('node:fs');
const path = process.argv[2];
const lines = fs.readFileSync(path, 'utf8').trimEnd().split('\n');
const first = JSON.parse(lines[0]);
first.message = 'rewritten history';
lines[0] = JSON.stringify(first);
fs.writeFileSync(path, `${lines.join('\n')}\n`);
NODE
if node "$VALIDATE" "$LEDGER" run-ledger-1234 >/dev/null 2>&1; then
  echo 'tampered ledger accepted' >&2; exit 1
fi

COMPLETE_DIR="$WORK/.vulpora/tasks/run-complete-1234"
COMPLETE_LEDGER="$COMPLETE_DIR/execution-ledger.jsonl"
COMPLETE_REPORT="$WORK/complete-report.json"
mkdir -p "$COMPLETE_DIR"
node - "$VALIDATE" "$COMPLETE_DIR/task-dag.yaml" <<'NODE'
const fs=require('node:fs');const {canonicalJson}=require(process.argv[2]);
const dag={schema:'vulpora.task-dag/v2',spec_id:'spec-complete',plan_id:'plan-complete',status:'ready',
  parallelism_policy:{mode:'dynamic',effective_parallelism:'min(runtime_available_slots, dependency_ready_tasks, disjoint_write_logical_scopes, higher_policy_limit)',higher_policy_limit:null,fixed_cap:null},
  clarity_gate:{status:'passed',score:100,threshold:85,skip:{requested:false,basis:null,reason:null,accepted_risk_unknown_ids:[],non_bypassable_blocker_ids:[]}},
  tasks:[{id:'T-001',title:'Validate ledger integrity',objective:'Confirm the ledger chain satisfies the acceptance contract',depends_on:[],owner_role:'executor',write_scope:['run metadata'],read_scope:['run metadata'],acceptance_criterion_ids:['AC-001'],acceptance_tests:[{method:'node --check',expected:'exit 0'}],risk:{level:'low',reason:'bounded',recovery:'revert'},authority:{tools:['repository_read'],external_effects:[],forbidden:['recursive delegation']},execution:{kind:'native-subagent',delegation_depth:0,forbidden_actions:['recursive delegation'],fallback:'none',result_schema:'vulpora.task-result/v2'},budget:{tool_calls:10},outputs:['run metadata']}],
  waves:[{id:'W-01',task_ids:['T-001']}],integration_points:[],coverage:[{acceptance_criterion_id:'AC-001',task_ids:['T-001']}],risks:[],provenance:{generated_by:'task-splitter',spec_schema:'vulpora.clarified-task-spec/v2'}};
fs.writeFileSync(process.argv[3],canonicalJson(dag));
NODE
node - "$VALIDATE" "$COMPLETE_DIR/clarity-projection.json" <<'NODE'
const fs=require('node:fs');
const {canonicalJson}=require(process.argv[2]);
const dimensions=[['goal',20],['scope',20],['acceptance',20],['constraints',15],['authority_risk',15],['verification',10]]
  .map(([id,weight])=>({id,weight,rating:4,awarded:weight,evidence:`${id==='goal'?'user':id==='authority_risk'?'policy':'repository'}: ${id} contract is observed in fixture`}));
const value={spec_status:'ready',approval:true,unknowns:[],clarity_gate:{score:100,threshold:85,status:'passed',dimensions,skip:{requested:false,basis:null,reason:null,accepted_risk_unknown_ids:[],non_bypassable_blocker_ids:[]}}};
fs.writeFileSync(process.argv[3],canonicalJson(value));
NODE
projection_sha256="$(shasum -a 256 "$COMPLETE_DIR/clarity-projection.json" | awk '{print $1}')"
node - "$VALIDATE" "$COMPLETE_DIR/clarity-projection.json" "$COMPLETE_DIR/clarified-spec.yaml" "$projection_sha256" <<'NODE'
const fs=require('node:fs');const {canonicalJson}=require(process.argv[2]);
const projection=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const spec={schema:'vulpora.clarified-task-spec/v2',spec_id:'spec-complete',status:'ready',
  clarity_projection_path:'.vulpora/tasks/run-complete-1234/clarity-projection.json',
  clarity_projection_sha256:process.argv[5],clarity_projection:projection,
  goal:'Verify ledger evidence binding.',scope:{include:['ledger contract'],exclude:[]},
  requirements:{functional:[],non_functional:[]},acceptance_criteria:[{id:'AC-001',description:'Ledger validation is observed.'}],constraints:[],assumptions:[],decisions:[],
  authority:{allowed_reads:['workspace'],allowed_writes:['run metadata'],allowed_external_effects:[],forbidden:[]},
  verification:[],provenance:{generated_by:'requirement-dialogue',question_rounds:0,source_summary:['test fixture']}};
fs.writeFileSync(process.argv[4],canonicalJson(spec));
NODE
mkdir -p "$COMPLETE_DIR/routing"
node - "$VALIDATE" "$COMPLETE_DIR/routing/T-001-A01-dispatch.json" "$COMPLETE_DIR/routing/T-001-A01-attempt.json" <<'NODE'
const fs=require('node:fs');const {canonicalJson,sha256}=require(process.argv[2]);
const dispatch={schema:'vulpora.routing-dispatch-receipt/v1',run_id:'run-complete-1234',task_id:'T-001',attempt_id:'T-001-A01',immutable:true,selected_model:'runtime-low-cost-1'};
fs.writeFileSync(process.argv[3],canonicalJson(dispatch));
const dispatchRef={path:'.vulpora/tasks/run-complete-1234/routing/T-001-A01-dispatch.json',sha256:sha256(canonicalJson(dispatch)),immutable:true};
const attempt={schema:'vulpora.routing-attempt-receipt/v1',run_id:'run-complete-1234',task_id:'T-001',attempt_id:'T-001-A01',immutable:true,dispatch_receipt:dispatchRef,mutation_state:'known_effect',failure_class:null,action:'success',budget_debit:{relative_units:1,estimated_tokens:6000},budget_remaining:{relative_units:2,estimated_tokens:12000,attempts:2,route_hops:2},runtime_reported_model:'runtime-low-cost-1'};
fs.writeFileSync(process.argv[4],canonicalJson(attempt));
NODE
node - "$VALIDATE" "$COMPLETE_DIR" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');
const [ledgerValidator,dir]=process.argv.slice(2);const {canonicalJson}=require(ledgerValidator);
const hash=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const digest=crypto.createHash('sha256').update(canonicalJson({argv:['node','--check',ledgerValidator],stdin_sha256:null})).digest('hex');
const spec={id:'spec-complete',revision:1,sha256:hash(`${dir}/clarified-spec.yaml`)};
const question={requested:false,reason:null,blocker_signature:null,asked_signatures:[]};
const task=(status)=>[{id:'T-001',status,acceptance_criterion_ids:['AC-001']}];
const common={schema:'vulpora.start-task-run-control/v1',run_id:'run-complete-1234',spec,next_spec:spec,question,successor:null};
const states=[
  {...common,current_phase:'clarify',next_phase:'approve',tasks:[],acceptance_criteria:[],acceptance_evidence:[],terminal_status:null},
  {...common,current_phase:'approve',next_phase:'split',tasks:[],acceptance_criteria:[],acceptance_evidence:[],terminal_status:null},
  {...common,current_phase:'split',next_phase:'execute',tasks:task('not_run'),acceptance_criteria:['AC-001'],acceptance_evidence:[],terminal_status:null},
  {...common,current_phase:'execute',next_phase:'integrate',tasks:task('candidate'),acceptance_criteria:['AC-001'],acceptance_evidence:[],terminal_status:null},
  {...common,current_phase:'integrate',next_phase:'verify',tasks:task('candidate'),acceptance_criteria:['AC-001'],acceptance_evidence:[],terminal_status:null},
  {...common,current_phase:'verify',next_phase:'terminal',tasks:task('verified'),acceptance_criteria:['AC-001'],acceptance_evidence:[{acceptance_criterion_id:'AC-001',task_id:'T-001',verification_outcome:'pass',observed_ref:`command-sha256:${digest}`}],terminal_status:'complete'},
];
states.forEach((state,index)=>fs.writeFileSync(`${dir}/run-control-${String(index+1).padStart(4,'0')}.json`,canonicalJson(state)));
NODE
phase_event() {
  phase="$1"; event_type="$2"; message="$3"
  append_event_to "$COMPLETE_LEDGER" "{\"run_id\":\"run-complete-1234\",\"phase\":\"$phase\",\"event_type\":\"$event_type\",\"status\":\"reported\",\"source_type\":\"agent_claim\",\"source_ref\":\"agent:primary\",\"message\":\"$message\"}" >/dev/null
}
control_event() {
  phase="$1"; index="$2"
  append_event_to "$COMPLETE_LEDGER" "{\"run_id\":\"run-complete-1234\",\"phase\":\"$phase\",\"event_type\":\"run_control_state_frozen\",\"status\":\"passed\",\"source_type\":\"filesystem_digest\",\"source_ref\":\".vulpora/tasks/run-complete-1234/run-control-$index.json\",\"message\":\"Run control state frozen.\"}" >/dev/null
}
phase_event clarify phase_started 'Clarify started.'
phase_event clarify run_initialized 'Run initialized.'
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"clarify","event_type":"child_dispatched","status":"reported","source_type":"agent_claim","source_ref":"child:requirement-dialogue:child-clarify","message":"Requirement dialogue dispatched."}' >/dev/null
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"clarify","event_type":"clarification_round_started","status":"reported","source_type":"agent_claim","source_ref":"child:requirement-dialogue:child-clarify:round:0:input-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","message":"Clarification round 0 started from the scored projection."}' >/dev/null
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"clarify","event_type":"clarification_heartbeat","status":"reported","source_type":"agent_claim","source_ref":"child:requirement-dialogue:child-clarify:round:0:heartbeat-sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","message":"Clarification child produced observable progress."}' >/dev/null
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"clarify","event_type":"clarification_round_finished","status":"reported","source_type":"agent_claim","source_ref":"child:requirement-dialogue:child-clarify:round:0:output-sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc:score:100:status:ready","message":"Clarification round 0 returned a ready result."}' >/dev/null
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"clarify","event_type":"child_finished","status":"reported","source_type":"agent_claim","source_ref":"child:requirement-dialogue:child-clarify","message":"Requirement dialogue returned."}' >/dev/null
control_event clarify 0001
phase_event clarify phase_finished 'Clarify finished.'
phase_event approve phase_started 'Approve started.'
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"approve","event_type":"spec_committed","status":"reported","source_type":"user_decision","source_ref":"task-input-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","message":"Actionable implementation request committed the spec."}' >/dev/null
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"approve","event_type":"clarity_projection_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-complete-1234/clarity-projection.json","message":"Clarity projection frozen."}' >/dev/null
(cd "$WORK" && node "$RECORD_COMMAND" "$COMPLETE_LEDGER" run-complete-1234 approve 10 'Clarity gate validation' \
  --stdin-file '.vulpora/tasks/run-complete-1234/clarity-projection.json' --contract clarity-gate -- \
  node "$CLARITY_VALIDATOR") >/dev/null 2>> "$WORK/complete-progress.log"
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"approve","event_type":"artifact_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-complete-1234/clarified-spec.yaml","message":"Spec frozen."}' >/dev/null
control_event approve 0002
phase_event approve phase_finished 'Approve finished.'
phase_event split phase_started 'Split started.'
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"split","event_type":"child_dispatched","status":"reported","source_type":"agent_claim","source_ref":"child:task-splitter:child-split","message":"Task splitter dispatched."}' >/dev/null
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"split","event_type":"child_finished","status":"reported","source_type":"agent_claim","source_ref":"child:task-splitter:child-split","message":"Task splitter returned."}' >/dev/null
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"split","event_type":"artifact_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-complete-1234/task-dag.yaml","message":"DAG frozen."}' >/dev/null
control_event split 0003
phase_event split phase_finished 'Split finished.'
phase_event execute phase_started 'Execute started.'
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"execute","event_type":"routing_dispatch_receipt_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-complete-1234/routing/T-001-A01-dispatch.json","message":"Dispatch receipt frozen."}' >/dev/null
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"execute","event_type":"child_dispatched","status":"reported","source_type":"agent_claim","source_ref":"child:execution-1:child-execution-1","message":"Execution child dispatched."}' >/dev/null
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"execute","event_type":"child_finished","status":"reported","source_type":"agent_claim","source_ref":"child:execution-1:child-execution-1","message":"Execution child returned."}' >/dev/null
append_event_to "$COMPLETE_LEDGER" '{"run_id":"run-complete-1234","phase":"execute","event_type":"routing_attempt_receipt_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-complete-1234/routing/T-001-A01-attempt.json","message":"Attempt receipt frozen."}' >/dev/null
control_event execute 0004
phase_event execute phase_finished 'Execute finished.'
phase_event integrate phase_started 'Integrate started.'
phase_event integrate integration_recorded 'Integration reported.'
control_event integrate 0005
phase_event integrate phase_finished 'Integrate finished.'
phase_event verify phase_started 'Verify started.'
(cd "$WORK" && node "$RECORD_COMMAND" "$COMPLETE_LEDGER" run-complete-1234 verify 10 'Ledger validator syntax verification' -- \
  node --check "$VALIDATE") >/dev/null 2>> "$WORK/complete-progress.log"
phase_event verify verification_recorded 'Verification evidence recorded.'
control_event verify 0006
phase_event verify phase_finished 'Verify finished.'
phase_event terminal phase_started 'Terminal started.'
phase_event terminal terminal_recorded 'Terminal report recorded.'
phase_event terminal phase_finished 'Terminal finished.'
node "$VALIDATE" "$COMPLETE_LEDGER" run-complete-1234 > "$WORK/complete-validation.json"
complete_head="$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).head_sha256" "$WORK/complete-validation.json")"
complete_count="$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).record_count" "$WORK/complete-validation.json")"
node - "$COMPLETE_REPORT" "$COMPLETE_DIR" "$complete_head" "$complete_count" "$CLARITY_VALIDATOR" "$VALIDATE" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');
const [out,dir,head,countText,clarityValidator,ledgerValidator]=process.argv.slice(2);
const {canonicalJson,sha256}=require(ledgerValidator);
const hash=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const runId='run-complete-1234';
const dispatchReceipt={path:`.vulpora/tasks/${runId}/routing/T-001-A01-dispatch.json`,sha256:hash(`${dir}/routing/T-001-A01-dispatch.json`),immutable:true};
const attemptReceipt={path:`.vulpora/tasks/${runId}/routing/T-001-A01-attempt.json`,sha256:hash(`${dir}/routing/T-001-A01-attempt.json`),immutable:true};
const routeBinding=sha256(canonicalJson({attempt_id:'T-001-A01',dispatch_receipt:dispatchReceipt}));
const report={schema_version:'vulpora.orchestration-report/v3',run_id:runId,runtime:'codex',terminal_status:'complete',
  clarified_spec:{schema:'vulpora.clarified-task-spec/v2',id:'spec-complete',status:'approved',path:`.vulpora/tasks/${runId}/clarified-spec.yaml`,sha256:hash(`${dir}/clarified-spec.yaml`)},
  task_dag:{path:`.vulpora/tasks/${runId}/task-dag.yaml`,sha256:hash(`${dir}/task-dag.yaml`)},
  clarity_gate_evidence:{projection_path:`.vulpora/tasks/${runId}/clarity-projection.json`,projection_sha256:hash(`${dir}/clarity-projection.json`)},
  execution_ledger:{path:`.vulpora/tasks/${runId}/execution-ledger.jsonl`,record_count:Number(countText),head_sha256:head,integrity_level:'local_tamper_evident',validator_outcome:'pass',external_anchor:null},
  children:[{agent_id:'requirement-dialogue',native_child_id:'child-clarify',outcome:'pass'},{agent_id:'task-splitter',native_child_id:'child-split',outcome:'pass'},
    {agent_id:'execution-1',native_child_id:'child-execution-1',runtime_reported_model:'runtime-low-cost-1',inheritance_used:false,
      handoff:{schema:'vulpora.subagent-handoff/v2',task_id:'T-001',attempt_id:'T-001-A01',result_schema:'vulpora.task-result/v2',spec_slice:{spec_id:'spec-complete',acceptance_criterion_ids:['AC-001']},write_scope:['run metadata'],dispatch_receipt:dispatchReceipt,route_binding_sha256:routeBinding}}],
  task_results:[{schema:'vulpora.task-result/v2',task_id:'T-001',attempt_id:'T-001-A01',status:'verified',mutation_state:'known_effect',acceptance_evidence:[{acceptance_criterion_id:'AC-001',verification_index:1,outcome:'pass',observed_ref:'command-sha256:'+sha256(canonicalJson({argv:['node','--check',ledgerValidator],stdin_sha256:null}))}]}],
  routing_attempts:[{task_id:'T-001',attempt_id:'T-001-A01',dispatch_receipt:dispatchReceipt,attempt_receipt:attemptReceipt,
    mutation_state:'known_effect',failure_class:null,action:'success',budget_debit:{relative_units:1,estimated_tokens:6000},
    budget_remaining:{relative_units:2,estimated_tokens:12000,attempts:2,route_hops:2},runtime_reported_model:'runtime-low-cost-1'}],
  verification:[
    {argv:[process.execPath,clarityValidator],stdin_sha256:hash(`${dir}/clarity-projection.json`),exit_code:0,outcome:'pass'},
    {argv:['node','--check',ledgerValidator],stdin_sha256:null,exit_code:0,outcome:'pass'},
  ]};
fs.writeFileSync(out,JSON.stringify(report));
NODE
node "$VALIDATE" "$COMPLETE_LEDGER" run-complete-1234 "$complete_head" "$complete_count" complete "$COMPLETE_REPORT" "$WORK" >/dev/null
node - "$VALIDATE" "$COMPLETE_LEDGER" <<'NODE'
const validator=require(process.argv[2]);
const records=validator.validateLedgerFile(process.argv[3],'run-complete-1234').records;
const withoutCommit=records.filter((record)=>record.event_type!=='spec_committed');
let missingCode=null;
try{validator.validateLifecycle(withoutCommit,'complete');}catch(error){missingCode=error.code;}
if(missingCode!=='MISSING_SPEC_COMMIT_EVIDENCE')process.exit(1);
const refrozen=[...records];
const candidate={...records.find((record)=>record.phase==='approve'&&record.event_type==='artifact_frozen'),phase:'execute',sequence:999};
refrozen.splice(refrozen.findIndex((record)=>record.phase==='execute')+1,0,candidate);
let refrozenCode=null;
try{validator.validateLifecycle(refrozen,'complete');}catch(error){refrozenCode=error.code;}
if(refrozenCode!=='FROZEN_CONTRACT_REWRITTEN')process.exit(1);
NODE
cp "$COMPLETE_DIR/routing/T-001-A01-attempt.json" "$WORK/attempt-receipt.backup"
printf '{"tampered":true}' > "$COMPLETE_DIR/routing/T-001-A01-attempt.json"
if node "$VALIDATE" "$COMPLETE_LEDGER" run-complete-1234 "$complete_head" "$complete_count" complete "$COMPLETE_REPORT" "$WORK" >/dev/null 2>&1; then
  echo 'tampered routing attempt receipt accepted' >&2; exit 1
fi
mv "$WORK/attempt-receipt.backup" "$COMPLETE_DIR/routing/T-001-A01-attempt.json"
node - "$COMPLETE_REPORT" "$WORK/route-model-mismatch-report.json" <<'NODE'
const fs=require('node:fs');const [src,out]=process.argv.slice(2);const report=JSON.parse(fs.readFileSync(src));
report.routing_attempts[0].runtime_reported_model='different-model';report.children[2].runtime_reported_model='different-model';
fs.writeFileSync(out,JSON.stringify(report));
NODE
if node "$VALIDATE" "$COMPLETE_LEDGER" run-complete-1234 "$complete_head" "$complete_count" complete "$WORK/route-model-mismatch-report.json" "$WORK" >/dev/null 2>&1; then
  echo 'routing runtime/dispatch model mismatch accepted' >&2; exit 1
fi
node - "$VALIDATE" "$COMPLETE_DIR/clarified-spec.yaml" "$COMPLETE_DIR/clarity-projection.json" "$projection_sha256" <<'NODE'
const fs=require('node:fs');const api=require(process.argv[2]);
const projectionBytes=fs.readFileSync(process.argv[4]);const projection=JSON.parse(projectionBytes);
const spec=JSON.parse(fs.readFileSync(process.argv[3]));spec.clarity_projection.approval=false;
let code=null;try{api.validateSpecProjectionBinding(api.canonicalJson(spec),projection,projectionBytes,
  '.vulpora/tasks/run-complete-1234/clarity-projection.json',process.argv[5]);}catch(error){code=error.code;}
if(code!=='COMPLETE_SPEC_CLARITY_PROJECTION_MISMATCH')process.exit(1);
NODE
node - "$COMPLETE_REPORT" "$WORK/unbound-stdin-report.json" <<'NODE'
const fs=require('node:fs');const [src,out]=process.argv.slice(2);const report=JSON.parse(fs.readFileSync(src));
report.verification.find((check)=>check.argv.at(-1).endsWith('validate-clarity-gate.js')).stdin_sha256='f'.repeat(64);
fs.writeFileSync(out,JSON.stringify(report));
NODE
if node "$VALIDATE" "$COMPLETE_LEDGER" run-complete-1234 "$complete_head" "$complete_count" complete "$WORK/unbound-stdin-report.json" "$WORK" >/dev/null 2>&1; then
  echo 'clarity validator stdin accepted without frozen projection binding' >&2; exit 1
fi

node - "$VALIDATE" "$COMPLETE_LEDGER" "$WORK/broken-boundary.jsonl" "$WORK/unpaired-child.jsonl" <<'NODE'
const fs = require('node:fs');
const {canonicalJson, sha256, ZERO_SHA256} = require(process.argv[2]);
const records = fs.readFileSync(process.argv[3], 'utf8').trimEnd().split('\n').map(JSON.parse);
function rewrite(rows, output) {
  let previous = ZERO_SHA256;
  const rewritten = rows.map((record, index) => {
    const unsigned = {...record, sequence: index + 1, previous_sha256: previous};
    delete unsigned.event_sha256;
    const next = {...unsigned, event_sha256: sha256(canonicalJson(unsigned))};
    previous = next.event_sha256;
    return canonicalJson(next);
  });
  fs.writeFileSync(output, `${rewritten.join('\n')}\n`);
}
const brokenBoundary = structuredClone(records);
[brokenBoundary[0], brokenBoundary[1]] = [brokenBoundary[1], brokenBoundary[0]];
rewrite(brokenBoundary, process.argv[4]);
rewrite(records.filter((record) => !(record.event_type === 'child_finished'
  && record.source_ref === 'child:task-splitter:child-split')), process.argv[5]);
NODE
node - "$VALIDATE" "$WORK/broken-boundary.jsonl" "$WORK/unpaired-child.jsonl" <<'NODE'
const fs=require('node:fs');const {parseLedger,validateLifecycle}=require(process.argv[2]);
const cases=[[process.argv[3],'INVALID_PHASE_BOUNDARY_ORDER'],[process.argv[4],'CHILD_DISPATCH_WITHOUT_FINISH']];
for(const [file,expected] of cases){
  const records=parseLedger(fs.readFileSync(file,'utf8'),{requireCompleteCommands:true}).records;
  let code=null;try{validateLifecycle(records,'complete');}catch(error){code=error.code;}
  if(code!==expected){process.stderr.write(`unexpected lifecycle error:${code}:expected:${expected}\n`);process.exit(1);}
}
NODE

CLAIM_DIR="$WORK/.vulpora/tasks/run-claims-1234"
CLAIM_ONLY_LEDGER="$CLAIM_DIR/execution-ledger.jsonl"
mkdir -p "$CLAIM_DIR"
claim_event() {
  phase="$1"; event_type="$2"; source_ref="${3:-agent:primary}"
  append_event_to "$CLAIM_ONLY_LEDGER" "{\"run_id\":\"run-claims-1234\",\"phase\":\"$phase\",\"event_type\":\"$event_type\",\"status\":\"reported\",\"source_type\":\"agent_claim\",\"source_ref\":\"$source_ref\",\"message\":\"Claim-only event.\"}" >/dev/null
}
for phase in clarify approve split execute integrate verify terminal; do
  claim_event "$phase" phase_started
  case "$phase" in
    clarify)
      claim_event clarify run_initialized
      claim_event clarify child_dispatched child:requirement-dialogue:child-clarify
      claim_event clarify child_finished child:requirement-dialogue:child-clarify
      claim_event clarify clarity_gate_validated
      ;;
    approve) claim_event approve clarity_projection_frozen artifact:projection ;;
    split)
      claim_event split child_dispatched child:task-splitter:child-split
      claim_event split child_finished child:task-splitter:child-split
      claim_event split artifact_frozen artifact:spec
      claim_event split artifact_frozen artifact:dag
      ;;
    integrate) claim_event integrate integration_recorded ;;
    verify) claim_event verify verification_recorded ;;
    terminal) claim_event terminal terminal_recorded ;;
  esac
  claim_event "$phase" phase_finished
done
claim_head="$(tail -n 1 "$CLAIM_ONLY_LEDGER" | node -pe 'JSON.parse(require("node:fs").readFileSync(0,"utf8")).event_sha256')"
claim_count="$(wc -l < "$CLAIM_ONLY_LEDGER" | tr -d ' ')"
cp "$COMPLETE_DIR/clarified-spec.yaml" "$CLAIM_DIR/clarified-spec.yaml"
cp "$COMPLETE_DIR/task-dag.yaml" "$CLAIM_DIR/task-dag.yaml"
cp "$COMPLETE_DIR/clarity-projection.json" "$CLAIM_DIR/clarity-projection.json"
node - "$COMPLETE_REPORT" "$WORK/claim-report.json" "$CLAIM_DIR" "$claim_head" "$claim_count" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');const [src,out,dir,head,count]=process.argv.slice(2);
const report=JSON.parse(fs.readFileSync(src));const hash=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
report.run_id='run-claims-1234';report.clarified_spec={path:'.vulpora/tasks/run-claims-1234/clarified-spec.yaml',sha256:hash(`${dir}/clarified-spec.yaml`)};
report.task_dag={path:'.vulpora/tasks/run-claims-1234/task-dag.yaml',sha256:hash(`${dir}/task-dag.yaml`)};
report.clarity_gate_evidence={projection_path:'.vulpora/tasks/run-claims-1234/clarity-projection.json',projection_sha256:hash(`${dir}/clarity-projection.json`)};
report.execution_ledger={...report.execution_ledger,path:'.vulpora/tasks/run-claims-1234/execution-ledger.jsonl',head_sha256:head,record_count:Number(count)};
report.children=report.children.slice(0,2);report.task_results=[];report.routing_attempts=[];
fs.writeFileSync(out,JSON.stringify(report));
NODE
if node "$VALIDATE" "$CLAIM_ONLY_LEDGER" run-claims-1234 "$claim_head" "$claim_count" complete "$WORK/claim-report.json" "$WORK" >/dev/null 2>&1; then
  echo 'claim-only ledger accepted as complete' >&2; exit 1
fi

cp "$COMPLETE_REPORT" "$WORK/visibility-report.json"
node - "$COMPLETE_LEDGER" "$WORK/codex-tool-only.jsonl" "$WORK/codex-visible.jsonl" "$WORK/codex-extra.jsonl" "$WORK/claude-visible.jsonl" <<'NODE'
const fs = require('node:fs');
const [ledgerPath, toolOnlyPath, codexVisiblePath, codexExtraPath, claudeVisiblePath] = process.argv.slice(2);
const records = fs.readFileSync(ledgerPath, 'utf8').trimEnd().split('\n').map(JSON.parse);
const lines = records.map((record) => (
  `작업 로그: #${record.sequence} ${record.phase}/${record.event_type} — ${record.message} [head ${record.event_sha256.slice(0, 12)}]`
));
const start = {id: 2, result: {thread: {id: 'top-thread'}}};
const toolOnly = {method: 'item/completed', params: {threadId: 'top-thread', item: {type: 'commandExecution', output: lines.join('\n')}}};
const visible = {method: 'item/completed', params: {threadId: 'top-thread', item: {type: 'agentMessage', text: lines.join('\n')}}};
fs.writeFileSync(toolOnlyPath, `${JSON.stringify(start)}\n${JSON.stringify(toolOnly)}\n`);
fs.writeFileSync(codexVisiblePath, `${JSON.stringify(start)}\n${JSON.stringify(visible)}\n`);
const extra = {method: 'item/completed', params: {threadId: 'top-thread', item: {type: 'agentMessage', text: `작업 로그: #999 verify/fabricated — not in ledger [head 000000000000]\n${lines.join('\n')}`}}};
fs.writeFileSync(codexExtraPath, `${JSON.stringify(start)}\n${JSON.stringify(extra)}\n`);
const claudeVisible = {type: 'assistant', message: {content: [{type: 'text', text: lines.join('\n')}]}};
fs.writeFileSync(claudeVisiblePath, `${JSON.stringify(claudeVisible)}\n`);
NODE
if node "$VALIDATE_VISIBILITY" "$WORK/codex-tool-only.jsonl" "$COMPLETE_LEDGER" "$WORK/visibility-report.json" >/dev/null 2>&1; then
  echo 'raw tool output accepted as user-visible progress' >&2; exit 1
fi
node "$VALIDATE_VISIBILITY" "$WORK/codex-visible.jsonl" "$COMPLETE_LEDGER" "$WORK/visibility-report.json" >/dev/null
if node "$VALIDATE_VISIBILITY" "$WORK/codex-extra.jsonl" "$COMPLETE_LEDGER" "$WORK/visibility-report.json" >/dev/null 2>&1; then
  echo 'fabricated extra progress accepted' >&2; exit 1
fi
node - "$WORK/visibility-report.json" <<'NODE'
const fs = require('node:fs');
const path = process.argv[2];
const report = JSON.parse(fs.readFileSync(path, 'utf8'));
report.runtime = 'claude-code';
fs.writeFileSync(path, JSON.stringify(report));
NODE
node "$VALIDATE_VISIBILITY" "$WORK/claude-visible.jsonl" "$COMPLETE_LEDGER" "$WORK/visibility-report.json" >/dev/null

printf '{"semantic_ac_key":"tamper_evident_execution_ledger","outcome":"pass","hash_chain":true,"append_only_writer":true,"trusted_append_api_not_exported":true,"recorder_progress_line":true,"assistant_visible_progress_verified":true,"raw_tool_output_rejected_as_progress":true,"extra_progress_rejected":true,"filesystem_digest_observed":true,"command_exit_observed":true,"command_stdin_observed":true,"pre_execution_clarity_ordered":true,"claim_only_active_rejected":true,"skipped_consent_preflight":true,"lookalike_validator_rejected":true,"trusted_node_runtime_forced":true,"clarity_projection_bound_to_frozen_spec":true,"contradictory_embedded_projection_rejected":true,"unbound_clarity_stdin_rejected":true,"no_fixed_question_limit":true,"routing_receipts_hash_bound":true,"routing_receipts_ledger_bound":true,"routing_receipt_tamper_rejected":true,"routing_runtime_model_mismatch_rejected":true,"fabricated_runtime_result_rejected":true,"agent_claim_not_trusted":true,"claim_only_complete_rejected":true,"phase_boundaries_ordered":true,"child_pairs_required":true,"complete_lifecycle_profile":true,"trusted_head_count_checked":true,"tail_deletion_rejected_with_anchor":true,"tampering_rejected":true,"absolute_immutability_claimed":false}\n'
