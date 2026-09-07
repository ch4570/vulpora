#!/usr/bin/env bash
# Deterministic regression contract for ledger-bound run control and evidence-gated completion.

set -eu
set -f

DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-run-control.XXXXXX")" || exit 1
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

node - "$ROOT" "$WORK" <<'NODE'
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const [root, work] = process.argv.slice(2);
const validator = path.join(root, 'skills/start-task/scripts/validate-run-control.js');
const append = path.join(root, 'skills/start-task/scripts/append-execution-ledger.js');
const ledgerValidator = path.join(root, 'skills/start-task/scripts/validate-execution-ledger.js');
const recordCommand = path.join(root, 'skills/start-task/scripts/record-execution-command.js');
const clarityValidator = path.join(root, 'skills/start-task/scripts/validate-clarity-gate.js');
const freezeRunControl = path.join(root, 'skills/start-task/scripts/freeze-run-control.js');
let passed = 0;
let failed = 0;

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
function run(command, args, options = {}) {
  return spawnSync(command, args, {cwd: options.cwd, input: options.input, encoding: 'utf8'});
}
function expectPass(label, result) {
  if (result.status === 0) passed += 1;
  else { failed += 1; process.stderr.write(`FAIL ${label}: ${result.stderr || result.stdout}\n`); }
}
function expectFail(label, result) {
  if (result.status !== 0) passed += 1;
  else { failed += 1; process.stderr.write(`UNEXPECTED PASS ${label}\n`); }
}
function setup(runId) {
  const repo = path.join(work, runId);
  const runDir = path.join(repo, '.vulpora/tasks', runId);
  fs.mkdirSync(runDir, {recursive: true});
  const ledger = path.join(runDir, 'execution-ledger.jsonl');
  appendEvent(repo, ledger, {run_id:runId,phase:'clarify',event_type:'run_initialized',status:'reported',source_type:'agent_claim',source_ref:'agent:primary',message:'Run initialized.'});
  return {repo, runDir, ledger, runId, previous: '-'};
}
function appendEvent(repo, ledger, event) {
  const result = run(process.execPath, [append, ledger], {cwd: repo, input: JSON.stringify(event)});
  if (result.status !== 0) throw new Error(result.stderr);
}
function anchor(ctx) {
  const result = run(process.execPath, [ledgerValidator, ctx.ledger, ctx.runId], {cwd: ctx.repo});
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}
function state(ctx, index, values) {
  const emptyQuestion = {requested:false,reason:null,blocker_signature:null,asked_signatures:[]};
  const value = {
    schema:'vulpora.start-task-run-control/v1',run_id:ctx.runId,
    current_phase:values.current_phase,next_phase:values.next_phase,
    spec:values.spec ?? null,next_spec:values.next_spec ?? values.spec ?? null,
    question:values.question || emptyQuestion,
    tasks:values.tasks || [],acceptance_criteria:values.acceptance_criteria || [],
    acceptance_evidence:values.acceptance_evidence || [],terminal_status:values.terminal_status ?? null,
    successor:values.successor || null,
  };
  const file = path.join(ctx.runDir, `run-control-${String(index).padStart(4,'0')}.json`);
  fs.writeFileSync(file, canonical(value));
  return file;
}
function validate(ctx, previous, next, overrideAnchor) {
  const current = anchor(ctx);
  const use = overrideAnchor || current;
  return run(process.execPath, [validator, previous, next, ctx.ledger, use.head_sha256, String(use.record_count)], {cwd:ctx.repo});
}
function freeze(ctx, file, phase) {
  const result = validate(ctx, ctx.previous, file);
  expectPass(`freeze ${path.basename(file)}`, result);
  if (result.status !== 0) return;
  appendEvent(ctx.repo, ctx.ledger, {run_id:ctx.runId,phase,event_type:'run_control_state_frozen',status:'passed',source_type:'filesystem_digest',source_ref:path.relative(ctx.repo,file),message:'Run control state frozen.'});
  ctx.previous = file;
}

