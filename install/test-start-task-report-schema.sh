#!/usr/bin/env bash
set -u
DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"
SCHEMA="$ROOT/skills/start-task/reference/kb/orchestration-report.schema.json"
VALID="$ROOT/skills/start-task/reference/kb/orchestration-report.valid.json"
VALIDATOR="$ROOT/evals/behavioral/adapters/validate-start-task-report.js"
DAG_VALIDATOR="$ROOT/skills/start-task/scripts/validate-task-dag.js"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-report-test.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
pass=0; fail=0
record() { if "$@" >/dev/null 2>&1; then pass=$((pass+1)); else echo "FAIL: $*" >&2; fail=$((fail+1)); fi; }
reject() { if "$@" >/dev/null 2>&1; then echo "UNEXPECTED PASS: $*" >&2; fail=$((fail+1)); else pass=$((pass+1)); fi; }

node - "$VALID" "$WORK/valid-complete.json" "$WORK/complete-task-dag.yaml" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto'); const [src,out,dagPath]=process.argv.slice(2); const x=JSON.parse(fs.readFileSync(src));
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const task=(id,depends,write,acs)=>({id,title:'Implement positive-number behavior',objective:'Return positive classification with passing regression tests',depends_on:depends,owner_role:'executor',write_scope:write,read_scope:write,acceptance_criterion_ids:acs,acceptance_tests:[{method:'node --test',expected:'exit 0'}],risk:{level:'low',reason:'bounded',recovery:'revert'},authority:{tools:['repository_read'],external_effects:[],forbidden:['recursive delegation']},execution:{kind:'native-subagent',delegation_depth:0,forbidden_actions:['recursive delegation'],fallback:'none',result_schema:'vulpora.task-result/v2'},budget:{tool_calls:10},outputs:write});
const dag=canonical({schema:'vulpora.task-dag/v2',spec_id:'spec-1',plan_id:'plan-1',status:'ready',parallelism_policy:{mode:'dynamic',effective_parallelism:'min(runtime_available_slots, dependency_ready_tasks, disjoint_write_logical_scopes, higher_policy_limit)',higher_policy_limit:null,fixed_cap:null},clarity_gate:{status:'passed',score:100,threshold:85,skip:{requested:false,basis:null,reason:null,accepted_risk_unknown_ids:[],non_bypassable_blocker_ids:[]}},tasks:[task('T-001',[],['src/numbers.js','test/numbers.test.js'],['AC-001'])],waves:[{id:'W-01',task_ids:['T-001']}],integration_points:[],coverage:[{acceptance_criterion_id:'AC-001',task_ids:['T-001']}],risks:[],provenance:{generated_by:'task-splitter',spec_schema:'vulpora.clarified-task-spec/v2'}});
fs.writeFileSync(dagPath,dag); x.task_dag.sha256=crypto.createHash('sha256').update(dag).digest('hex'); fs.writeFileSync(out,JSON.stringify(x));
NODE
node - "$WORK/complete-spec.json" "$WORK/unauthorized-task-dag.yaml" "$WORK/complete-task-dag.yaml" <<'NODE'
const fs=require('node:fs');const [specPath,badDagPath,dagPath]=process.argv.slice(2);
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const gate={status:'passed',score:100,threshold:85,skip:{requested:false,basis:null,reason:null,accepted_risk_unknown_ids:[],non_bypassable_blocker_ids:[]}};
const spec={schema:'vulpora.clarified-task-spec/v2',spec_id:'spec-1',status:'ready',acceptance_criteria:[{id:'AC-001',description:'bounded'}],clarity_projection:{clarity_gate:gate},authority:{allowed_reads:['workspace'],allowed_writes:['src/numbers.js','test/numbers.test.js'],allowed_external_effects:[],forbidden:[]}};
fs.writeFileSync(specPath,canonical(spec));
const bad=JSON.parse(fs.readFileSync(dagPath,'utf8'));bad.tasks[0].write_scope.push('private/secret.txt');bad.tasks[0].outputs.push('private/secret.txt');
fs.writeFileSync(badDagPath,canonical(bad));
NODE
record node "$DAG_VALIDATOR" "$WORK/complete-task-dag.yaml" "$WORK/complete-spec.json"
reject node "$DAG_VALIDATOR" "$WORK/unauthorized-task-dag.yaml" "$WORK/complete-spec.json"
record node "$VALIDATOR" "$SCHEMA" "$WORK/valid-complete.json" run-12345678 instance-12345678 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$WORK/complete-task-dag.yaml"
node - "$WORK/valid-complete.json" "$WORK/fallback-complete.json" <<'NODE'
const fs=require('node:fs');const [src,out]=process.argv.slice(2);const report=JSON.parse(fs.readFileSync(src));
report.children=report.children.filter((child)=>child.agent_id!=='requirement-dialogue');
fs.writeFileSync(out,JSON.stringify(report));
NODE
record node "$VALIDATOR" "$SCHEMA" "$WORK/fallback-complete.json" run-12345678 instance-12345678 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$WORK/complete-task-dag.yaml"
node - "$WORK/valid-complete.json" "$WORK/complete-task-dag.yaml" "$WORK/inline-complete.json" "$WORK/inline-task-dag.yaml" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');const [reportPath,dagPath,outReport,outDag]=process.argv.slice(2);
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const report=JSON.parse(fs.readFileSync(reportPath));const dag=JSON.parse(fs.readFileSync(dagPath));
dag.tasks[0].execution.kind='leader-inline';const dagText=canonical(dag);fs.writeFileSync(outDag,dagText);
report.children=report.children.slice(0,2);report.routing_attempts=[];
report.task_dag.sha256=crypto.createHash('sha256').update(dagText).digest('hex');fs.writeFileSync(outReport,JSON.stringify(report));
NODE
record node "$VALIDATOR" "$SCHEMA" "$WORK/inline-complete.json" run-12345678 instance-12345678 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$WORK/inline-task-dag.yaml"
reject node "$VALIDATOR" "$SCHEMA" "$WORK/valid-complete.json" run-12345678 instance-12345678 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
reject node "$VALIDATOR" "$SCHEMA" "$WORK/valid-complete.json" stale-run-123 stale-instance-123 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$WORK/complete-task-dag.yaml"

