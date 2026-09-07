'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {canonical,hash}=require('../../skills/start-task/scripts/model-routing-io.js');
const {CONTEXT_GUIDANCE,sourceContextFor}=require('../../skills/start-task/scripts/session-context.js');
const {parseUsage}=require('../behavioral/adapters/provider-usage.cjs');
const policy=require('../../skills/start-task/scripts/model-routing-policy.json');
const shared=require('./run-economic-ab.js'),routing=require('./run-routing-ab.js'),runner=require('./run-context-ab.js');
const now=Date.parse('2026-09-07T00:00:00.000Z');
const catalog={schema:'vulpora.runtime-model-catalog/v1',runtime:'codex',source:'synthetic:context-eval-test',
  observedAt:new Date(now).toISOString(),models:Object.values(policy.runtimes.codex).flat()
    .map(id=>({id,reasoningEfforts:['low','medium','high']}))};
function temp(t) {
  const cwd=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'context-eval-offline-')));
  t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));return cwd;
}
function fixture() {
  return {id:'bounded',task:'Repair only a.js. Work directly and do not delegate.',routing:{taskType:'implementation',
    difficulty:'simple',risk:'low'},routingRationale:'One bounded verifiable conversion.',files:{'a.js':'broken'},
    allowedFiles:['a.js'],verify(cwd){const passed=fs.readFileSync(path.join(cwd,'a.js'),'utf8')==='fixed';
      return {testsPassed:passed,oraclePassed:passed,mutantChecksPassed:passed};}};
}
const usage=(input=100)=>parseUsage('codex',JSON.stringify({type:'turn.completed',
  usage:{input_tokens:input,cached_input_tokens:60,output_tokens:10}}));
function runtime(route,prompt,overrides={}) {
  return {exitCode:0,reason:null,unexpectedChild:false,usage:usage(),promptBytes:Buffer.byteLength(prompt),
    telemetry:{schema:'vulpora.session-telemetry/v1'},requestedModel:route.model,requestedEffort:route.reasoning_effort,
    dispatchEvidence:{source:'spawn-arguments',binary:'codex',model:route.model,
      reasoning_effort:route.reasoning_effort,commandSha256:'a'.repeat(64),primarySessions:1,nestedOrchestrator:false},...overrides};
}

test('context experiment requires explicit live flags and fixes a two-arm, two-repeat default plan',()=>{
  assert.equal(runner.parseArgs([]),null);assert.equal(runner.parseArgs(['--help']),null);
  assert.throws(()=>runner.parseArgs(['--out','new.json']),/EXPLICIT_RUN_REQUIRED/);
  const base=['--run','--out','new.json'],parsed=runner.parseArgs(base);
  assert.deepEqual(parsed.arms,['read','inline']);assert.deepEqual(parsed.caseIds,['query-encoding','retry']);
  assert.equal(parsed.repeats,2);assert.equal(parsed.maxTokens,500000);assert.equal(runner.LIMITS.maxAttempts,2);
  for(const extra of [['--repeats','3'],['--repeats','0'],['--max-tokens','5000001'],['--arms','read'],
    ['--reuse','old.json'],['--run'],['--cases','retry,retry']])assert.throws(()=>runner.parseArgs([...base,...extra]));
  const plan=shared.sequence(routing.validateRoutingCases(require('./routing-fixtures.cjs').cases,parsed.caseIds),parsed.arms,parsed.repeats);
  assert.equal(plan.length,8);
  for(const id of parsed.caseIds)for(const arm of parsed.arms)assert.equal(plan.filter(x=>x.fixture.id===id&&x.arm===arm).length,2);
});

test('inline treatment serializes the actual production context, preserving the base task and file fingerprints',t=>{
  const cwd=temp(t),item=fixture();fs.writeFileSync(path.join(cwd,'a.js'),'broken');
  const files=shared.snapshot(cwd),read=runner.buildPrompt(item,'read',cwd,files),inline=runner.buildPrompt(item,'inline',cwd,files);
  assert.equal(read.prompt,item.task);assert.equal(read.evidence.serializedContextBytes,0);
  assert.equal(inline.evidence.basePromptSha256,read.evidence.basePromptSha256);
  const payload=JSON.parse(inline.prompt.slice(item.task.length+1));
  assert.deepEqual(payload.source_context,sourceContextFor(cwd,['a.js'],files));
  assert.deepEqual(payload.instructions,[CONTEXT_GUIDANCE]);
  assert.equal(inline.evidence.contextSha256,hash(canonical(payload.source_context)));
  assert.deepEqual(inline.evidence.sourceFiles,[{path:'a.js',sha256:hash('broken')}]);
  assert.ok(!inline.prompt.includes('testsPassed'));assert.ok(!inline.prompt.includes('fixed'));
  assert.throws(()=>runner.buildPrompt(item,'other',cwd,files),/UNKNOWN_CONTEXT_ARM/);
  assert.throws(()=>runner.buildPrompt(item,'inline',cwd,{'a.js':hash('changed')}),/SOURCE_CONTEXT_CHANGED/);
});