const shaA = 'a'.repeat(64);
const shaB = 'b'.repeat(64);
const specA = {id:'spec-1',revision:1,sha256:shaA};
const taskNotRun = [{id:'T-001',status:'not_run',acceptance_criterion_ids:['AC-001']}];
const taskCandidate = [{id:'T-001',status:'candidate',acceptance_criterion_ids:['AC-001']}];
const taskVerified = [{id:'T-001',status:'verified',acceptance_criterion_ids:['AC-001']}];
const evidence = [{acceptance_criterion_id:'AC-001',task_id:'T-001',verification_outcome:'pass',observed_ref:`command-sha256:${shaB}`}];
const failedEvidence = {acceptance_criterion_id:'AC-001',task_id:'T-001',verification_outcome:'failed',observed_ref:`command-sha256:${'d'.repeat(64)}`};

const main = setup('run-main');
const s1 = state(main,1,{current_phase:'clarify',next_phase:'approve',spec:specA});
freeze(main,s1,'clarify');
const drift = state(main,2,{current_phase:'approve',next_phase:'split',spec:{id:'spec-1',revision:1,sha256:'c'.repeat(64)}});
expectFail('cross-transition spec drift', validate(main,s1,drift));
fs.unlinkSync(drift);
const s2 = state(main,2,{current_phase:'approve',next_phase:'split',spec:specA});
fs.writeFileSync(path.join(main.runDir,'clarified-spec.yaml'),canonical({id:'spec-1'}));
appendEvent(main.repo,main.ledger,{run_id:main.runId,phase:'approve',event_type:'spec_committed',status:'reported',source_type:'user_decision',source_ref:`task-input-sha256:${shaA}`,message:'Implementation intent committed.'});
const dimensions=[['goal',20],['scope',20],['acceptance',20],['constraints',15],['authority_risk',15],['verification',10]]
  .map(([id,weight])=>({id,weight,rating:4,awarded:weight,evidence:`${id==='goal'?'user':id==='authority_risk'?'policy':'repository'}: ${id} evidence is explicit in the autonomy fixture`}));
