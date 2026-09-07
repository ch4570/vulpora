#!/usr/bin/env bash
set -eu
DIR="$(cd "$(dirname "$0")" && pwd -P)"; ROOT="$(cd "$DIR/.." && pwd -P)"
VALID="$ROOT/skills/start-task/reference/kb/orchestration-report.valid.json"
VALIDATOR="$ROOT/skills/start-task/scripts/validate-terminal-response.js"
RESUME_VALIDATOR="$ROOT/skills/start-task/scripts/validate-resume-checkpoint.js"
LEDGER_APPEND="$ROOT/skills/start-task/scripts/append-execution-ledger.js"
LEDGER_VALIDATE="$ROOT/skills/start-task/scripts/validate-execution-ledger.js"
RECORD_COMMAND="$ROOT/skills/start-task/scripts/record-execution-command.js"
CLARITY_VALIDATOR="$ROOT/skills/start-task/scripts/validate-clarity-gate.js"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-terminal-response.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

node - "$VALID" "$WORK/partial.json" <<'NODE'
const fs=require('node:fs'); const [src,out]=process.argv.slice(2); const x=JSON.parse(fs.readFileSync(src));
x.phases[5].outcome='failed';
x.verification.push({argv:['external endpoint check'],stdin_sha256:null,exit_code:null,timeout_seconds:30,outcome:'not_run',network_attempts:0,network_successes:0});
x.gaps=['AC-EXTERNAL: 실행 환경이 없어 외부 검증을 하지 못했다.'];
x.continuation={status:'ready_to_resume',resumable:true,same_session_only:false,resume_from:'verify',completed_task_ids:['T-001'],pending_task_ids:[],remaining_acceptance_criterion_ids:['AC-EXTERNAL'],blocker:'실행 환경이 없다.',next_action:'실행 환경이 준비되면 외부 검증만 재개한다.',question:null,resume_conditions:['frozen hash 일치','workspace fingerprint 일치'],workspace_snapshot:x.continuation.workspace_snapshot,preserved_artifacts:[{path:x.clarified_spec.path,sha256:x.clarified_spec.sha256},{path:x.task_dag.path,sha256:x.task_dag.sha256}]};
x.terminal_status='partial'; fs.writeFileSync(out,JSON.stringify(x));
NODE

REPO="$WORK/repo"
RUN_DIR="$REPO/.vulpora/tasks/run-12345678"
ledger_path="$RUN_DIR/execution-ledger.jsonl"
mkdir -p "$RUN_DIR"
node - "$LEDGER_VALIDATE" "$RUN_DIR/clarity-projection.json" <<'NODE'
const fs=require('node:fs');const {canonicalJson}=require(process.argv[2]);
const dimensions=[['goal',20],['scope',20],['acceptance',20],['constraints',15],['authority_risk',15],['verification',10]]
  .map(([id,weight])=>({id,weight,rating:4,awarded:weight,evidence:`${id==='goal'?'user':id==='authority_risk'?'policy':'repository'}: ${id} contract is observed in fixture`}));
const value={spec_status:'ready',approval:true,unknowns:[],clarity_gate:{score:100,threshold:85,status:'passed',dimensions,skip:{requested:false,basis:null,reason:null,accepted_risk_unknown_ids:[],non_bypassable_blocker_ids:[]}}};
fs.writeFileSync(process.argv[3],canonicalJson(value));
NODE
projection_sha="$(shasum -a 256 "$RUN_DIR/clarity-projection.json" | awk '{print $1}')"
node - "$LEDGER_VALIDATE" "$RUN_DIR/clarity-projection.json" "$RUN_DIR/clarified-spec.yaml" "$projection_sha" <<'NODE'
const fs=require('node:fs');const {canonicalJson}=require(process.argv[2]);const projection=JSON.parse(fs.readFileSync(process.argv[3]));
const spec={schema:'vulpora.clarified-task-spec/v2',spec_id:'spec-1',status:'ready',
  clarity_projection_path:'.vulpora/tasks/run-12345678/clarity-projection.json',clarity_projection_sha256:process.argv[5],
  clarity_projection:projection,goal:'Resume verified partial work.',scope:{include:['verification'],exclude:[]},
  requirements:{functional:[],non_functional:[]},acceptance_criteria:[{id:'AC-001',description:'Implementation evidence passes.'},{id:'AC-EXTERNAL',description:'External verification passes.'}],constraints:[],assumptions:[],decisions:[],
  authority:{allowed_reads:['workspace'],allowed_writes:[],allowed_external_effects:[],forbidden:[]},verification:[],
  provenance:{generated_by:'requirement-dialogue',question_rounds:0,source_summary:['test fixture']}};