node - "$VALID" "$WORK/valid-partial.json" "$WORK/task-dag.yaml" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto'); const [src,out,dagPath]=process.argv.slice(2); const x=JSON.parse(fs.readFileSync(src));
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const task=(id,depends,write,acs)=>({id,title:'Implement positive-number behavior',objective:'Return positive classification with passing regression tests',depends_on:depends,owner_role:'executor',write_scope:write,read_scope:write,acceptance_criterion_ids:acs,acceptance_tests:[{method:'node --test',expected:'exit 0'}],risk:{level:'low',reason:'bounded',recovery:'revert'},authority:{tools:['repository_read'],external_effects:[],forbidden:['recursive delegation']},execution:{kind:'native-subagent',delegation_depth:0,forbidden_actions:['recursive delegation'],fallback:'none',result_schema:'vulpora.task-result/v2'},budget:{tool_calls:10},outputs:write});
const dag=canonical({schema:'vulpora.task-dag/v2',spec_id:'spec-1',plan_id:'plan-partial',status:'ready',parallelism_policy:{mode:'dynamic',effective_parallelism:'min(runtime_available_slots, dependency_ready_tasks, disjoint_write_logical_scopes, higher_policy_limit)',higher_policy_limit:null,fixed_cap:null},clarity_gate:{status:'passed',score:100,threshold:85,skip:{requested:false,basis:null,reason:null,accepted_risk_unknown_ids:[],non_bypassable_blocker_ids:[]}},tasks:[task('T-001',[],['src/numbers.js','test/numbers.test.js'],['AC-HTTP','AC-ALIAS'])],waves:[{id:'W-01',task_ids:['T-001']}],integration_points:[],coverage:[{acceptance_criterion_id:'AC-HTTP',task_ids:['T-001']},{acceptance_criterion_id:'AC-ALIAS',task_ids:['T-001']}],risks:[],provenance:{generated_by:'task-splitter',spec_schema:'vulpora.clarified-task-spec/v2'}});
fs.writeFileSync(dagPath,dag); x.task_dag.sha256=crypto.createHash('sha256').update(dag).digest('hex');
x.children[2].handoff.spec_slice.acceptance_criterion_ids=['AC-HTTP','AC-ALIAS'];
x.task_results[0].acceptance_evidence=[];
x.korean_summary='구현은 검증됐지만 실제 HTTP와 OpenSearch alias 확인을 이어가야 합니다.';
x.phases[5].outcome='failed';
x.verification.push({argv:['local HTTP endpoint check'],stdin_sha256:null,exit_code:null,timeout_seconds:30,outcome:'not_run',network_attempts:0,network_successes:0});
x.gaps=['AC-HTTP, AC-ALIAS: 실행 환경이 없어 실제 HTTP 호출과 alias 확인을 하지 못했다.'];
x.continuation={
  status:'ready_to_resume',resumable:true,same_session_only:false,
  resume_from:'verify',completed_task_ids:['T-001'],
  pending_task_ids:[],remaining_acceptance_criterion_ids:['AC-HTTP','AC-ALIAS'],
  blocker:'로컬 실행 환경과 OpenSearch 연결 정보가 없다.',
  next_action:'환경 정보를 받은 뒤 HTTP 호출과 alias 확인만 실행한다.',
  question:null,
  resume_conditions:['frozen spec/DAG hash 일치','runtime configuration identity 일치','실행 환경 접근 가능'],
  workspace_snapshot:x.continuation.workspace_snapshot,
  preserved_artifacts:[
    {path:x.clarified_spec.path,sha256:x.clarified_spec.sha256},
    {path:x.task_dag.path,sha256:x.task_dag.sha256}
  ]
};
x.terminal_status='partial'; fs.writeFileSync(out,JSON.stringify(x));
NODE
record node "$VALIDATOR" "$SCHEMA" "$WORK/valid-partial.json" run-12345678 instance-12345678 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$WORK/task-dag.yaml"
reject node "$VALIDATOR" "$SCHEMA" "$WORK/valid-partial.json" run-12345678 instance-12345678 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