fs.writeFileSync(path.join(main.runDir,'clarity-projection.json'),canonical({spec_status:'ready',approval:true,unknowns:[],clarity_gate:{score:100,threshold:85,status:'passed',dimensions,skip:{requested:false,basis:null,reason:null,accepted_risk_unknown_ids:[],non_bypassable_blocker_ids:[]}}}));
appendEvent(main.repo,main.ledger,{run_id:main.runId,phase:'approve',event_type:'clarity_projection_frozen',status:'passed',source_type:'filesystem_digest',source_ref:'.vulpora/tasks/run-main/clarity-projection.json',message:'Clarity projection frozen.'});
const clarityResult=run(process.execPath,[recordCommand,main.ledger,main.runId,'approve','10','Clarity gate validation','--stdin-file','.vulpora/tasks/run-main/clarity-projection.json','--contract','clarity-gate','--','node',clarityValidator],{cwd:main.repo});
if(clarityResult.status!==0)throw new Error(clarityResult.stderr);
appendEvent(main.repo,main.ledger,{run_id:main.runId,phase:'approve',event_type:'artifact_frozen',status:'passed',source_type:'filesystem_digest',source_ref:'.vulpora/tasks/run-main/clarified-spec.yaml',message:'Spec frozen.'});
freeze(main,s2,'approve');
const rollback = state(main,3,{current_phase:'execute',next_phase:'split',spec:specA});
expectFail('phase rollback', validate(main,s2,rollback));
fs.unlinkSync(rollback);
const s3 = state(main,3,{current_phase:'split',next_phase:'execute',spec:specA,tasks:taskNotRun,acceptance_criteria:['AC-001']});
fs.writeFileSync(path.join(main.runDir,'task-dag.yaml'),canonical({id:'plan-1'}));
appendEvent(main.repo,main.ledger,{run_id:main.runId,phase:'split',event_type:'artifact_frozen',status:'passed',source_type:'filesystem_digest',source_ref:'.vulpora/tasks/run-main/task-dag.yaml',message:'DAG frozen.'});
freeze(main,s3,'split');
const s4 = state(main,4,{current_phase:'execute',next_phase:'integrate',spec:specA,tasks:taskCandidate,acceptance_criteria:['AC-001']});
freeze(main,s4,'execute');
const invalidSuccessor = state(main,5,{current_phase:'integrate',next_phase:'terminal',spec:specA,tasks:taskCandidate,acceptance_criteria:['AC-001'],terminal_status:'cancelled',successor:{reason:'normative_change',revision:2,supersedes_sha256:shaB}});
expectFail('successor provenance drift', validate(main,s4,invalidSuccessor));
fs.unlinkSync(invalidSuccessor);
const validSuccessor = state(main,5,{current_phase:'integrate',next_phase:'terminal',spec:specA,tasks:taskCandidate,acceptance_criteria:['AC-001'],terminal_status:'cancelled',successor:{reason:'normative_change',revision:2,supersedes_sha256:shaA}});
expectPass('normative change successor', validate(main,s4,validSuccessor));
fs.unlinkSync(validSuccessor);
const s5 = state(main,5,{current_phase:'integrate',next_phase:'verify',spec:specA,tasks:taskCandidate,acceptance_criteria:['AC-001']});
freeze(main,s5,'integrate');
const repair = state(main,6,{current_phase:'verify',next_phase:'verify',spec:specA,tasks:[{id:'T-001',status:'failed',acceptance_criterion_ids:['AC-001']}],acceptance_criteria:['AC-001']});
expectPass('verify repair self-loop', validate(main,s5,repair));
fs.unlinkSync(repair);
const incomplete = state(main,6,{current_phase:'verify',next_phase:'terminal',spec:specA,tasks:taskVerified,acceptance_criteria:['AC-001'],terminal_status:'complete'});
expectFail('complete without AC evidence', validate(main,s5,incomplete));
fs.unlinkSync(incomplete);
const s6 = state(main,6,{current_phase:'verify',next_phase:'terminal',spec:specA,tasks:taskVerified,acceptance_criteria:['AC-001'],acceptance_evidence:[failedEvidence,...evidence],terminal_status:'complete'});
expectPass('valid complete', validate(main,s5,s6));
expectFail('stale previous state', validate(main,s1,s6));
const staleAnchor = anchor(main); staleAnchor.record_count -= 1;
expectFail('stale ledger anchor', validate(main,s5,s6,staleAnchor));