fs.writeFileSync(process.argv[4],canonicalJson(spec));
NODE
node - "$LEDGER_VALIDATE" "$RUN_DIR/task-dag.yaml" <<'NODE'
const fs=require('node:fs');const {canonicalJson}=require(process.argv[2]);
const dag={schema:'vulpora.task-dag/v2',spec_id:'spec-1',plan_id:'plan-partial',status:'ready',
  parallelism_policy:{mode:'dynamic',effective_parallelism:'min(runtime_available_slots, dependency_ready_tasks, disjoint_write_logical_scopes, higher_policy_limit)',higher_policy_limit:null,fixed_cap:null},
  clarity_gate:{status:'passed',score:100,threshold:85,skip:{requested:false,basis:null,reason:null,accepted_risk_unknown_ids:[],non_bypassable_blocker_ids:[]}},
  tasks:[{id:'T-001',title:'Resume verification',objective:'verify remaining work',depends_on:[],owner_role:'verifier',write_scope:[],read_scope:['workspace'],acceptance_criterion_ids:['AC-001','AC-EXTERNAL'],acceptance_tests:[{method:'inspect',expected:'pass'}],risk:{level:'low',reason:'read only',recovery:'none'},authority:{tools:['repository_read'],external_effects:[],forbidden:['recursive delegation']},execution:{kind:'native-subagent',delegation_depth:0,forbidden_actions:['recursive delegation'],fallback:'none',result_schema:'vulpora.task-result/v2'},budget:{tool_calls:10},outputs:[]}],
  waves:[{id:'W-01',task_ids:['T-001']}],integration_points:[],coverage:[{acceptance_criterion_id:'AC-001',task_ids:['T-001']},{acceptance_criterion_id:'AC-EXTERNAL',task_ids:['T-001']}],risks:[],provenance:{generated_by:'task-splitter',spec_schema:'vulpora.clarified-task-spec/v2'}};
fs.writeFileSync(process.argv[3],canonicalJson(dag));
NODE
node - "$LEDGER_VALIDATE" "$RUN_DIR" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');const {canonicalJson}=require(process.argv[2]);const dir=process.argv[3];
const specSha=crypto.createHash('sha256').update(fs.readFileSync(`${dir}/clarified-spec.yaml`)).digest('hex');
const spec={id:'spec-1',revision:1,sha256:specSha};const question={requested:false,reason:null,blocker_signature:null,asked_signatures:[]};
const passDigest=crypto.createHash('sha256').update(canonicalJson({argv:['node','--test'],stdin_sha256:null})).digest('hex');
const evidence=[{acceptance_criterion_id:'AC-001',task_id:'T-001',verification_outcome:'pass',observed_ref:`command-sha256:${passDigest}`}];
const task=(status)=>[{id:'T-001',status,acceptance_criterion_ids:['AC-001','AC-EXTERNAL']}];
const common={schema:'vulpora.start-task-run-control/v1',run_id:'run-12345678',spec,next_spec:spec,question,successor:null};
const states=[
  {...common,current_phase:'clarify',next_phase:'approve',tasks:[],acceptance_criteria:[],acceptance_evidence:[],terminal_status:null},
  {...common,current_phase:'approve',next_phase:'split',tasks:[],acceptance_criteria:[],acceptance_evidence:[],terminal_status:null},
  {...common,current_phase:'split',next_phase:'execute',tasks:task('not_run'),acceptance_criteria:['AC-001','AC-EXTERNAL'],acceptance_evidence:[],terminal_status:null},
  {...common,current_phase:'execute',next_phase:'integrate',tasks:task('verified'),acceptance_criteria:['AC-001','AC-EXTERNAL'],acceptance_evidence:evidence,terminal_status:null},
  {...common,current_phase:'integrate',next_phase:'verify',tasks:task('verified'),acceptance_criteria:['AC-001','AC-EXTERNAL'],acceptance_evidence:evidence,terminal_status:null},
  {...common,current_phase:'verify',next_phase:'terminal',tasks:task('verified'),acceptance_criteria:['AC-001','AC-EXTERNAL'],acceptance_evidence:evidence,terminal_status:'partial'},
];
states.forEach((state,index)=>fs.writeFileSync(`${dir}/run-control-${String(index+1).padStart(4,'0')}.json`,canonicalJson(state)));
NODE
mkdir -p "$RUN_DIR/routing"
node - "$LEDGER_VALIDATE" "$RUN_DIR/routing/T-001-A01-dispatch.json" "$RUN_DIR/routing/T-001-A01-attempt.json" <<'NODE'
const fs=require('node:fs');const {canonicalJson,sha256}=require(process.argv[2]);
const dispatch={schema:'vulpora.routing-dispatch-receipt/v1',run_id:'run-12345678',task_id:'T-001',attempt_id:'T-001-A01',immutable:true,selected_model:'runtime-low-cost-1'};
fs.writeFileSync(process.argv[3],canonicalJson(dispatch));
const dispatchRef={path:'.vulpora/tasks/run-12345678/routing/T-001-A01-dispatch.json',sha256:sha256(canonicalJson(dispatch)),immutable:true};
const attempt={schema:'vulpora.routing-attempt-receipt/v1',run_id:'run-12345678',task_id:'T-001',attempt_id:'T-001-A01',immutable:true,dispatch_receipt:dispatchRef,mutation_state:'known_effect',failure_class:null,action:'success',budget_debit:{relative_units:1,estimated_tokens:6000},budget_remaining:{relative_units:2,estimated_tokens:12000,attempts:2,route_hops:2},runtime_reported_model:'runtime-low-cost-1'};
fs.writeFileSync(process.argv[4],canonicalJson(attempt));
NODE
append_resume_event() {
  (cd "$REPO" && printf '%s' "$1" | node "$LEDGER_APPEND" "$ledger_path") >/dev/null
}
append_resume_event '{"run_id":"run-12345678","phase":"clarify","event_type":"run_initialized","status":"reported","source_type":"agent_claim","source_ref":"agent:primary","message":"Run initialization requested."}'
append_resume_event '{"run_id":"run-12345678","phase":"clarify","event_type":"run_control_state_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-12345678/run-control-0001.json","message":"Run control state frozen."}'
append_resume_event '{"run_id":"run-12345678","phase":"approve","event_type":"spec_committed","status":"reported","source_type":"user_decision","source_ref":"task-input-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","message":"Implementation intent committed."}'
append_resume_event '{"run_id":"run-12345678","phase":"approve","event_type":"clarity_projection_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-12345678/clarity-projection.json","message":"Clarity projection frozen."}'
(cd "$REPO" && node "$RECORD_COMMAND" "$ledger_path" run-12345678 approve 10 'Clarity gate validation' \
  --stdin-file '.vulpora/tasks/run-12345678/clarity-projection.json' --contract clarity-gate -- \
  node "$CLARITY_VALIDATOR") >/dev/null 2>/dev/null
