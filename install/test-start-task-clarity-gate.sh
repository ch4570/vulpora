#!/usr/bin/env bash
set -eu
DIR="$(cd "$(dirname "$0")" && pwd -P)"; ROOT="$(cd "$DIR/.." && pwd -P)"
VALIDATOR="$ROOT/skills/start-task/scripts/validate-clarity-gate.js"
LEDGER_VALIDATOR="$ROOT/skills/start-task/scripts/validate-execution-ledger.js"
DAG_VALIDATOR="$ROOT/skills/start-task/scripts/validate-task-dag.js"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-clarity-gate.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

make_case() {
  name="$1"; mutation="$2"
  node - "$WORK/$name.json" "$mutation" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');const [path,mutation]=process.argv.slice(2);
const canonical=(value)=>{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;};
const sha=(value)=>crypto.createHash('sha256').update(value).digest('hex');
const dimensions=[['goal',20],['scope',20],['acceptance',20],['constraints',15],['authority_risk',15],['verification',10]]
  .map(([id,weight])=>({id,weight,rating:4,awarded:weight,evidence:`user: ${id} decision is explicitly documented`}));
const value={spec_status:'ready',approval:true,unknowns:[],clarity_gate:{score:100,threshold:85,status:'passed',dimensions,skip:{requested:false,basis:null,reason:null,accepted_risk_unknown_ids:[],non_bypassable_blocker_ids:[]}}};
if(mutation==='score_mismatch')value.clarity_gate.score=99;
if(mutation==='ready_blocked')value.clarity_gate.status='blocked';
if(mutation==='premature_ready'){value.approval=false;}
if(mutation==='needs_input_approved'){value.spec_status='needs_input';}
if(mutation==='stale_needs_input'){value.spec_status='needs_input';value.approval=false;}
const risk=(category='scope')=>({id:'U-1',category,summary:'A reversible scope detail remains unresolved.',blocking:false,disposition:'accepted_risk'});
const makeSkip=()=>{value.unknowns=[risk()];value.clarity_gate.status='skipped';value.clarity_gate.score=75;for(const id of ['constraints','verification']){const d=value.clarity_gate.dimensions.find(x=>x.id===id);d.rating=0;d.awarded=0;}const unknownsSha=sha(canonical(value.unknowns.slice().sort((a,b)=>a.id.localeCompare(b.id))));const offer={run_id:'run-clarity-1234',offered_clarity_score:75,offered_ambiguity_score:25,offered_unknown_ids:['U-1'],offered_unknowns_sha256:unknownsSha,question_signature:'blocker:U-1'};const answerSha='f'.repeat(64),offerSha=sha(canonical(offer));value.clarity_gate.skip={requested:true,basis:'explicit_user_request',reason:'user chose implementation with known uncertainty',decision_ref:`answer-sha256:${answerSha}`,decision_context:{...offer,answer_sha256:answerSha,offer_sha256:offerSha,offer_ref:`file-sha256:${offerSha}:.vulpora/tasks/${offer.run_id}/clarification-offer-${offerSha}.json`},accepted_risk_unknown_ids:['U-1'],non_bypassable_blocker_ids:[]};};
if(mutation==='valid_skip')makeSkip();
if(mutation==='unsafe_skip'){makeSkip();value.unknowns=[{id:'U-destructive',category:'destructive',summary:'Production records may be deleted without recovery.',blocking:true,disposition:'pending'}];value.clarity_gate.skip.accepted_risk_unknown_ids=[];value.clarity_gate.skip.non_bypassable_blocker_ids=['U-destructive'];}
if(mutation==='bad_disposition'){makeSkip();value.unknowns[0].disposition='assumed';}
if(mutation==='missing_decision_ref'){makeSkip();delete value.clarity_gate.skip.decision_ref;value.clarity_gate.skip.reason='caller claim only';}
if(mutation==='task_input_skip'){makeSkip();value.clarity_gate.skip.decision_ref=`task-input-sha256:${'f'.repeat(64)}`;}
if(mutation==='empty_risk_skip'){makeSkip();value.unknowns=[];value.clarity_gate.skip.accepted_risk_unknown_ids=[];}
if(mutation==='threshold_skip'){makeSkip();value.clarity_gate.score=85;const v=value.clarity_gate.dimensions.find(x=>x.id==='verification');v.rating=4;v.awarded=10;}
if(mutation==='missing_risk_detail'){makeSkip();delete value.unknowns[0].summary;}
if(mutation==='disguised_authority_risk'){makeSkip();value.unknowns=[risk('authority')];}
if(mutation==='zero_goal_skip'){makeSkip();const goal=value.clarity_gate.dimensions.find(x=>x.id==='goal');goal.rating=0;goal.awarded=0;value.clarity_gate.score=55;}
if(mutation==='placeholder_evidence'){value.clarity_gate.dimensions[0].evidence='x';}
if(mutation==='assumption_overclaim'){value.clarity_gate.dimensions[1].evidence='assumption: scope is probably complete enough for execution';}
if(mutation==='authority_repository_claim'){value.clarity_gate.dimensions.find(x=>x.id==='authority_risk').evidence='repository: write authority is inferred from local files';}
if(mutation==='stale_pass_provenance'){value.clarity_gate.skip.basis='explicit_user_request';value.clarity_gate.skip.reason='stale skip metadata';}
if(mutation==='short_skip_reason'){makeSkip();value.clarity_gate.skip.reason='x';}
if(mutation==='skipped_failed_status'){makeSkip();value.spec_status='failed';value.approval=false;}
if(mutation==='hidden_assumption_skip'){makeSkip();value.unknowns.push({id:'U-2',category:'implementation_detail',summary:'A reversible implementation detail is still assumed.',blocking:false,disposition:'assumed'});}
if(mutation==='approval_outside_ready'){value.spec_status='failed';}
if(mutation==='stale_offer_score'){makeSkip();value.clarity_gate.score=55;const scope=value.clarity_gate.dimensions.find(x=>x.id==='scope');scope.rating=0;scope.awarded=0;}
if(mutation==='stale_offer_unknowns'){makeSkip();value.unknowns.push({id:'U-2',category:'verification',summary:'A second verification risk remains unresolved.',blocking:false,disposition:'accepted_risk'});value.clarity_gate.skip.accepted_risk_unknown_ids.push('U-2');}
if(mutation==='stale_offer_run'){makeSkip();value.clarity_gate.skip.decision_context.run_id='run-other-1234';}
if(mutation==='stale_unknown_summary'){makeSkip();value.unknowns[0].summary='A different reversible scope meaning replaced the offered risk.';}
fs.writeFileSync(path,JSON.stringify(value));
NODE
}