const questions = setup('run-questions');
const earlyTasks = state(questions,1,{current_phase:'clarify',next_phase:'clarify',tasks:taskNotRun,acceptance_criteria:['AC-001']});
expectFail('task inventory before split', validate(questions,'-',earlyTasks));
fs.unlinkSync(earlyTasks);
const earlyPartial = state(questions,1,{current_phase:'clarify',next_phase:'terminal',terminal_status:'partial'});
expectFail('partial before executed subset', validate(questions,'-',earlyPartial));
fs.unlinkSync(earlyPartial);
const q1 = state(questions,1,{current_phase:'clarify',next_phase:'clarify',question:{requested:true,reason:'material_scope',blocker_signature:'scope-1',asked_signatures:[]}});
freeze(questions,q1,'clarify');
const answered = state(questions,2,{current_phase:'clarify',next_phase:'approve',spec:specA,question:{requested:false,reason:null,blocker_signature:null,asked_signatures:['scope-1']}});
expectPass('answered question commits first spec', validate(questions,q1,answered));
const beforeRecordedValidation = anchor(questions);
expectPass('recorded validator accepts bound self command', run(process.execPath, [
  path.join(root,'skills/start-task/scripts/record-execution-command.js'), questions.ledger, questions.runId,
  'clarify', '10', 'Run control integration', '--', process.execPath, validator, q1, answered,
  questions.ledger, beforeRecordedValidation.head_sha256, String(beforeRecordedValidation.record_count),
], {cwd:questions.repo}));
const beforeRelativeRecordedValidation = anchor(questions);
const relativeValidator = path.relative(fs.realpathSync.native(questions.repo), fs.realpathSync.native(validator));
expectPass('recorded validator accepts relative node command identity', run(process.execPath, [
  path.join(root,'skills/start-task/scripts/record-execution-command.js'), questions.ledger, questions.runId,
  'clarify', '10', 'Relative run control integration', '--', 'node', relativeValidator, q1, answered,
  questions.ledger, beforeRelativeRecordedValidation.head_sha256, String(beforeRelativeRecordedValidation.record_count),
], {cwd:questions.repo}));
fs.unlinkSync(answered);
const reset = state(questions,2,{current_phase:'clarify',next_phase:'clarify'});
expectFail('question history reset', validate(questions,q1,reset));
fs.unlinkSync(reset);
const repeated = state(questions,2,{current_phase:'clarify',next_phase:'clarify',question:{requested:true,reason:'material_scope',blocker_signature:'scope-1',asked_signatures:['scope-1']}});
expectFail('repeated question', validate(questions,q1,repeated));
fs.unlinkSync(repeated);
const hardWait = state(questions,2,{current_phase:'clarify',next_phase:'approve',spec:specA,question:{requested:true,reason:'material_scope',blocker_signature:'scope-2',asked_signatures:['scope-1']}});
expectFail('question hard wait', validate(questions,q1,hardWait));
fs.unlinkSync(hardWait);
const q2 = state(questions,2,{current_phase:'clarify',next_phase:'clarify',question:{requested:true,reason:'material_scope',blocker_signature:'scope-2',asked_signatures:['scope-1']}});
freeze(questions,q2,'clarify');
const q3 = state(questions,3,{current_phase:'clarify',next_phase:'clarify',question:{requested:true,reason:'authority',blocker_signature:'scope-3',asked_signatures:['scope-1','scope-2']}});
freeze(questions,q3,'clarify');
const q4 = state(questions,4,{current_phase:'clarify',next_phase:'clarify',question:{requested:true,reason:'authority',blocker_signature:'scope-4',asked_signatures:['scope-1','scope-2','scope-3']}});
freeze(questions,q4,'clarify');

const automated = setup('run-freezer');
const automatedState = state(automated,1,{current_phase:'clarify',next_phase:'approve',spec:specA});
expectPass('deterministic run-control freezer infers phase and anchor', run(process.execPath, [
  freezeRunControl,
  path.relative(automated.repo, automated.ledger),
  automated.runId,
  path.relative(automated.repo, automatedState),
], {cwd:automated.repo}));
const automatedAfterFreeze = anchor(automated);
const frozenRecords = fs.readFileSync(automated.ledger,'utf8').trim().split('\n').map(JSON.parse);
if(frozenRecords.filter((record)=>record.event_type==='run_control_state_frozen').length!==1
  ||frozenRecords.filter((record)=>record.event_type==='command_finished'&&record.status==='passed').length!==1){
  failed += 1; process.stderr.write('FAIL deterministic run-control freezer evidence\n');
}else passed += 1;
expectFail('deterministic run-control freezer rejects duplicate without mutation', run(process.execPath, [
  freezeRunControl,
  path.relative(automated.repo, automated.ledger),
  automated.runId,
  path.relative(automated.repo, automatedState),
], {cwd:automated.repo}));
const automatedAfterDuplicate = anchor(automated);
if(automatedAfterDuplicate.head_sha256!==automatedAfterFreeze.head_sha256
  ||automatedAfterDuplicate.record_count!==automatedAfterFreeze.record_count){
  failed += 1; process.stderr.write('FAIL duplicate freezer mutated ledger\n');
}else passed += 1;

process.stdout.write(`start-task autonomy contract: PASS=${passed} FAIL=${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
NODE