test('UTF-8 context budget includes JSON framing and guidance; oversized source falls back without truncating',t=>{
  const cwd=temp(t),item=fixture();fs.writeFileSync(path.join(cwd,'a.js'),'한'.repeat(1100));
  const bounded=runner.buildPrompt(item,'inline',cwd,shared.snapshot(cwd));
  assert.equal(bounded.evidence.included,true);assert.ok(bounded.evidence.serializedContextBytes<=4096);
  assert.ok(Buffer.byteLength(bounded.prompt)<=8192);
  assert.ok(bounded.evidence.serializedContextBytes>bounded.evidence.sourceContextBytes);
  fs.writeFileSync(path.join(cwd,'a.js'),'한'.repeat(1400));
  const oversized=runner.buildPrompt(item,'inline',cwd,shared.snapshot(cwd));
  assert.equal(oversized.prompt,item.task);assert.equal(oversized.evidence.omissionReason,'PRODUCTION_CONTEXT_INELIGIBLE');
  assert.throws(()=>runner.buildPrompt({...item,task:'x'.repeat(8193)},'read',cwd,shared.snapshot(cwd)),/PROMPT_BUDGET_EXCEEDED/);
  const absent=runner.buildPrompt({...item,allowedFiles:['new.js']},'inline',cwd,{});
  assert.deepEqual(JSON.parse(absent.prompt.slice(item.task.length+1)).source_context.files,[{path:'new.js',sha256:null,state:'absent'}]);
});

async function simulate(t,arm,{firstOverrides={},firstSucceeds=false,maxTokens=100000}={}) {
  const cwd=temp(t),item={fixture:fixture(),arm,cwd,before:{'a.js':hash('broken')}};
  fs.writeFileSync(path.join(cwd,'a.js'),'broken');
  const run={order:1,caseId:'bounded',arm,repeat:1,attempts:[],accepted:false,finished:false},runs=[run],calls=[];
  await runner.executeFixture(item,run,{catalog,policy,now:()=>now,
    accounting:()=>routing.budgetState(runs,maxTokens,100),stop:()=>shared.stopReason(runs,maxTokens,now,now),
    onAttempt:async()=>{},execute:async(directory,prompt,files,route)=>{
      calls.push({prompt,files,model:route.model,effort:route.reasoning_effort});
      fs.writeFileSync(path.join(directory,'a.js'),calls.length===2||firstSucceeds?'fixed':'partial candidate');
      return runtime(route,prompt,calls.length===1?firstOverrides:{});
    }});
  return {item,run,runs,calls};
}

test('both arms use the same production escalation and feedback, with refreshed inline repair source',async t=>{
  const read=await simulate(t,'read'),inline=await simulate(t,'inline');
  for(const result of [read,inline]) {
    assert.equal(result.calls.length,2);assert.equal(result.run.accepted,true);assert.equal(result.run.finished,true);
    assert.deepEqual(result.calls.map(call=>call.model),['gpt-5.6-luna','gpt-5.6-terra']);
    assert.deepEqual(result.calls.map(call=>call.effort),['low','medium']);
    assert.equal(shared.sumUsage(result.run.attempts).input_output_tokens,220);
    assert.equal(result.run.attempts.every(attempt=>attempt.treatmentCompliant),true);
    assert.equal(result.run.attempts[1].initialFiles.sha256,result.run.attempts[0].afterFiles.sha256);
    assert.equal(result.run.attempts[1].selection.action,'ESCALATE');
  }
  assert.equal(inline.run.attempts[1].context.basePromptSha256,read.run.attempts[1].context.basePromptSha256);
  assert.match(read.calls[1].prompt,/testsPassed, oraclePassed, mutantChecksPassed/);
  assert.ok(!read.calls[1].prompt.includes('partial candidate'));assert.ok(!read.calls[1].prompt.includes('fixed'));
  assert.ok(inline.calls[1].prompt.includes('partial candidate'));assert.ok(!inline.calls[1].prompt.includes('broken'));
  assert.notEqual(inline.run.attempts[0].context.contextSha256,inline.run.attempts[1].context.contextSha256);
});