mutate() { node - "$VALID" "$WORK/$1.json" "$2" <<'NODE'
const fs=require('node:fs'); const [src,out,mutation]=process.argv.slice(2); const x=JSON.parse(fs.readFileSync(src));
if (mutation==='version') x.schema_version='vulpora.orchestration-report/v2';
if (mutation==='type') x.verification[0].exit_code='0';
if (mutation==='phase') [x.phases[0],x.phases[1]]=[x.phases[1],x.phases[0]];
if (mutation==='orchestrator') x.children[1].agent_id='task-orchestrator';
if (mutation==='status') x.terminal_status='conditionally_complete';
if (mutation==='missing_hash') delete x.clarified_spec.sha256;
if (mutation==='absolute_path') x.task_dag.path='/tmp/task-dag.yaml';
if (mutation==='pass_null_exit') x.verification[0].exit_code=null;
if (mutation==='missing_ledger') delete x.execution_ledger;
if (mutation==='fake_anchor') { x.execution_ledger.integrity_level='externally_anchored'; x.execution_ledger.external_anchor=null; }
if (mutation==='wrong_ledger_run') x.execution_ledger.path='.vulpora/tasks/stale-run-999/execution-ledger.jsonl';
if (mutation==='missing_projection') delete x.clarity_gate_evidence;
if (mutation==='wrong_projection_run') x.clarity_gate_evidence.projection_path='.vulpora/tasks/stale-run-999/clarity-projection.json';
if (mutation==='projection_stdin') x.verification[0].stdin_sha256='f'.repeat(64);
if (mutation==='missing_requested_model') delete x.children[0].handoff.requested_model;
if (mutation==='model_inheritance') x.children[2].inheritance_used=true;
if (mutation==='runtime_model_mismatch') x.children[2].runtime_reported_model='different-model';
if (mutation==='missing_route_receipt') delete x.routing_attempts[0].attempt_receipt;
if (mutation==='bad_action_failure_pair') { x.routing_attempts[0].failure_class='authentication'; x.routing_attempts[0].action='retry_same_route'; x.routing_attempts[0].mutation_state='effect_none'; }
if (mutation==='route_lineage_mismatch') x.routing_attempts[0].attempt_id='T-001-A99';
if (mutation==='legacy_execution_v1_handoff') x.children[2].handoff=structuredClone(x.children[1].handoff);
if (mutation==='legacy_execution_v1_result') x.task_results[0]={task_id:'T-001',status:'verified',owner:'execution-1',changed_files:[],evidence:[]};
if (mutation==='verified_failed_route') { x.routing_attempts[0].failure_class='deterministic_implementation_failure'; x.routing_attempts[0].action='repair'; }
if (mutation==='orphan_verified_result') { const result=structuredClone(x.task_results[0]); result.attempt_id='T-001-A99'; x.task_results.push(result); }
fs.writeFileSync(out,JSON.stringify(x));
NODE
}
for mutation in version type phase orchestrator status missing_hash absolute_path pass_null_exit missing_ledger fake_anchor wrong_ledger_run missing_projection wrong_projection_run projection_stdin missing_requested_model model_inheritance runtime_model_mismatch missing_route_receipt bad_action_failure_pair route_lineage_mismatch legacy_execution_v1_handoff legacy_execution_v1_result verified_failed_route orphan_verified_result; do
  mutate "$mutation" "$mutation"
  reject node "$VALIDATOR" "$SCHEMA" "$WORK/$mutation.json" run-12345678 instance-12345678