expect_pass() { node "$VALIDATOR" < "$1" >/dev/null; }
expect_fail() { if node "$VALIDATOR" < "$1" >/dev/null 2>&1; then return 1; fi; }

make_case passed none
make_case premature-ready premature_ready
make_case needs-input-approved needs_input_approved
make_case stale-needs-input stale_needs_input
make_case score-mismatch score_mismatch
make_case ready-blocked ready_blocked
make_case skipped valid_skip
make_case unsafe-skip unsafe_skip
make_case bad-disposition bad_disposition
make_case missing-decision-ref missing_decision_ref
make_case task-input-skip task_input_skip
make_case empty-risk-skip empty_risk_skip
make_case threshold-skip threshold_skip
make_case missing-risk-detail missing_risk_detail
make_case disguised-authority-risk disguised_authority_risk
make_case zero-goal-skip zero_goal_skip
make_case placeholder-evidence placeholder_evidence
make_case assumption-overclaim assumption_overclaim
make_case authority-repository-claim authority_repository_claim
make_case stale-pass-provenance stale_pass_provenance
make_case short-skip-reason short_skip_reason
make_case skipped-failed-status skipped_failed_status
make_case hidden-assumption-skip hidden_assumption_skip
make_case approval-outside-ready approval_outside_ready
make_case stale-offer-score stale_offer_score
make_case stale-offer-unknowns stale_offer_unknowns
make_case stale-offer-run stale_offer_run
make_case stale-unknown-summary stale_unknown_summary

