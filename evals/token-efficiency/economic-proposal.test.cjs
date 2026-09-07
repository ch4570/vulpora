'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const runner=require('./run-proposal-ab.js'),shared=require('./run-economic-ab.js'),routing=require('./run-routing-ab.js');
const {hash}=require('../../skills/start-task/scripts/model-routing-io.js');
const {resolveTaskRoute}=require('../../skills/start-task/scripts/task-router.js');
const policy=require('../../skills/start-task/scripts/model-routing-policy.json');
const now=Date.parse('2026-09-07T00:00:00Z');
const catalog={schema:'vulpora.runtime-model-catalog/v1',runtime:'codex',source:'synthetic:proposal-test',
  observedAt:new Date(now).toISOString(),models:Object.values(policy.runtimes.codex).flat().map(id=>({id,reasoningEfforts:['low','medium','high']}))};
function result(route,changes={}) {
  return {status:'candidate',execution:'EXIT_ZERO',verification:'NOT_VERIFIED',mutationState:'known_effect',
    scopedFilesChanged:['a.js'],requestedRoute:{model:route.model,reasoning_effort:route.reasoning_effort},
    budget:{committedTokens:110,remainingTokens:10000,unresolvedAttempts:0},runtime:{exitCode:0,closeObserved:true,reason:null,
      promptBytes:100,usage:{source:'codex-jsonl:turn.completed',inputTokens:100,cachedInputTokens:60,outputTokens:10,reasoningTokens:3},
      telemetry:{itemCompleted:{commandExecutions:0}},dispatchEvidence:{source:'spawn-arguments',binary:'codex',
        model:route.model,reasoning_effort:route.reasoning_effort,commandSha256:'a'.repeat(64),primarySessions:1,nestedOrchestrator:false},...changes}};
}
test('production experiment keeps both arms and explicit bounded live admission',()=>{
  assert.equal(runner.parseArgs([]),null);assert.equal(runner.parseArgs(['--help']),null);
  assert.throws(()=>runner.parseArgs(['--out','x']),/EXPLICIT_RUN_REQUIRED/);
  const opts=runner.parseArgs(['--run','--out','new.json']);
  assert.deepEqual(opts.arms,['agent','proposal']);assert.equal(opts.repeats,2);assert.equal(opts.maxTokens,500000);
  assert.throws(()=>runner.parseArgs(['--run','--out','new.json','--arms','proposal']),/FIXED_CONTEXT_ARMS/);
});
test('adapter retains measured totals without counting reasoning/cache twice or trusting failed invocations',()=>{
  const source=result({model:'gpt-5.6-luna',reasoning_effort:'low'}),runtime=runner.normalizeRuntime(source);
  assert.equal(runtime.usage.input_output_tokens,110);assert.equal(runtime.usage.reasoning_tokens,3);
  assert.equal(runtime.usage.cached_input_tokens,60);assert.equal(runtime.requestedModel,'gpt-5.6-luna');
  source.runtime.usage.cachedInputTokens=null;
  assert.equal(runner.normalizeRuntime(source).usage.input_output_tokens,110);
  assert.equal(runner.normalizeRuntime(source).usage.cached_input_tokens,null);
  source.runtime.exitCode=1;assert.equal(runner.normalizeRuntime(source).usage.usage_status,'unknown');
  source.runtime.exitCode=0;source.runtime.usage.source='model-text';
  assert.equal(runner.normalizeRuntime(source).usage.usage_status,'unknown');
});
async function simulation(t,{commit=false,unobserved=false}={}) {
  const cwd=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'proposal-loop-test-')));
  t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));fs.writeFileSync(path.join(cwd,'a.js'),'broken');
  shared.command('git',['init','--quiet'],cwd);shared.command('git',['add','--all'],cwd);
  shared.command('git',['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','-m','fixture'],cwd);
  const fixture={id:'bounded',task:'Repair a.js',files:{'a.js':'broken'},allowedFiles:['a.js'],
    routing:{taskType:'implementation',difficulty:'simple',risk:'low'},verify(){const ok=fs.readFileSync(path.join(cwd,'a.js'),'utf8')==='fixed';return {testsPassed:ok,oraclePassed:ok,mutantChecksPassed:ok};}};
  const route=resolveTaskRoute(routing.routeRequest(fixture,'routed',10000),catalog,policy,now);
  const item={fixture,cwd,arm:'proposal',repeat:1,before:{'a.js':hash('broken')},initialRoute:route,
    initialHead:shared.command('git',['rev-parse','HEAD'],cwd).trim(),prepared:{route,capsulePath:'/unused-test-capsule',evidence:{promptBytes:100}}};
  const run={attempts:[],accepted:false,finished:false};let calls=0;
  await runner.executeFixture(item,run,{catalog,policy,now:()=>now,stop:()=>null,onAttempt:async()=>{},
    accounting:()=>({remainingTokens:10000,remainingRelativeUnits:100,unresolvedAttempts:0,overdrawn:false}),
    launch:async()=>{calls++;fs.writeFileSync(path.join(cwd,'a.js'),'fixed');
      if(commit){shared.command('git',['add','--all'],cwd);shared.command('git',['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','-m','forbidden'],cwd);}
      return result(route,unobserved?{usage:{source:'unavailable'}}:{});}});
  return {run,calls};
}
test('coordinator uses actual files and original HEAD, without accepting a model claim alone',async t=>{
  const good=await simulation(t);assert.equal(good.run.accepted,true);assert.equal(good.calls,1);
  assert.equal(good.run.attempts[0].treatmentCompliant,true);assert.equal(good.run.attempts[0].transport.verification,'NOT_VERIFIED');
  const committed=await simulation(t,{commit:true});assert.equal(committed.run.accepted,false);assert.equal(committed.calls,1);
  assert.equal(committed.run.attempts[0].quality.checks.gitHeadUnchanged,false);
  assert.equal(committed.run.attempts[0].treatmentCompliant,false);
  const unknown=await simulation(t,{unobserved:true});assert.equal(unknown.calls,1);
  assert.equal(unknown.run.attempts[0].runtime.usage.usage_status,'unknown');
});
test('proposal assessment cannot win on fewer tokens with a failed or missing candidate',()=>{
  const report={comparable:true,summary:{agent:{accepted:1,planned:1,totals:{input_output_tokens:200}},
    proposal:{accepted:1,planned:1,totals:{input_output_tokens:100}}},runs:[{arm:'agent',caseId:'x',repeat:1,accepted:true},
      {arm:'proposal',caseId:'x',repeat:1,accepted:true}]};
  assert.equal(runner.assessment(report).status,'SAMPLE_CRITERIA_MET');
  assert.equal(runner.assessment({...report,comparable:false}).status,'INCONCLUSIVE');
  report.runs[1].accepted=false;assert.equal(runner.assessment(report).status,'SAMPLE_CRITERIA_NOT_MET');
  const evidence=runner.sourceEvidence();assert.match(evidence.files['skills/start-task/scripts/session-runner.js'],/^[a-f0-9]{64}$/);
});