done

mutate_partial() { node - "$WORK/valid-partial.json" "$WORK/$1.json" "$2" <<'NODE'
const fs=require('node:fs'); const [src,out,mutation]=process.argv.slice(2); const x=JSON.parse(fs.readFileSync(src));
if (mutation==='question') x.continuation.question='남은 외부 검증에 사용할 실행 환경을 어떻게 제공할 수 있나요?';
if (mutation==='pending') { x.continuation.pending_task_ids=[]; x.continuation.remaining_acceptance_criterion_ids=[]; }
if (mutation==='artifact') x.continuation.preserved_artifacts[0].sha256='d'.repeat(64);
if (mutation==='notrun_exit') x.verification.at(-1).exit_code=0;
if (mutation==='dead_end') { x.continuation.status='none'; x.continuation.resumable=false; }
if (mutation==='workspace') x.continuation.workspace_snapshot.diff_sha256='e'.repeat(63);
if (mutation==='workspace_semantic') x.continuation.workspace_snapshot.captured_at_phase='integrate';
if (mutation==='frontier') x.continuation.resume_from='execute';
if (mutation==='completed') x.continuation.completed_task_ids=[];
if (mutation==='omit_one_ac') x.continuation.remaining_acceptance_criterion_ids=['AC-HTTP'];
fs.writeFileSync(out,JSON.stringify(x));
NODE
}
for mutation in question pending artifact notrun_exit dead_end workspace workspace_semantic frontier completed omit_one_ac; do
  mutate_partial "partial-$mutation" "$mutation"
  reject node "$VALIDATOR" "$SCHEMA" "$WORK/partial-$mutation.json" run-12345678 instance-12345678 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$WORK/task-dag.yaml"
done