expect_pass "$WORK/passed.json"
expect_pass "$WORK/skipped.json"
expect_fail "$WORK/premature-ready.json"
expect_fail "$WORK/needs-input-approved.json"
expect_fail "$WORK/stale-needs-input.json"
expect_fail "$WORK/score-mismatch.json"
expect_fail "$WORK/ready-blocked.json"
expect_fail "$WORK/unsafe-skip.json"
expect_fail "$WORK/bad-disposition.json"
expect_fail "$WORK/missing-decision-ref.json"
expect_fail "$WORK/task-input-skip.json"
expect_fail "$WORK/empty-risk-skip.json"
expect_fail "$WORK/threshold-skip.json"
expect_fail "$WORK/missing-risk-detail.json"
expect_fail "$WORK/disguised-authority-risk.json"
expect_fail "$WORK/zero-goal-skip.json"
expect_fail "$WORK/placeholder-evidence.json"
expect_fail "$WORK/assumption-overclaim.json"
expect_fail "$WORK/authority-repository-claim.json"
expect_fail "$WORK/stale-pass-provenance.json"
expect_fail "$WORK/short-skip-reason.json"
expect_fail "$WORK/skipped-failed-status.json"
expect_fail "$WORK/hidden-assumption-skip.json"
expect_fail "$WORK/approval-outside-ready.json"
expect_fail "$WORK/stale-offer-score.json"
expect_fail "$WORK/stale-offer-unknowns.json"
expect_fail "$WORK/stale-offer-run.json"
expect_fail "$WORK/stale-unknown-summary.json"