test('unknown usage and aggregate guard block retries, and first-pass success stops immediately',async t=>{
  const unknown=await simulate(t,'inline',{firstOverrides:{usage:{usage_status:'unknown',input_output_tokens:null}}});
  assert.equal(unknown.calls.length,1);assert.equal(shared.sumUsage(unknown.run.attempts).input_output_tokens,null);
  const bounded=await simulate(t,'read',{maxTokens:4000,firstOverrides:{usage:usage(4000)}});
  assert.equal(bounded.calls.length,1);assert.equal(bounded.run.stopReason,'AGGREGATE_TOKEN_GUARD');
  assert.equal(bounded.run.finished,false);
  const success=await simulate(t,'inline',{firstSucceeds:true});assert.equal(success.calls.length,1);
  assert.equal(success.run.accepted,true);
  const mismatch=await simulate(t,'read',{firstSucceeds:true,firstOverrides:{promptBytes:0}});
  assert.equal(mismatch.run.attempts[0].treatmentCompliant,false);
});

test('public fixture patches reproduce the final verified files independently and refuse overwrites',async t=>{
  const result=await simulate(t,'inline',{firstSucceeds:true}),cwd=result.item.cwd,artifacts=temp(t);
  fs.writeFileSync(path.join(cwd,'a.js'),'broken');
  shared.command('git',['init','--quiet'],cwd);shared.command('git',['add','--all'],cwd);
  shared.command('git',['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','-m','fixture'],cwd);
  result.item.initialHead=shared.command('git',['rev-parse','HEAD'],cwd).trim();
  fs.writeFileSync(path.join(cwd,'a.js'),'fixed');
  const artifact=runner.saveArtifact(result.item,result.run,artifacts);
  assert.equal(artifact.saved,true);assert.equal(artifact.accepted,true);
  assert.equal(path.basename(artifact.path),artifact.path);
  assert.equal(hash(fs.readFileSync(path.join(artifacts,artifact.path))),artifact.sha256);
  assert.deepEqual(artifact.finalFiles,{'a.js':hash('fixed')});
  assert.throws(()=>runner.saveArtifact(result.item,result.run,artifacts),/EEXIST/);
  shared.command('git',['reset','--hard','HEAD'],cwd);
  shared.command('git',['apply',path.join(artifacts,artifact.path)],cwd);
  assert.deepEqual(shared.snapshot(cwd),artifact.finalFiles);
  assert.equal(shared.qualityCheck(result.item.fixture,cwd,result.item.before).passed,true);
  fs.writeFileSync(path.join(cwd,'a.js'),'changed after grade');
  assert.throws(()=>runner.saveArtifact(result.item,result.run,artifacts),/ARTIFACT_SOURCE_CHANGED/);
  fs.writeFileSync(path.join(cwd,'a.js'),'fixed');
  shared.command('git',['add','--all'],cwd);
  shared.command('git',['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','-m','unauthorized candidate'],cwd);
  assert.deepEqual(runner.saveArtifact(result.item,result.run,artifacts),{saved:false,reason:'GIT_HISTORY_CHANGED_OR_UNBOUND'});
});

test('predeclared acceptance requires matched quality and lower complete observed tokens',()=>{
  const report={comparable:true,summary:{read:{accepted:1,totals:{input_output_tokens:200}},
    inline:{accepted:1,planned:1,totals:{input_output_tokens:100}}},runs:[{arm:'read',caseId:'x',repeat:1,accepted:true},
    {arm:'inline',caseId:'x',repeat:1,accepted:true}]};
  assert.equal(runner.assessment(report).status,'SAMPLE_CRITERIA_MET');
  assert.equal(runner.assessment(report).tokenReductionRatio,0.5);
  assert.equal(runner.assessment({...report,comparable:false}).status,'INCONCLUSIVE');
  assert.equal(runner.assessment({...report,comparable:false}).qualityPreserved,null);
  const vacuous=JSON.parse(JSON.stringify(report));
  vacuous.summary.read.accepted=0;vacuous.summary.inline.accepted=0;
  vacuous.runs.forEach(run=>run.accepted=false);
  assert.equal(runner.assessment(vacuous).status,'SAMPLE_CRITERIA_NOT_MET');
  report.runs[1].accepted=false;assert.equal(runner.assessment(report).status,'SAMPLE_CRITERIA_NOT_MET');
  report.runs[1].accepted=true;report.summary.inline.totals.input_output_tokens=200;
  assert.equal(runner.assessment(report).lowerObservedTotalTokens,false);
  const evidence=runner.sourceEvidence();assert.match(evidence.sha256,/^[a-f0-9]{64}$/);
  for(const filename of ['skills/start-task/scripts/session-context.js','skills/start-task/scripts/session-telemetry.js',
    'evals/token-efficiency/CONTEXT-EVAL.md'])assert.match(evidence.files[filename],/^[a-f0-9]{64}$/);
});