node - "$WORK/valid-complete.json" "$WORK/complete-task-dag.yaml" "$WORK" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');const [reportPath,dagPath,dir]=process.argv.slice(2);
const baseReport=JSON.parse(fs.readFileSync(reportPath));const baseDag=JSON.parse(fs.readFileSync(dagPath));
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const cases={failed_status:d=>{d.status='failed';},cycle:d=>{d.tasks[0].depends_on=['T-001'];},coverage_gap:d=>{d.coverage=[];}};
for(const [name,mutate] of Object.entries(cases)){
  const dag=structuredClone(baseDag);mutate(dag);const bytes=canonical(dag);const dagOut=`${dir}/dag-${name}.yaml`;const reportOut=`${dir}/report-${name}.json`;
  fs.writeFileSync(dagOut,bytes);const report=structuredClone(baseReport);report.task_dag.sha256=crypto.createHash('sha256').update(bytes).digest('hex');fs.writeFileSync(reportOut,JSON.stringify(report));
}
const pretty=JSON.stringify(baseDag,null,2);fs.writeFileSync(`${dir}/dag-noncanonical.yaml`,pretty);const report=structuredClone(baseReport);report.task_dag.sha256=crypto.createHash('sha256').update(pretty).digest('hex');fs.writeFileSync(`${dir}/report-noncanonical.json`,JSON.stringify(report));
NODE
for mutation in failed_status cycle coverage_gap noncanonical; do
  reject node "$VALIDATOR" "$SCHEMA" "$WORK/report-$mutation.json" run-12345678 instance-12345678 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$WORK/dag-$mutation.yaml"
done

node - "$WORK/valid-complete.json" "$WORK/valid-retry.json" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');const [src,out]=process.argv.slice(2);const x=JSON.parse(fs.readFileSync(src));
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const child=structuredClone(x.children[2]);child.native_child_id='child-execution-retry-0';child.handoff.attempt_id='T-001-A00';child.handoff.dispatch_receipt={path:'.vulpora/tasks/run-12345678/routing/T-001-A00-dispatch.json',sha256:'1'.repeat(64),immutable:true};child.handoff.route_binding_sha256=crypto.createHash('sha256').update(canonical({attempt_id:'T-001-A00',dispatch_receipt:child.handoff.dispatch_receipt})).digest('hex');x.children.push(child);
const result=structuredClone(x.task_results[0]);result.attempt_id='T-001-A00';result.status='failed';result.acceptance_evidence=[];result.failure_class_candidate='deterministic_implementation_failure';x.task_results.push(result);
const route=structuredClone(x.routing_attempts[0]);route.attempt_id='T-001-A00';route.dispatch_receipt=structuredClone(child.handoff.dispatch_receipt);route.attempt_receipt={path:'.vulpora/tasks/run-12345678/routing/T-001-A00-attempt.json',sha256:'2'.repeat(64),immutable:true};route.failure_class='deterministic_implementation_failure';route.action='repair';x.routing_attempts.push(route);
fs.writeFileSync(out,JSON.stringify(x));
NODE
record node "$VALIDATOR" "$SCHEMA" "$WORK/valid-retry.json" run-12345678 instance-12345678 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$WORK/complete-task-dag.yaml"

mutate_complete() { node - "$WORK/valid-complete.json" "$WORK/$1.json" "$2" <<'NODE'
const fs=require('node:fs'); const [src,out,mutation]=process.argv.slice(2); const x=JSON.parse(fs.readFileSync(src));
if (mutation==='missing_ac_evidence') x.task_results[0].acceptance_evidence=[];
if (mutation==='handoff_spec_drift') x.children[2].handoff.spec_slice.spec_id='spec-drifted';
if (mutation==='handoff_ac_drift') x.children[2].handoff.spec_slice.acceptance_criterion_ids=['AC-NEW'];
if (mutation==='handoff_scope_drift') x.children[2].handoff.write_scope.push('src/unconfirmed.js');
fs.writeFileSync(out,JSON.stringify(x));
NODE
}
for mutation in missing_ac_evidence handoff_spec_drift handoff_ac_drift handoff_scope_drift; do
  mutate_complete "complete-$mutation" "$mutation"
  reject node "$VALIDATOR" "$SCHEMA" "$WORK/complete-$mutation.json" run-12345678 instance-12345678 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$WORK/complete-task-dag.yaml"
done

