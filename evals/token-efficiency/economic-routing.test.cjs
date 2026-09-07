'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {hash}=require('../../skills/start-task/scripts/model-routing-io.js');
const {resolveTaskRoute}=require('../../skills/start-task/scripts/task-router.js');
const {parseUsage}=require('../behavioral/adapters/provider-usage.cjs');
const policy=require('../../skills/start-task/scripts/model-routing-policy.json');
const shared=require('./run-economic-ab.js');
const runner=require('./run-routing-ab.js');
const now=Date.parse('2026-09-07T00:00:00.000Z');
const catalog={schema:'vulpora.runtime-model-catalog/v1',runtime:'codex',source:'synthetic:routing-eval-test',
  observedAt:new Date(now).toISOString(),models:Object.values(policy.runtimes.codex).flat()
    .map(id=>({id,reasoningEfforts:['low','medium','high']}))};
const usage=(input=100)=>parseUsage('codex',JSON.stringify({type:'turn.completed',usage:{input_tokens:input,
  cached_input_tokens:60,output_tokens:10}}));
function runtime(route,overrides={}) {
  return {exitCode:0,reason:null,unexpectedChild:false,usage:usage(),requestedModel:route.model,
    requestedEffort:route.reasoning_effort,dispatchEvidence:{source:'spawn-arguments',binary:'codex',
      model:route.model,reasoning_effort:route.reasoning_effort,commandSha256:'a'.repeat(64),
      primarySessions:1,nestedOrchestrator:false,backendIdentity:'NOT_ATTESTED'},...overrides};
}
function fixture(overrides={}) {
  return {id:'bounded',task:'Repair only a.js and run its tests.',routing:{taskType:'implementation',
    difficulty:'simple',risk:'low'},routingRationale:'One explicit pure conversion.',
    files:{'a.js':'broken'},allowedFiles:['a.js'],verify(cwd){
      const passed=fs.readFileSync(path.join(cwd,'a.js'),'utf8')==='fixed';
      return {testsPassed:passed,oraclePassed:passed,mutantChecksPassed:passed};
    },...overrides};
}
function failedAttempt(arm='routed') {
  const route=resolveTaskRoute(runner.routeRequest(fixture(),arm,100000),catalog,policy,now);
  return {number:1,route,runtime:runtime(route),accepted:false,quality:{passed:false,checks:{
    testsPassed:false,oraclePassed:false,mutantChecksPassed:false,verifierCompleted:true,
    onlyAllowedFilesChanged:true,noSymlinksOrSpecialFiles:true},checksTotal:6}};
}
const accounting={remainingTokens:100000,remainingRelativeUnits:100,unresolvedAttempts:0,overdrawn:false};

test('routing experiment is explicit, defaults to three fresh arms and caps repeats at two',()=>{
  assert.equal(runner.parseArgs([]),null);assert.equal(runner.parseArgs(['--help']),null);
  assert.throws(()=>runner.parseArgs(['--out','new.json']),/EXPLICIT_RUN_REQUIRED/);
  const base=['--run','--out','new.json'];
  assert.deepEqual(runner.parseArgs(base).arms,['baseline','luna','routed']);
  assert.equal(runner.parseArgs(base).repeats,1);
  assert.equal(runner.parseArgs(base).maxTokens,1200000);
  assert.equal(runner.LIMITS.maxAttempts,2);
  for(const extra of [['--repeats','3'],['--repeats','0'],['--max-tokens','5000001'],
    ['--arms','legacy'],['--arms','routed,routed'],['--run'],['--reuse','old.json'],['--legacy-root','/tmp/old']]) {
    assert.throws(()=>runner.parseArgs([...base,...extra]));
  }
});

test('declared fixture difficulty exercises Luna and Terra through the actual production router',()=>{
  const cases=runner.validateRoutingCases(require('./routing-fixtures.cjs').cases);
  const routed=Object.fromEntries(cases.map(item=>[item.id,resolveTaskRoute(
    runner.routeRequest(item,'routed',100000),catalog,policy,now)]));
  assert.equal(routed.positive.model,'gpt-5.6-luna');
  assert.equal(routed['query-encoding'].model,'gpt-5.6-luna');
  assert.equal(routed['lru-cache'].model,'gpt-5.6-terra');
  assert.equal(routed.retry.model,'gpt-5.6-terra');
  for(const item of cases)for(const arm of ['baseline','luna','routed']) {
    const route=resolveTaskRoute(runner.routeRequest(item,arm,100000),catalog,policy,now);
    assert.equal(route.taskSelection.difficulty,item.routing.difficulty);
    assert.match(route.evidence.taskRequestSha256,/^[a-f0-9]{64}$/);
    if(arm==='baseline'){assert.equal(route.model,'gpt-5.6-terra');assert.equal(route.reasoning_effort,'medium');}
    if(arm==='luna'){assert.equal(route.model,'gpt-5.6-luna');assert.equal(route.reasoning_effort,'low');}
  }
  assert.throws(()=>runner.validateRoutingCases([fixture({routing:{difficulty:'guess'}})]),/INVALID_ROUTING_FIXTURE/);
  assert.throws(()=>runner.validateRoutingCases([fixture({routingRationale:''})]),/INVALID_ROUTING_FIXTURE/);
});