node - "$LEDGER_VALIDATOR" <<'NODE'
const crypto=require('node:crypto');const {canonicalJson,validateLifecycle,validateProceedDecisionBinding}=require(process.argv[2]);const answer='f'.repeat(64),ref=`answer-sha256:${answer}`;
const unknown={id:'U-1',category:'scope',summary:'A reversible scope detail remains unresolved.',blocking:false,disposition:'accepted_risk'};
const unknownsSha=crypto.createHash('sha256').update(canonicalJson([unknown])).digest('hex');
const offerPayload={run_id:'run-clarity-1234',offered_clarity_score:75,offered_ambiguity_score:25,offered_unknown_ids:['U-1'],offered_unknowns_sha256:unknownsSha,question_signature:'blocker:U-1'};
const offerSha=crypto.createHash('sha256').update(canonicalJson(offerPayload)).digest('hex');
const context={...offerPayload,answer_sha256:answer,offer_sha256:offerSha,offer_ref:`file-sha256:${offerSha}:.vulpora/tasks/${offerPayload.run_id}/clarification-offer-${offerSha}.json`};
const spec={clarity_projection:{clarity_gate:{skip:{requested:true,decision_ref:ref,decision_context:context}}}};
const offer={run_id:offerPayload.run_id,sequence:1,event_type:'clarification_offer_frozen',phase:'clarify',status:'passed',source_type:'filesystem_digest',source_ref:context.offer_ref};
const question={run_id:offerPayload.run_id,sequence:2,event_type:'question_requested',phase:'clarify',status:'reported',source_type:'agent_claim',source_ref:offerPayload.question_signature};
const commit={run_id:offerPayload.run_id,sequence:3,event_type:'spec_committed',phase:'approve',status:'reported',source_type:'user_decision',source_ref:ref};
validateProceedDecisionBinding([offer,question,commit],spec);
let rejected=false;try{validateProceedDecisionBinding([],spec);}catch{rejected=true;}if(!rejected)process.exit(1);
rejected=false;try{validateProceedDecisionBinding([offer,question,{...commit,phase:'terminal'}],spec);}catch{rejected=true;}if(!rejected)process.exit(1);
const valid={event_type:'spec_committed',phase:'approve',status:'reported',source_type:'user_decision',source_ref:ref};
validateLifecycle([valid],'active');
rejected=false;try{validateLifecycle([valid,{...valid,source_type:'agent_claim'}],'active');}catch{rejected=true;}if(!rejected)process.exit(1);
const runId='run-claim-freeze-1234',projectionSha='a'.repeat(64),commandSha='c'.repeat(64);
const claimFreezeRecords=[
  {run_id:runId,sequence:1,event_type:'run_initialized',phase:'clarify',status:'reported',source_type:'agent_claim',source_ref:'agent:primary'},
  {run_id:runId,sequence:2,event_type:'spec_committed',phase:'approve',status:'reported',source_type:'user_decision',source_ref:`task-input-sha256:${'d'.repeat(64)}`},
  {run_id:runId,sequence:3,event_type:'clarity_projection_frozen',phase:'approve',status:'passed',source_type:'filesystem_digest',source_ref:`file-sha256:${projectionSha}:.vulpora/tasks/${runId}/clarity-projection.json`},
  {run_id:runId,sequence:4,event_type:'command_finished',phase:'approve',status:'passed',source_type:'runtime_result',source_ref:`command-sha256:${commandSha}:exit:0`},
  {run_id:runId,sequence:5,event_type:'clarity_gate_validated',phase:'approve',status:'passed',source_type:'runtime_result',source_ref:`clarity-command-sha256:${commandSha}:projection-sha256:${projectionSha}`},
  {run_id:runId,sequence:6,event_type:'artifact_frozen',phase:'approve',status:'reported',source_type:'agent_claim',source_ref:`claim:${runId}/clarified-spec.yaml`},
  {run_id:runId,sequence:7,event_type:'artifact_frozen',phase:'split',status:'reported',source_type:'agent_claim',source_ref:`claim:${runId}/task-dag.yaml`},
];
rejected=false;try{validateLifecycle(claimFreezeRecords,'active');}catch{rejected=true;}if(!rejected)process.exit(1);
NODE

node - "$DAG_VALIDATOR" <<'NODE'
const {validateAcceptedRiskMappings}=require(process.argv[2]);
const tasks=new Map([['T-1',{}]]);
validateAcceptedRiskMappings([{unknown_id:'U-1',treatment:'verification',detail:'Verify the unresolved behavior during execution.',task_ids:['T-1']}],['U-1'],tasks);
for(const risks of [[],[{unknown_id:'U-2',treatment:'verification',detail:'Verify an unrelated unknown during execution.',task_ids:['T-1']}],[{unknown_id:'U-1',treatment:'verification',detail:'No task is bound to this accepted risk.',task_ids:[]}]]){
  let rejected=false;try{validateAcceptedRiskMappings(risks,['U-1'],tasks);}catch{rejected=true;}if(!rejected)process.exit(1);
}
NODE

printf '{"semantic_ac_key":"clarity_gate_validation","outcome":"pass","threshold":85,"score_math":true,"evidence_provenance_required":true,"assumption_overclaim_rejected":true,"accepted_risk_detail_required":true,"accepted_risk_dag_mapped":true,"implementation_intent_unlocks_ready":true,"premature_ready_rejected":true,"needs_input_approval_rejected":true,"stale_needs_input_rejected":true,"ready_blocked_rejected":true,"explicit_skip":true,"answer_turn_only_skip":true,"offer_context_bound":true,"offered_unknown_semantics_bound":true,"stale_offer_rejected":true,"claim_only_artifact_freeze_rejected":true,"duplicate_spec_commit_rejected":true,"proceed_decision_ledger_bound":true,"unsafe_skip_rejected":true}\n'