node - "$WORK/valid-partial.json" "$WORK/omitted-task.json" "$WORK/two-task-dag.yaml" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto'); const [src,out,dagPath]=process.argv.slice(2); const x=JSON.parse(fs.readFileSync(src));
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const task=(id,write,acs)=>({id,title:'Inspect acceptance artifact',objective:'Confirm the acceptance artifact matches the frozen contract',depends_on:[],owner_role:'executor',write_scope:write,read_scope:write,acceptance_criterion_ids:acs,acceptance_tests:[{method:'inspect',expected:'pass'}],risk:{level:'low',reason:'bounded',recovery:'revert'},authority:{tools:['repository_read'],external_effects:[],forbidden:['recursive delegation']},execution:{kind:'native-subagent',delegation_depth:0,forbidden_actions:['recursive delegation'],fallback:'none',result_schema:'vulpora.task-result/v2'},budget:{tool_calls:10},outputs:write});
const dag=canonical({schema:'vulpora.task-dag/v2',spec_id:'spec-1',plan_id:'plan-two',status:'ready',parallelism_policy:{mode:'dynamic',effective_parallelism:'min(runtime_available_slots, dependency_ready_tasks, disjoint_write_logical_scopes, higher_policy_limit)',higher_policy_limit:null,fixed_cap:null},clarity_gate:{status:'passed',score:100,threshold:85,skip:{requested:false,basis:null,reason:null,accepted_risk_unknown_ids:[],non_bypassable_blocker_ids:[]}},tasks:[task('T-001',['src/numbers.js'],['AC-HTTP']),task('verify-alias',['test/numbers.test.js'],['AC-ALIAS'])],waves:[{id:'W-01',task_ids:['T-001','verify-alias']}],integration_points:[],coverage:[{acceptance_criterion_id:'AC-HTTP',task_ids:['T-001']},{acceptance_criterion_id:'AC-ALIAS',task_ids:['verify-alias']}],risks:[],provenance:{generated_by:'task-splitter',spec_schema:'vulpora.clarified-task-spec/v2'}});
fs.writeFileSync(dagPath,dag); x.task_dag.sha256=crypto.createHash('sha256').update(dag).digest('hex');
x.continuation.preserved_artifacts.find(a=>a.path===x.task_dag.path).sha256=x.task_dag.sha256; fs.writeFileSync(out,JSON.stringify(x));
NODE
reject node "$VALIDATOR" "$SCHEMA" "$WORK/omitted-task.json" run-12345678 instance-12345678 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$WORK/two-task-dag.yaml"