test('optional dispatch changes the first primary CLI model while legacy defaults are identical',()=>{
  const old=shared.buildCodexArgs('/tmp/fixture');
  assert.deepEqual(old,shared.buildCodexArgs('/tmp/fixture',{model:'gpt-5.6-terra',reasoning_effort:'medium'}));
  const args=shared.buildCodexArgs('/tmp/fixture',{model:'gpt-5.6-luna',reasoning_effort:'low'});
  assert.ok(args.includes('gpt-5.6-luna'));assert.ok(args.includes('model_reasoning_effort="low"'));
  for(const flag of ['--ephemeral','--strict-config','multi_agent','multi_agent_v2','web_search="disabled"'])assert.ok(args.includes(flag));
  assert.equal(args[0],'exec');assert.equal(args.at(-1),'-');
  assert.throws(()=>shared.buildCodexArgs('/tmp/fixture',{model:'luna\n-c secret',reasoning_effort:'low'}),/INVALID_DISPATCH_ROUTE/);
});

test('only deterministic model quality failure escalates, and fixed arms retry the same model',()=>{
  for(const arm of ['baseline','luna','routed']) {
    const first=failedAttempt(arm),decision=runner.selectRetry(fixture(),arm,[first],catalog,policy,accounting,now);
    assert.equal(decision.action,arm==='routed'?'ESCALATE':'RETRY_SAME_MODEL');
    assert.equal(decision.route.model,arm==='luna'?'gpt-5.6-luna':'gpt-5.6-terra');
    if(arm==='routed')assert.match(decision.route.evidence.escalationRequestSha256,/^[a-f0-9]{64}$/);
  }
  for(const change of [item=>item.accepted=true,item=>item.runtime.reason='TIME_LIMIT',
    item=>item.runtime.unexpectedChild=true,item=>item.runtime.usage.usage_status='unknown',
    item=>item.quality.checks.verifierCompleted=false,item=>item.quality.checks.onlyAllowedFilesChanged=false]) {
    const first=failedAttempt();change(first);
    assert.equal(runner.selectRetry(fixture(),'routed',[first],catalog,policy,accounting,now).action,'STOP');
  }
  assert.equal(runner.selectRetry(fixture(),'routed',[failedAttempt(),failedAttempt()],catalog,policy,accounting,now).reason,'ATTEMPT_CAP_REACHED');
  assert.equal(runner.selectRetry(fixture(),'routed',[failedAttempt()],catalog,policy,{...accounting,remainingTokens:3999},now).reason,'BUDGET_EXCEEDED');
});

test('provider usage adaptation preserves unknown and rejects counters without final event provenance',()=>{
  assert.deepEqual(runner.observedUsage(usage()),{source:'codex-jsonl:turn.completed',inputTokens:100,
    outputTokens:10,cachedInputTokens:60,reasoningTokens:null});
  for(const change of [{usage_status:'unknown'},{runtime:'claude'},{source_event:'delta'}]) {
    assert.equal(runner.observedUsage({...usage(),...change}),null);
  }
  const first=failedAttempt();first.runtime.usage.source_event='delta';
  assert.equal(runner.selectRetry(fixture(),'routed',[first],catalog,policy,accounting,now).reason,'USAGE_UNKNOWN');
});

test('dispatch comparison requires exact route, effort, primary launch evidence and no nested orchestrator',()=>{
  const first=failedAttempt();assert.equal(runner.dispatchMatches(first.route,first.runtime),true);
  for(const changed of [{requestedModel:'gpt-5.6-terra'},{requestedEffort:'medium'},
    {dispatchEvidence:{...first.runtime.dispatchEvidence,nestedOrchestrator:true}},
    {dispatchEvidence:{...first.runtime.dispatchEvidence,commandSha256:'missing'}},
    {dispatchEvidence:{...first.runtime.dispatchEvidence,model:'gpt-5.6-terra'}}]) {
    assert.equal(runner.dispatchMatches(first.route,{...first.runtime,...changed}),false);
  }
});