append_resume_event '{"run_id":"run-12345678","phase":"approve","event_type":"artifact_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-12345678/clarified-spec.yaml","message":"Spec frozen."}'
append_resume_event '{"run_id":"run-12345678","phase":"approve","event_type":"run_control_state_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-12345678/run-control-0002.json","message":"Run control state frozen."}'
append_resume_event '{"run_id":"run-12345678","phase":"split","event_type":"artifact_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-12345678/task-dag.yaml","message":"DAG frozen."}'
append_resume_event '{"run_id":"run-12345678","phase":"split","event_type":"run_control_state_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-12345678/run-control-0003.json","message":"Run control state frozen."}'
append_resume_event '{"run_id":"run-12345678","phase":"execute","event_type":"routing_dispatch_receipt_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-12345678/routing/T-001-A01-dispatch.json","message":"Dispatch receipt frozen."}'
append_resume_event '{"run_id":"run-12345678","phase":"execute","event_type":"routing_attempt_receipt_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-12345678/routing/T-001-A01-attempt.json","message":"Attempt receipt frozen."}'
append_resume_event '{"run_id":"run-12345678","phase":"execute","event_type":"run_control_state_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-12345678/run-control-0004.json","message":"Run control state frozen."}'
append_resume_event '{"run_id":"run-12345678","phase":"integrate","event_type":"run_control_state_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-12345678/run-control-0005.json","message":"Run control state frozen."}'
(cd "$REPO" && node "$RECORD_COMMAND" "$ledger_path" run-12345678 verify 10 'Partial acceptance verification' -- node --test) >/dev/null 2>/dev/null
append_resume_event '{"run_id":"run-12345678","phase":"verify","event_type":"run_control_state_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/run-12345678/run-control-0006.json","message":"Run control state frozen."}'
node "$LEDGER_VALIDATE" "$ledger_path" run-12345678 > "$WORK/ledger-validation.json"
node - "$WORK/partial.json" "$WORK/ledger-validation.json" "$RUN_DIR" "$CLARITY_VALIDATOR" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');
const [reportPath,ledgerPath,runDir,clarityValidator]=process.argv.slice(2);
const report=JSON.parse(fs.readFileSync(reportPath));
const ledger=JSON.parse(fs.readFileSync(ledgerPath));
const hash=(name)=>crypto.createHash('sha256').update(fs.readFileSync(`${runDir}/${name}`)).digest('hex');
const canonical=(value)=>{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;};
const digest=(value)=>crypto.createHash('sha256').update(canonical(value)).digest('hex');
report.clarified_spec.sha256=hash('clarified-spec.yaml');
report.task_dag.sha256=hash('task-dag.yaml');
report.clarity_gate_evidence.projection_sha256=hash('clarity-projection.json');
report.children[2].handoff.spec_slice.acceptance_criterion_ids=['AC-001','AC-EXTERNAL'];
const clarityCheck=report.verification.find((check)=>check.argv.at(-1).endsWith('validate-clarity-gate.js'));
clarityCheck.argv=[process.execPath,clarityValidator];
clarityCheck.stdin_sha256=report.clarity_gate_evidence.projection_sha256;
report.continuation.preserved_artifacts=[
  {path:report.clarified_spec.path,sha256:report.clarified_spec.sha256},
  {path:report.task_dag.path,sha256:report.task_dag.sha256},
];
report.execution_ledger.head_sha256=ledger.head_sha256;
report.execution_ledger.record_count=ledger.record_count;
const dispatch=report.routing_attempts[0].dispatch_receipt;
dispatch.sha256=hash('routing/T-001-A01-dispatch.json');
report.children[2].handoff.dispatch_receipt=structuredClone(dispatch);
report.children[2].handoff.route_binding_sha256=digest({attempt_id:'T-001-A01',dispatch_receipt:dispatch});
report.routing_attempts[0].attempt_receipt.sha256=hash('routing/T-001-A01-attempt.json');
fs.writeFileSync(reportPath,JSON.stringify(report));
NODE