node - "$WORK/valid-complete.json" "$WORK/four-execution-children.json" "$WORK/four-task-dag.yaml" 3 <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto'); const [src,out,dagPath,countText]=process.argv.slice(2); const x=JSON.parse(fs.readFileSync(src));
const canonical=(value)=>{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;};
for(let i=2;i<=Number(countText)+1;i+=1){
  const child=structuredClone(x.children[2]); const task=`T-${String(i).padStart(3,'0')}`; const attempt=`${task}-A01`;
  child.agent_id=`execution-${i}`; child.native_child_id=`child-execution-${i}`; child.task_argument=`execution task ${i}`;
  child.handoff.task_id=task; child.handoff.attempt_id=attempt; child.handoff.objective=`execute task ${i}`;
  child.handoff.dispatch_receipt.path=`.vulpora/tasks/${x.run_id}/routing/${attempt}-dispatch.json`;
  child.handoff.dispatch_receipt.sha256=i.toString(16).repeat(64); child.handoff.route_binding_sha256=crypto.createHash('sha256').update(canonical({attempt_id:attempt,dispatch_receipt:child.handoff.dispatch_receipt})).digest('hex');
  child.runtime_reported_model=`runtime-route-${i}`; x.children.push(child);
  const result=structuredClone(x.task_results[0]); result.task_id=task; result.attempt_id=attempt; result.owner=child.agent_id; x.task_results.push(result);
  const route=structuredClone(x.routing_attempts[0]); route.task_id=task; route.attempt_id=attempt; route.dispatch_receipt=structuredClone(child.handoff.dispatch_receipt);
  route.attempt_receipt.path=`.vulpora/tasks/${x.run_id}/routing/${attempt}-attempt.json`; route.attempt_receipt.sha256=(i+5).toString(16).repeat(64);
  route.runtime_reported_model=child.runtime_reported_model; x.routing_attempts.push(route);
}
const taskIds=x.task_results.map(result=>result.task_id);
const tasks=taskIds.map((id,index)=>({id,title:`Implement positive behavior ${id}`,objective:'Return positive classification with passing regression tests',depends_on:index===0?[]:[taskIds[index-1]],owner_role:'executor',write_scope:['src/numbers.js','test/numbers.test.js'],read_scope:['src/numbers.js','test/numbers.test.js'],acceptance_criterion_ids:['AC-001'],acceptance_tests:[{method:'node --test',expected:'exit 0'}],risk:{level:'low',reason:'bounded',recovery:'revert'},authority:{tools:['repository_read'],external_effects:[],forbidden:['recursive delegation']},execution:{kind:'native-subagent',delegation_depth:0,forbidden_actions:['recursive delegation'],fallback:'none',result_schema:'vulpora.task-result/v2'},budget:{tool_calls:10},outputs:['src/numbers.js','test/numbers.test.js']}));
const dag=canonical({schema:'vulpora.task-dag/v2',spec_id:'spec-1',plan_id:'plan-many',status:'ready',parallelism_policy:{mode:'dynamic',effective_parallelism:'min(runtime_available_slots, dependency_ready_tasks, disjoint_write_logical_scopes, higher_policy_limit)',higher_policy_limit:null,fixed_cap:null},clarity_gate:{status:'passed',score:100,threshold:85,skip:{requested:false,basis:null,reason:null,accepted_risk_unknown_ids:[],non_bypassable_blocker_ids:[]}},tasks,waves:taskIds.map((id,index)=>({id:`W-${String(index+1).padStart(2,'0')}`,task_ids:[id]})),integration_points:[],coverage:[{acceptance_criterion_id:'AC-001',task_ids:taskIds}],risks:[],provenance:{generated_by:'task-splitter',spec_schema:'vulpora.clarified-task-spec/v2'}});
fs.writeFileSync(dagPath,dag);x.task_dag.sha256=crypto.createHash('sha256').update(dag).digest('hex');
fs.writeFileSync(out,JSON.stringify(x));
NODE
record node "$VALIDATOR" "$SCHEMA" "$WORK/four-execution-children.json" run-12345678 instance-12345678 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$WORK/four-task-dag.yaml"
node - "$WORK/four-execution-children.json" "$WORK/missing-pair-evidence.json" <<'NODE'
const fs=require('node:fs');const [src,out]=process.argv.slice(2);const x=JSON.parse(fs.readFileSync(src));x.task_results.find(r=>r.task_id==='T-002').acceptance_evidence=[];fs.writeFileSync(out,JSON.stringify(x));
NODE
reject node "$VALIDATOR" "$SCHEMA" "$WORK/missing-pair-evidence.json" run-12345678 instance-12345678 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$WORK/four-task-dag.yaml"
printf '{bad json' > "$WORK/malformed.json"
reject node "$VALIDATOR" "$SCHEMA" "$WORK/malformed.json" run-12345678 instance-12345678
node - "$SCHEMA" "$WORK/wrong-id.schema.json" <<'NODE'
const fs=require('node:fs'); const x=JSON.parse(fs.readFileSync(process.argv[2])); x.$id='https://wrong.invalid/schema.json'; fs.writeFileSync(process.argv[3],JSON.stringify(x));
NODE
reject node "$VALIDATOR" "$WORK/wrong-id.schema.json" "$VALID" run-12345678 instance-12345678

printf 'report schema tests: PASS=%s FAIL=%s\n' "$pass" "$fail"
printf '{"semantic_ac_key":"orchestration_report_schema","outcome":"pass","schema_id":"https://vulpora.local/schemas/orchestration-report-v3.schema.json","schema_version":"vulpora.orchestration-report/v3","positive":true,"questionless_partial":true,"complete_ac_evidence_bound":true,"frozen_handoff_bound":true,"dag_inventory_anchored":true}\n'
[ "$fail" -eq 0 ]
