#!/usr/bin/env bash
set -eu
set -f

DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"
LEDGER_VALIDATOR="$ROOT/skills/start-task/scripts/validate-execution-ledger.js"
REPORT_SCHEMA="$ROOT/skills/start-task/reference/kb/orchestration-report.schema.json"

node - "$LEDGER_VALIDATOR" <<'NODE'
const {validateClarificationPath,validateClarificationRounds}=require(process.argv[2]);
if(typeof validateClarificationPath!=='function'||typeof validateClarificationRounds!=='function')process.exit(1);

const HASH='a'.repeat(64);
const event=(sequence,event_type,source_ref)=>({
  sequence,event_type,phase:'clarify',source_ref,status:'reported',source_type:'agent_claim',
});
const roundStart=(sequence,session,round)=>event(sequence,'clarification_round_started',`${session}:round:${round}:input-sha256:${HASH}`);
const heartbeat=(sequence,session,round)=>event(sequence,'clarification_heartbeat',`${session}:round:${round}:heartbeat-sha256:${HASH}`);
const yielded=(sequence,session,round,index)=>event(sequence,'clarification_host_yielded',`${session}:round:${round}:yield:${index}`);
const roundFinish=(sequence,session,round,status,score)=>event(sequence,'clarification_round_finished',`${session}:round:${round}:output-sha256:${HASH}:score:${score}:status:${status}`);
const stalled=(sequence,session,round,reason)=>event(sequence,'clarification_round_stalled',`${session}:round:${round}:stalled:${reason}`);
const splitter={agent_id:'task-splitter',native_child_id:'split-1',outcome:'pass'};

const unavailableRef='fallback:requirement-dialogue:unavailable';
const unavailable=[
  event(1,'clarification_fallback_started',unavailableRef),roundStart(2,unavailableRef,0),
  roundFinish(3,unavailableRef,0,'ready',90),event(4,'clarification_fallback_finished',unavailableRef),
];
validateClarificationPath(unavailable,{children:[splitter]});

const childRef='child:requirement-dialogue:clarify-1';
const noProgressRef='fallback:requirement-dialogue:no_progress_at_yield';
const noProgress=[
  event(1,'child_dispatched',childRef),roundStart(2,childRef,0),heartbeat(3,childRef,0),
  yielded(4,childRef,0,1),yielded(5,childRef,0,2),stalled(6,childRef,0,'no_progress_at_yield'),
  event(7,'child_finished',childRef),event(8,'clarification_fallback_started',noProgressRef),
  roundStart(9,noProgressRef,0),roundFinish(10,noProgressRef,0,'ready',90),
  event(11,'clarification_fallback_finished',noProgressRef),
];
validateClarificationPath(noProgress,{children:[
  {agent_id:'requirement-dialogue',native_child_id:'clarify-1',outcome:'timeout'},splitter,
]});

const disconnectRef='fallback:requirement-dialogue:host_disconnect';
const disconnect=[
  event(1,'child_dispatched',childRef),roundStart(2,childRef,0),heartbeat(3,childRef,0),
  stalled(4,childRef,0,'host_disconnect'),event(5,'child_finished',childRef),
  event(6,'clarification_fallback_started',disconnectRef),roundStart(7,disconnectRef,0),
  roundFinish(8,disconnectRef,0,'ready',90),event(9,'clarification_fallback_finished',disconnectRef),
];
validateClarificationPath(disconnect,{children:[
  {agent_id:'requirement-dialogue',native_child_id:'clarify-1',outcome:'failed'},splitter,
]});

const terminalTimeoutRef='fallback:requirement-dialogue:terminal_timeout';
const terminalTimeout=[
  event(1,'child_dispatched',childRef),roundStart(2,childRef,0),
  stalled(3,childRef,0,'terminal_timeout'),event(4,'child_finished',childRef),
  event(5,'clarification_fallback_started',terminalTimeoutRef),roundStart(6,terminalTimeoutRef,0),
  roundFinish(7,terminalTimeoutRef,0,'ready',90),event(8,'clarification_fallback_finished',terminalTimeoutRef),
];
validateClarificationPath(terminalTimeout,{children:[
  {agent_id:'requirement-dialogue',native_child_id:'clarify-1',outcome:'timeout'},splitter,
]});

const invalidRef='fallback:requirement-dialogue:invalid_result';
const invalid=[
  event(1,'child_dispatched',childRef),roundStart(2,childRef,0),roundFinish(3,childRef,0,'invalid_result',75),
  event(4,'child_finished',childRef),event(5,'clarification_fallback_started',invalidRef),
  roundStart(6,invalidRef,0),roundFinish(7,invalidRef,0,'ready',90),
  event(8,'clarification_fallback_finished',invalidRef),
];
validateClarificationPath(invalid,{children:[
  {agent_id:'requirement-dialogue',native_child_id:'clarify-1',outcome:'failed'},splitter,
]});

const successfulWithFallback=[
  event(1,'child_dispatched',childRef),roundStart(2,childRef,0),roundFinish(3,childRef,0,'ready',90),
  event(4,'child_finished',childRef),...unavailable.map((record,index)=>({...record,sequence:index+5})),
];
const silentYield=[roundStart(1,childRef,0),yielded(2,childRef,0,1),roundFinish(3,childRef,0,'ready',90)];
for(const [records,report] of [
  [[],{children:[splitter]}],
  [[unavailable[0]],{children:[splitter]}],
  [[...unavailable,event(5,'clarification_fallback_started',invalidRef),event(6,'clarification_fallback_finished',invalidRef)],{children:[splitter]}],
  [successfulWithFallback,{children:[{agent_id:'requirement-dialogue',native_child_id:'clarify-1',outcome:'pass'},splitter]}],
  [noProgress.map((record)=>record.sequence===7?{...record,phase:'verify'}:record),{children:[{agent_id:'requirement-dialogue',native_child_id:'clarify-1',outcome:'timeout'},splitter]}],
]){
  let rejected=false;try{validateClarificationPath(records,report);}catch{rejected=true;}
  if(!rejected)process.exit(1);
}
let silentRejected=false;try{validateClarificationRounds(silentYield,childRef,['ready']);}catch{silentRejected=true;}
if(!silentRejected)process.exit(1);
NODE

node - "$REPORT_SCHEMA" <<'NODE'
const schema=require(process.argv[2]);
const children=schema.properties.children;
if(children.minItems!==1||children.prefixItems!==undefined||!children.contains)process.exit(1);
if(!schema.$defs.legacyChild.properties.agent_id.enum.includes('task-splitter'))process.exit(1);
NODE

printf '{"semantic_ac_key":"start_task_clarification_fallback","outcome":"pass","spawn_unavailable_fallback":true,"heartbeat_liveness":true,"silent_host_yield_stalls":true,"disconnect_fallback":true,"terminal_timeout_fallback":true,"invalid_result_fallback":true,"round_hash_binding":true,"duplicate_fallback_rejected":true,"successful_child_fallback_rejected":true}\n'