async function simulate(t,arm,{firstOverrides={},maxTokens=100000,firstSucceeds=false}={}) {
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'routing-eval-offline-'));
  t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
  const item={fixture:fixture(),arm,cwd,before:{'a.js':hash('broken')}};
  fs.writeFileSync(path.join(cwd,'a.js'),'broken');
  const run={arm,attempts:[],accepted:false,finished:false},runs=[run],calls=[];
  await runner.executeFixture(item,run,{catalog,policy,now:()=>now,
    accounting:()=>runner.budgetState(runs,maxTokens,100),
    stop:()=>shared.stopReason(runs,maxTokens,now,now),onAttempt:async()=>{},
    execute:async(directory,prompt,files,route)=>{
      calls.push({prompt,files,model:route.model,effort:route.reasoning_effort});
      if(calls.length===2||firstSucceeds)fs.writeFileSync(path.join(directory,'a.js'),'fixed');
      return runtime(route,calls.length===1?firstOverrides:{});
    }});
  return {run,runs,calls};
}

test('offline execution loop gives every arm identical repair feedback and charges both attempts',async t=>{
  const outcomes=[];
  for(const arm of ['baseline','luna','routed']) {
    const result=await simulate(t,arm);outcomes.push(result);
    assert.equal(result.calls.length,2);assert.equal(result.run.accepted,true);assert.equal(result.run.finished,true);
    assert.equal(result.run.attempts[0].accepted,false);
    assert.equal(result.run.attempts[1].initialFiles.sha256,result.run.attempts[0].afterFiles.sha256);
    assert.notEqual(result.run.attempts[1].initialFiles.sha256,result.run.attempts[1].afterFiles.sha256);
    assert.equal(shared.sumUsage(result.run.attempts).input_output_tokens,220);
    assert.equal(shared.aggregate(result.runs,[arm],1)[arm].tokensPerAccepted,220);
    assert.equal(result.run.attempts.every(item=>item.treatmentCompliant),true);
  }
  assert.deepEqual(outcomes.map(result=>result.calls.map(call=>call.model)),[
    ['gpt-5.6-terra','gpt-5.6-terra'],['gpt-5.6-luna','gpt-5.6-luna'],['gpt-5.6-luna','gpt-5.6-terra']]);
  assert.equal(new Set(outcomes.map(result=>result.calls[0].prompt)).size,1);
  assert.equal(new Set(outcomes.map(result=>result.calls[1].prompt)).size,1);
  assert.match(outcomes[0].calls[1].prompt,/testsPassed, oraclePassed, mutantChecksPassed/);
  assert.ok(!outcomes[0].calls[1].prompt.includes('fixed'));
});

test('unknown usage and token guards prevent another launch; successful first pass needs no retry',async t=>{
  const unknown=await simulate(t,'routed',{firstOverrides:{usage:{usage_status:'unknown',input_output_tokens:null}}});
  assert.equal(unknown.calls.length,1);assert.equal(shared.sumUsage(unknown.run.attempts).input_output_tokens,null);
  assert.equal(shared.stopReason(unknown.runs,100000,now,now),'USAGE_UNAVAILABLE');
  const bounded=await simulate(t,'routed',{maxTokens:4000,firstOverrides:{usage:usage(4000)}});
  assert.equal(bounded.calls.length,1);assert.equal(bounded.run.stopReason,'AGGREGATE_TOKEN_GUARD');
  assert.equal(bounded.run.finished,false);
  const success=await simulate(t,'routed',{firstSucceeds:true});
  assert.equal(success.calls.length,1);assert.equal(success.run.accepted,true);
});

test('shared budget includes failed attempts, repairs, and unresolved usage without assuming zero cost',()=>{
  const first=failedAttempt(),second=failedAttempt('baseline');
  const result=runner.budgetState([{attempts:[first,second]}],200,40);
  assert.deepEqual(result,{remainingTokens:0,remainingRelativeUnits:29,unresolvedAttempts:0,overdrawn:true});
  second.runtime.usage={usage_status:'unknown',input_output_tokens:null};
  assert.equal(runner.budgetState([{attempts:[first,second]}],200,40).unresolvedAttempts,1);
});