make_response() { node - "$1" "$2" "$3" <<'NODE'
const fs=require('node:fs'); const [reportPath,out,mode]=process.argv.slice(2); const x=JSON.parse(fs.readFileSync(reportPath));
let text=`검증 결과와 다음 진행 상태를 보고합니다.\n\n\`\`\`json\n${JSON.stringify(x,null,2)}\n\`\`\``;
if(mode==='wrong-question') text+='\n\n다음 질문: 다른 환경을 선택하시겠습니까?';
if(mode==='extra-complete') text+='\n\n다음 질문: 더 진행할까요?';
fs.writeFileSync(out,text);
NODE
}

make_response "$VALID" "$WORK/complete.txt" complete
make_response "$WORK/partial.json" "$WORK/partial.txt" valid-partial
make_response "$WORK/partial.json" "$WORK/wrong-question.txt" wrong-question
make_response "$VALID" "$WORK/extra-complete.txt" extra-complete

node "$VALIDATOR" "$VALID" < "$WORK/complete.txt" >/dev/null
node "$VALIDATOR" "$WORK/partial.json" < "$WORK/partial.txt" >/dev/null
if node "$VALIDATOR" "$WORK/partial.json" < "$WORK/partial.json" >/dev/null 2>&1; then exit 1; fi
if node "$VALIDATOR" "$WORK/partial.json" < "$WORK/wrong-question.txt" >/dev/null 2>&1; then exit 1; fi
if node "$VALIDATOR" "$VALID" < "$WORK/extra-complete.txt" >/dev/null 2>&1; then exit 1; fi

