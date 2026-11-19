'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const runner=require('./run-workflow-ab.js');
const usage=(input=100)=>({usage_status:'observed',input_tokens:input,cached_input_tokens:50,
  output_tokens:10,uncached_input_tokens:input-50,input_output_tokens:input+10});
const runtime=(input=100)=>({usage:usage(input),exitCode:0,reason:null,unexpectedChild:false,elapsedMs:1,
  requestedModel:runner.ROUTE.model,requestedEffort:runner.ROUTE.reasoning_effort,dispatchEvidence:{...runner.ROUTE},
  harnessEvidence:{entryRead:false,selectorExecuted:false,lightweightPathRead:false,selectorProfiles:[]}});
const attempt=(accepted=true,input=100)=>({number:1,accepted,treatmentCompliant:true,runtime:runtime(input)});
const run=(arm,order,accepted=true)=>({arm,order,caseId:'test',repeat:1,finished:true,accepted,attempts:[attempt(accepted)]});

test('pilot has explicit opt-in, immutable arms, model, effort, caps and balanced order',()=>{
  assert.equal(runner.parseArgs([]),null);assert.equal(runner.parseArgs(['--help']),null);
  assert.ok(runner.parseArgs(['--run','--out','new.json']).output.endsWith('new.json'));
  for(const args of [['--out','x'],['--run','--out','x','--model','cheap'],['--run','--out','--run']])assert.throws(()=>runner.parseArgs(args));
  const plan=runner.sequence([{id:'bug'},{id:'tests'},{id:'review'}]);
  assert.equal(plan.length,9);
  for(const arm of runner.ARMS)assert.deepEqual(plan.flatMap((item,index)=>item.arm===arm?[index%3]:[]).sort(),[0,1,2]);
  assert.equal(runner.ROUTE.model,'gpt-5.6-terra');assert.equal(runner.ROUTE.reasoning_effort,'medium');
  assert.equal(runner.LIMITS.attemptsPerTask,2);
});
test('same acceptance task in every prompt; repair reveals gate names only',()=>{
  const fixture={task:'The identical task and acceptance.'};
  for(const arm of runner.ARMS)assert.ok(runner.buildPrompt(fixture,arm).endsWith(fixture.task));
  assert.ok(runner.buildPrompt(fixture,'installed').startsWith('$start-task'));
  assert.ok(runner.buildPrompt(fixture,'concise').includes(runner.BRIEF));
  const repair=runner.buildPrompt(fixture,'baseline',{checks:{oraclePassed:false},checksTotal:1,secret:'HIDDEN'});
  assert.ok(repair.includes('oraclePassed'));assert.ok(!repair.includes('HIDDEN'));
});
test('unexpected child is an expected missing invocation, never a zero-cost child',()=>{
  const current=run('baseline',1);current.attempts[0].runtime.unexpectedChild=true;
  const totals=runner.costs([current]);
  assert.equal(totals.totalTokens,null);assert.equal(totals.unknownInvocationIds.length,1);
  assert.equal(runner.stopReason([current],0,1),'UNEXPECTED_CHILD');
});
test('unknown usage, time, aggregate tokens and scenario guard stop later launches',()=>{
  const current=run('baseline',1);current.attempts[0].runtime.usage={usage_status:'unknown'};
  assert.equal(runner.stopReason([current],0,1),'USAGE_UNAVAILABLE');
  assert.equal(runner.stopReason([],0,runner.LIMITS.suiteMs),'WORKFLOW_SUITE_TIME_LIMIT');
  current.attempts[0]=attempt(false,runner.LIMITS.aggregateTokens);
  assert.equal(runner.stopReason([current],0,1),'AGGREGATE_TOKEN_GUARD');
  current.attempts[0].runtime.usage={usage_status:'observed',input_tokens:100,cached_input_tokens:0,output_tokens:500000,input_output_tokens:500100};
  assert.equal(runner.stopReason([current],0,1),'SCENARIO_SPEND_GUARD');
});
test('missing usage subset or treatment makes complete pilot inconclusive; no pilot changes defaults',()=>{
  const runs=runner.ARMS.map((arm,index)=>run(arm,index+1));
  const report={runs,plan:runs.map(({arm,order,caseId,repeat})=>({arm,order,caseId,repeat}))};
  assert.equal(runner.assess(report).status,'PILOT_ONLY');
  assert.equal(runner.assess(report).globalDefaultChange,false);
  runs[1].attempts[0].runtime.usage.cached_input_tokens=null;
  assert.equal(runner.assess(report).comparable,false);
  runs[1].attempts[0]=attempt();runs[2].attempts[0].treatmentCompliant=false;
  assert.equal(runner.assess(report).status,'INCONCLUSIVE');
  runs[2].attempts[0]=attempt();runs[2].caseId='different';
  assert.equal(runner.assess(report).complete,false);
});
test('missing planned tasks remain incomplete, including arms not started',()=>{
  const runs=runner.ARMS.map((arm,index)=>run(arm,index+1));
  const result=runner.assess({runs:runs.slice(0,1),plan:runs});
  assert.equal(result.totals.concise.unstartedRuns,1);assert.equal(result.totals.concise.complete,false);
  assert.equal(result.totals.concise.tokensPerAcceptedTask,null);
});
test('quality loss or overlapping cost ranges hold sample criteria and global defaults',()=>{
  const runs=runner.ARMS.map((arm,index)=>run(arm,index+1));
  const report={runs,plan:runs.map(({arm,order,caseId,repeat})=>({arm,order,caseId,repeat}))};
  let result=runner.assess(report);
  assert.equal(result.comparisons.conciseVsBaseline.costRanges.standard.strictlyLower,false);
  assert.equal(result.comparisons.conciseVsBaseline.sampleCriteriaMet,false);
  runs[1].accepted=false;runs[1].attempts[0].accepted=false;
  result=runner.assess(report);
  assert.equal(result.comparisons.conciseVsBaseline.qualityPreserved,false);
  assert.equal(result.globalDefaultChange,false);
});
test('missing newly allowed output still saves empty patch and permits repair',()=>{
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-workflow-missing-output-'));
  const shared=require('./run-economic-ab.js');
  shared.command('git',['init','--quiet'],cwd);
  shared.command('git',['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','--allow-empty','-m','Freeze review input'],cwd);
  const head=shared.command('git',['rev-parse','HEAD'],cwd).trim();
  const artifactDir=fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-workflow-missing-artifact-'));
  const current={number:1,quality:{checks:{onlyAllowedFilesChanged:true,noSymlinksOrSpecialFiles:true,gitHeadUnchanged:true}}};
  const result=runner.artifact(cwd,{allowedFiles:['findings.json']},head,artifactDir,{order:1,caseId:'review',arm:'baseline'},current);
  assert.equal(result.saved,true);assert.equal(result.bytes,0);
});
test('control activation or dispatch mismatch invalidates treatment; failures cannot be repaired outside scope',()=>{
  const value=runtime();assert.equal(runner.treatment('baseline',{},value),true);
  value.harnessEvidence.entryRead=true;assert.equal(runner.treatment('concise',{},value),false);
  value.harnessEvidence.selectorExecuted=true;value.harnessEvidence.selectorProfiles=['lightweight'];
  assert.equal(runner.treatment('installed',{},value),true);
  value.requestedModel='other';assert.equal(runner.treatment('installed',{},value),false);
  const checks={verifierCompleted:true,onlyAllowedFilesChanged:true,noSymlinksOrSpecialFiles:true,gitHeadUnchanged:true};
  assert.equal(runner.repairable(runtime(),{checks}),true);
  for(const key of Object.keys(checks))assert.equal(runner.repairable(runtime(),{checks:{...checks,[key]:false}}),false);
});
test('offline end-to-end runner retains failed first attempt and repair patches and blocks unknown next calls',async t=>{
  const shared=require('./run-economic-ab.js'),command=shared.command;
  // Runtime identity is fixture metadata here; this offline test must not need a CLI installation.
  shared.command=(binary,args,...rest)=>{
    if(binary!=='codex')return command(binary,args,...rest);
    assert.deepEqual(args,['--version']);
    return 'codex offline-test-fixture\n';
  };
  t.after(()=>{shared.command=command;});
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-workflow-runner-test-'));
  const fixtures=Array.from({length:3},(_,index)=>({id:`case-${index}`,task:'Write correct to result.txt.',
    files:{'result.txt':'initial'},allowedFiles:['result.txt'],verify(cwd){
      const okay=fs.readFileSync(path.join(cwd,'result.txt'),'utf8')==='correct';
      return {testsPassed:okay,oraclePassed:okay,mutantChecksPassed:okay};}}));
  const execute=async(cwd,prompt)=>{
    calls++;
    if(calls===1){fs.writeFileSync(path.join(cwd,'result.txt'),'wrong');return runtime();}
    if(calls===3)return {...runtime(),usage:{usage_status:'unknown',input_output_tokens:null}};
    fs.writeFileSync(path.join(cwd,'result.txt'),'correct');return runtime();
  };
  let calls=0;
  const output=path.join(directory,'pilot.json');
  await runner.main(['--run','--out',output],{fixtures,execute,install(){},
    collectCatalog:async()=>({models:[{id:runner.ROUTE.model,reasoningEfforts:['medium']}]}),
    preflight:()=>({skillIds:['start-task'],projectSkillIds:['start-task'],startTaskEntryInjected:false})});
  const report=JSON.parse(fs.readFileSync(output,'utf8'));
  assert.equal(report.runtime,'codex offline-test-fixture');
  assert.equal(calls,3);assert.equal(report.stopped,'USAGE_UNAVAILABLE');
  assert.equal(report.runs[0].attempts.length,2);assert.equal(report.runs[0].accepted,true);
  assert.equal(report.accounting.totalTokens,null);assert.equal(report.accounting.observedSubtotalTokens,220);
  assert.equal(report.assessment.comparable,false);
  const patches=report.runs[0].attempts.map(item=>fs.readFileSync(path.join(directory,report.artifactsDirectory,item.artifact.path),'utf8'));
  assert.ok(patches[0].includes('+wrong'));assert.ok(patches[1].includes('+correct'));
  await assert.rejects(()=>runner.main(['--run','--out',output]),/ALREADY_EXIST/);
});
