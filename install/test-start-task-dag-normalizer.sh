#!/usr/bin/env bash
set -eu
set -f

DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"
NORMALIZER="$ROOT/skills/start-task/scripts/normalize-task-dag.js"
VALIDATOR="$ROOT/skills/start-task/scripts/validate-task-dag.js"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-dag-normalizer.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
REPO="$WORK/repo"
RUN_DIR="$REPO/.vulpora/tasks/run-normalizer-1234"
mkdir -p "$RUN_DIR"

node - "$RUN_DIR/clarified-spec.yaml" "$RUN_DIR/task-dag.candidate-00.json" <<'NODE'
const fs=require('node:fs');const [specPath,dagPath]=process.argv.slice(2);
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const gate={status:'passed',score:100,threshold:85,skip:{requested:false,basis:null,reason:null,decision_ref:null,decision_context:null,accepted_risk_unknown_ids:[],non_bypassable_blocker_ids:[]}};
const spec={schema:'vulpora.clarified-task-spec/v2',spec_id:'spec-1',status:'ready',acceptance_criteria:[{id:'AC-001',description:'bounded'}],verification:[{command_or_method:'node --test'}],clarity_projection:{clarity_gate:gate},authority:{allowed_reads:['workspace'],allowed_writes:['src/numbers.js'],allowed_external_effects:['Run node --test locally'],forbidden:['network','recursive delegation']}};
const task={id:'T-001',title:'Implement positive-number behavior',objective:'Return positive classification with passing regression tests',depends_on:[],owner_role:'executor',write_scope:['src/numbers.js'],read_scope:['src/numbers.js'],acceptance_criterion_ids:['AC-001'],acceptance_tests:[{method:'node --test',expected:'exit 0'}],risk:{level:'low',reason:'bounded',recovery:'revert'},authority:{tools:['repository_read'],external_effects:['Run `node --test` locally'],forbidden:['recursive delegation']},execution:{kind:'leader-inline',delegation_depth:0,forbidden_actions:['recursive delegation'],fallback:'none',result_schema:'vulpora.task-result/v2'},budget:{tool_calls:10},outputs:['src/numbers.js']};
const dagGate=JSON.parse(JSON.stringify(gate));delete dagGate.skip.decision_context;
const dag={schema:'vulpora.task-dag/v2',spec_id:'spec-1',plan_id:'plan-1',status:'ready',parallelism_policy:{mode:'dynamic',effective_parallelism:'min(runtime_available_slots, dependency_ready_tasks, disjoint_write_logical_scopes, higher_policy_limit)',higher_policy_limit:null,fixed_cap:null},clarity_gate:dagGate,tasks:[task],waves:[{id:'W-01',task_ids:['T-001']}],integration_points:[],coverage:[{acceptance_criterion_id:'AC-001',task_ids:['T-001','T-ghost']}],risks:[],provenance:{generated_by:'task-splitter',spec_schema:'vulpora.clarified-task-spec/v2'}};
fs.writeFileSync(specPath,canonical(spec));fs.writeFileSync(dagPath,canonical(dag));
NODE

if (cd "$REPO" && node "$VALIDATOR" .vulpora/tasks/run-normalizer-1234/task-dag.candidate-00.json .vulpora/tasks/run-normalizer-1234/clarified-spec.yaml) >/dev/null 2>&1; then
  echo 'malformed source candidate passed' >&2; exit 1
fi
(cd "$REPO" && node "$NORMALIZER" \
  .vulpora/tasks/run-normalizer-1234/task-dag.candidate-00.json \
  .vulpora/tasks/run-normalizer-1234/clarified-spec.yaml \
  .vulpora/tasks/run-normalizer-1234/task-dag.candidate-01.json) >"$WORK/result.json"
(cd "$REPO" && node "$VALIDATOR" \
  .vulpora/tasks/run-normalizer-1234/task-dag.candidate-01.json \
  .vulpora/tasks/run-normalizer-1234/clarified-spec.yaml) >/dev/null
node - "$WORK/result.json" "$RUN_DIR/task-dag.candidate-01.json" <<'NODE'
const fs=require('node:fs');const [resultPath,dagPath]=process.argv.slice(2);
const result=JSON.parse(fs.readFileSync(resultPath)),dag=JSON.parse(fs.readFileSync(dagPath));
if(result.outcome!=='pass'||result.validated!==true||dag.coverage[0].task_ids.join(',')!=='T-001'
  ||dag.tasks[0].authority.forbidden.join(',')!=='network,recursive delegation'
  ||dag.tasks[0].authority.external_effects.join(',')!=='Run node --test locally'
  ||dag.clarity_gate.skip.decision_context!==null)process.exit(1);
NODE

node - "$RUN_DIR/task-dag.candidate-01.json" "$RUN_DIR/task-dag.generic-owner.json" <<'NODE'
const fs=require('node:fs');const [sourcePath,outPath]=process.argv.slice(2),dag=JSON.parse(fs.readFileSync(sourcePath));
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
dag.tasks[0].owner_role='worker';fs.writeFileSync(outPath,canonical(dag));
NODE
if (cd "$REPO" && node "$VALIDATOR" \
  .vulpora/tasks/run-normalizer-1234/task-dag.generic-owner.json \
  .vulpora/tasks/run-normalizer-1234/clarified-spec.yaml) >/dev/null 2>&1; then
  echo 'generic worker owner passed' >&2; exit 1
fi