config_id="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
head_sha="1111111111111111111111111111111111111111"
diff_sha="2222222222222222222222222222222222222222222222222222222222222222"
spec_sha="$(shasum -a 256 "$RUN_DIR/clarified-spec.yaml" | awk '{print $1}')"
dag_sha="$(shasum -a 256 "$RUN_DIR/task-dag.yaml" | awk '{print $1}')"
(cd "$REPO" && node "$RESUME_VALIDATOR" "$WORK/partial.json" "$config_id" "$head_sha" "$diff_sha" "$spec_sha" "$dag_sha" "$ledger_path") >/dev/null
node - "$WORK/partial.json" "$WORK/partial-evidence-drift.json" <<'NODE'
const fs=require('node:fs');const report=JSON.parse(fs.readFileSync(process.argv[2]));
report.task_results[0].acceptance_evidence[0].observed_ref=`command-sha256:${'f'.repeat(64)}`;
fs.writeFileSync(process.argv[3],JSON.stringify(report));
NODE
if (cd "$REPO" && node "$RESUME_VALIDATOR" "$WORK/partial-evidence-drift.json" "$config_id" "$head_sha" "$diff_sha" "$spec_sha" "$dag_sha" "$ledger_path") >/dev/null 2>&1; then exit 1; fi
if (cd "$REPO" && node "$RESUME_VALIDATOR" "$WORK/partial.json" "${config_id%?}b" "$head_sha" "$diff_sha" "$spec_sha" "$dag_sha" "$ledger_path") >/dev/null 2>&1; then exit 1; fi
if (cd "$REPO" && node "$RESUME_VALIDATOR" "$WORK/partial.json" "$config_id" "$head_sha" "${diff_sha%?}3" "$spec_sha" "$dag_sha" "$ledger_path") >/dev/null 2>&1; then exit 1; fi
if (cd "$REPO" && node "$RESUME_VALIDATOR" "$WORK/partial.json" "$config_id" "$head_sha" "$diff_sha" "${spec_sha%?}d" "$dag_sha" "$ledger_path") >/dev/null 2>&1; then exit 1; fi
cp "$RUN_DIR/clarity-projection.json" "$WORK/clarity-projection.backup"
printf '{"drift":true}' > "$RUN_DIR/clarity-projection.json"
if (cd "$REPO" && node "$RESUME_VALIDATOR" "$WORK/partial.json" "$config_id" "$head_sha" "$diff_sha" "$spec_sha" "$dag_sha" "$ledger_path") >/dev/null 2>&1; then exit 1; fi
mv "$WORK/clarity-projection.backup" "$RUN_DIR/clarity-projection.json"
cp "$ledger_path" "$WORK/copied-ledger.jsonl"
if (cd "$REPO" && node "$RESUME_VALIDATOR" "$WORK/partial.json" "$config_id" "$head_sha" "$diff_sha" "$spec_sha" "$dag_sha" "$WORK/copied-ledger.jsonl") >/dev/null 2>&1; then exit 1; fi
mv "$ledger_path" "$WORK/designated-ledger.backup"
if (cd "$REPO" && node "$RESUME_VALIDATOR" "$WORK/partial.json" "$config_id" "$head_sha" "$diff_sha" "$spec_sha" "$dag_sha" "$ledger_path") >/dev/null 2>&1; then exit 1; fi
mv "$WORK/designated-ledger.backup" "$ledger_path"
cp "$RUN_DIR/routing/T-001-A01-attempt.json" "$WORK/attempt-receipt.backup"
printf '{"tampered":true}' > "$RUN_DIR/routing/T-001-A01-attempt.json"
if (cd "$REPO" && node "$RESUME_VALIDATOR" "$WORK/partial.json" "$config_id" "$head_sha" "$diff_sha" "$spec_sha" "$dag_sha" "$ledger_path") >/dev/null 2>&1; then exit 1; fi
mv "$WORK/attempt-receipt.backup" "$RUN_DIR/routing/T-001-A01-attempt.json"
mv "$RUN_DIR/routing/T-001-A01-dispatch.json" "$WORK/dispatch-receipt.backup"
if (cd "$REPO" && node "$RESUME_VALIDATOR" "$WORK/partial.json" "$config_id" "$head_sha" "$diff_sha" "$spec_sha" "$dag_sha" "$ledger_path") >/dev/null 2>&1; then exit 1; fi
mv "$WORK/dispatch-receipt.backup" "$RUN_DIR/routing/T-001-A01-dispatch.json"
printf '%s\n' '{"tampered":true}' > "$ledger_path"
if (cd "$REPO" && node "$RESUME_VALIDATOR" "$WORK/partial.json" "$config_id" "$head_sha" "$diff_sha" "$spec_sha" "$dag_sha" "$ledger_path") >/dev/null 2>&1; then exit 1; fi

printf '{"semantic_ac_key":"terminal_response_envelope","outcome":"pass","exact_json_fence":true,"questionless_partial":true,"json_only_partial_rejected":true,"trailing_question_rejected":true,"resume_state_revalidated":true,"configuration_drift_rejected":true,"workspace_drift_rejected":true,"artifact_drift_rejected":true,"clarity_projection_drift_rejected":true,"clarity_projection_semantic_revalidated":true,"clarity_validation_command_ledger_bound":true,"routing_receipt_replay":true,"routing_receipt_tamper_rejected":true,"missing_route_receipt_rejected":true,"ledger_path_bound_to_report":true,"copied_ledger_rejected":true,"missing_designated_ledger_rejected":true,"ledger_drift_rejected":true}\n'
