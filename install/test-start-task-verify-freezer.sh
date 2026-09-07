#!/usr/bin/env bash
set -eu
set -f

DIR="$(cd "$(dirname "$0")" && pwd -P)"; ROOT="$(cd "$DIR/.." && pwd -P)"
VERIFY="$ROOT/skills/start-task/scripts/verify-and-freeze-run.js"
APPEND="$ROOT/skills/start-task/scripts/append-execution-ledger.js"
VALIDATE="$ROOT/skills/start-task/scripts/validate-execution-ledger.js"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-verify-freezer.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
REPO="$WORK/repo"; RUN_ID='run-verify-freezer-1234'; RUN_DIR="$REPO/.vulpora/tasks/$RUN_ID"; mkdir -p "$RUN_DIR"

node - "$RUN_DIR" "$RUN_ID" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');const [dir,runId]=process.argv.slice(2);
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const sha=crypto.createHash('sha256').update('spec').digest('hex'),spec={id:'spec-1',revision:1,sha256:sha};
const question={requested:false,reason:null,blocker_signature:null,asked_signatures:[]};
const task=status=>[{id:'T-001',status,acceptance_criterion_ids:['AC-001']}];
const base={schema:'vulpora.start-task-run-control/v1',run_id:runId,spec,next_spec:spec,question,acceptance_evidence:[],terminal_status:null,successor:null};
const states=[
 {...base,current_phase:'clarify',next_phase:'approve',tasks:[],acceptance_criteria:[]},
 {...base,current_phase:'approve',next_phase:'split',tasks:[],acceptance_criteria:[]},
 {...base,current_phase:'split',next_phase:'execute',tasks:task('not_run'),acceptance_criteria:['AC-001']},
 {...base,current_phase:'execute',next_phase:'integrate',tasks:task('candidate'),acceptance_criteria:['AC-001']},
 {...base,current_phase:'integrate',next_phase:'verify',tasks:task('candidate'),acceptance_criteria:['AC-001']},
];
states.forEach((state,index)=>fs.writeFileSync(`${dir}/run-control-${String(index+1).padStart(4,'0')}.json`,canonical(state)));
NODE

for item in 'clarify 0001' 'approve 0002' 'split 0003' 'execute 0004' 'integrate 0005'; do
  set -- $item; phase="$1"; index="$2"
  printf '{"run_id":"%s","phase":"%s","event_type":"run_control_state_frozen","status":"passed","source_type":"filesystem_digest","source_ref":".vulpora/tasks/%s/run-control-%s.json","message":"Checkpoint frozen."}' "$RUN_ID" "$phase" "$RUN_ID" "$index" \
    | (cd "$REPO" && node "$APPEND" ".vulpora/tasks/$RUN_ID/execution-ledger.jsonl") >/dev/null
done

(cd "$REPO" && node "$VERIFY" ".vulpora/tasks/$RUN_ID/execution-ledger.jsonl" "$RUN_ID" 30 offline-test \
  ".vulpora/tasks/$RUN_ID/run-control-0006.json" -- node -e 'process.exit(0)') >"$WORK/result.json"
node - "$WORK/result.json" "$RUN_DIR/run-control-0006.json" <<'NODE'
const fs=require('node:fs');const [resultPath,statePath]=process.argv.slice(2);
const result=JSON.parse(fs.readFileSync(resultPath)),state=JSON.parse(fs.readFileSync(statePath));
if(result.outcome!=='pass'||!result.observed_ref.endsWith(':exit:0')||state.terminal_status!=='complete'
  ||state.tasks[0].status!=='verified'||state.acceptance_evidence[0].observed_ref!==result.observed_ref)process.exit(1);
NODE
(cd "$REPO" && node - "$VALIDATE" ".vulpora/tasks/$RUN_ID/execution-ledger.jsonl" "$RUN_ID" <<'NODE'
const [validator,ledgerPath,runId]=process.argv.slice(2),x=require(validator).validateLedgerFile(ledgerPath,runId);
if(x.records.filter(record=>record.event_type==='run_control_state_frozen').length!==6
  ||x.records.filter(record=>record.event_type==='verification_recorded').length!==1)process.exit(1);
NODE
)
printf '{"semantic_ac_key":"start_task_verify_freezer","outcome":"pass","observed_verification_bound":true,"terminal_checkpoint_frozen":true}\n'