node - "$RUN_DIR/task-dag.candidate-01.json" "$RUN_DIR/task-dag.vague-outcome.json" <<'NODE'
const fs=require('node:fs');const [sourcePath,outPath]=process.argv.slice(2),dag=JSON.parse(fs.readFileSync(sourcePath));
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
dag.tasks[0].title='백엔드 구현';dag.tasks[0].objective='테스트 추가';fs.writeFileSync(outPath,canonical(dag));
NODE
if (cd "$REPO" && node "$VALIDATOR" \
  .vulpora/tasks/run-normalizer-1234/task-dag.vague-outcome.json \
  .vulpora/tasks/run-normalizer-1234/clarified-spec.yaml) >/dev/null 2>&1; then
  echo 'vague task outcome passed' >&2; exit 1
fi

node - "$RUN_DIR/task-dag.candidate-01.json" "$RUN_DIR/task-dag.hybrid-00.json" <<'NODE'
const fs=require('node:fs');const [sourcePath,outPath]=process.argv.slice(2),dag=JSON.parse(fs.readFileSync(sourcePath));
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
dag.coverage=Object.fromEntries(dag.coverage.map(entry=>[entry.acceptance_criterion_id,{task_ids:entry.task_ids}]));
delete dag.parallelism_policy.effective_parallelism;dag.parallelism_policy.runtime_available_slots=null;
delete dag.provenance.generated_by;delete dag.provenance.spec_schema;
for(const task of dag.tasks){delete task.acceptance_criterion_ids;task.acceptance_tests={'AC-001':{description:'The observed verification passes.'}};task.execution.kind='leader-inline';delete task.execution.fallback;task.execution.result_schema='vulpora.task-result/v1';}
fs.writeFileSync(outPath,canonical(dag));
NODE
(cd "$REPO" && node "$NORMALIZER" \
  .vulpora/tasks/run-normalizer-1234/task-dag.hybrid-00.json \
  .vulpora/tasks/run-normalizer-1234/clarified-spec.yaml \
  .vulpora/tasks/run-normalizer-1234/task-dag.candidate-03.json) >"$WORK/hybrid-result.json"
(cd "$REPO" && node "$VALIDATOR" \
  .vulpora/tasks/run-normalizer-1234/task-dag.candidate-03.json \
  .vulpora/tasks/run-normalizer-1234/clarified-spec.yaml) >/dev/null
node - "$RUN_DIR/task-dag.candidate-03.json" <<'NODE'
const fs=require('node:fs'),dag=JSON.parse(fs.readFileSync(process.argv[2]));
if(dag.tasks[0].acceptance_criterion_ids.join(',')!=='AC-001'
  ||dag.tasks[0].acceptance_tests[0].method!=='node --test'
  ||dag.tasks[0].execution.result_schema!=='vulpora.task-result/v2')process.exit(1);
NODE

node - "$RUN_DIR/task-dag.candidate-01.json" "$RUN_DIR/task-dag.legacy-00.json" <<'NODE'
const fs=require('node:fs');const [sourcePath,outPath]=process.argv.slice(2),dag=JSON.parse(fs.readFileSync(sourcePath));
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const tasks=dag.tasks.map(task=>({...task,
  acceptance_tests:task.acceptance_tests.map(test=>test.expected),
  risk:{level:task.risk.level,summary:task.risk.reason},
  authority:{allowed_reads:task.read_scope,allowed_writes:task.write_scope,forbidden:task.authority.forbidden},
  execution:{kind:'leader-inline'},budget:{timeout_seconds:60}}));
const legacyGate=JSON.parse(JSON.stringify(dag.clarity_gate));delete legacyGate.skip.decision_context;
const legacy={schema:dag.schema,status:dag.status,spec:{spec_id:dag.spec_id},clarity_gate:legacyGate,parallelism_policy:{...dag.parallelism_policy,runtime_available_slots:'runtime'},task_graph:{tasks,waves:dag.waves},coverage:{acceptance_criteria:dag.coverage.map(entry=>({id:entry.acceptance_criterion_id,task_ids:entry.task_ids}))},verification:{command:'./run-offline.sh node --test'},risks:dag.risks};
fs.writeFileSync(outPath,canonical(legacy));
NODE
(cd "$REPO" && node "$NORMALIZER" \
  .vulpora/tasks/run-normalizer-1234/task-dag.legacy-00.json \
  .vulpora/tasks/run-normalizer-1234/clarified-spec.yaml \
  .vulpora/tasks/run-normalizer-1234/task-dag.candidate-02.json) >"$WORK/legacy-result.json"
(cd "$REPO" && node "$VALIDATOR" \
  .vulpora/tasks/run-normalizer-1234/task-dag.candidate-02.json \
  .vulpora/tasks/run-normalizer-1234/clarified-spec.yaml) >/dev/null
node - "$WORK/legacy-result.json" "$RUN_DIR/task-dag.candidate-02.json" <<'NODE'
const fs=require('node:fs');const [resultPath,dagPath]=process.argv.slice(2);
const result=JSON.parse(fs.readFileSync(resultPath)),dag=JSON.parse(fs.readFileSync(dagPath));
if(!result.normalized.includes('legacy_leader_inline_envelope')||dag.spec_id!=='spec-1'
  ||dag.tasks[0].execution.kind!=='leader-inline'||dag.tasks[0].acceptance_tests[0].method!=='./run-offline.sh node --test')process.exit(1);
NODE

if (cd "$REPO" && node "$NORMALIZER" \
  .vulpora/tasks/run-normalizer-1234/task-dag.candidate-00.json \
  .vulpora/tasks/run-normalizer-1234/clarified-spec.yaml \
  .vulpora/tasks/run-normalizer-1234/task-dag.candidate-01.json) >/dev/null 2>&1; then
  echo 'existing normalized candidate overwritten' >&2; exit 1
fi

printf '{"semantic_ac_key":"start_task_dag_normalizer","outcome":"pass","coverage_bidirectional":true,"forbidden_authority_preserved":true,"generic_worker_owner_rejected":true,"vague_outcome_rejected":true,"exclusive_create":true}\n'
