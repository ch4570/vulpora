'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {parseArgs,validateCases,qualityCheck,feedback,sequence,buildCodexArgs,evidenceFromEvents,
  compliant,sumUsage,aggregate,stopReason,LIMITS}=require('./run-economic-ab.js');

const observed=(input=100,cache=60,output=10)=>({usage_status:'observed',input_tokens:input,
  cached_input_tokens:cache,uncached_input_tokens:input-cache,output_tokens:output,input_output_tokens:input+output});
const attempt=(accepted,input=100)=>({number:1,accepted,treatmentCompliant:true,
  runtime:{usage:observed(input),exitCode:0,reason:null,unexpectedChild:false}});
const event=(command,output,exitCode=0)=>({type:'item.completed',item:{type:'command_execution',
  command,aggregated_output:output,exit_code:exitCode}});
const decision=profile=>JSON.stringify({schema:'vulpora.start-task-profile-decision/v1',profile,
  rationale:{signal:'scoped'},references:['nested']});

test('live execution is explicit and arguments reject unsupported or ambiguous values',()=>{
  assert.equal(parseArgs([]),null);
  assert.equal(parseArgs(['--help']),null);
  assert.throws(()=>parseArgs(['--out','x.json']),/EXPLICIT_RUN_REQUIRED/);
  const base=['--run','--out','new.json','--legacy-root','/tmp/legacy'];
  assert.equal(parseArgs(base).repeats,2);
  assert.equal(parseArgs(base).maxTokens,2000000);
  assert.deepEqual(parseArgs([...base,'--arms','optimized,baseline','--cases','positive,retry']).arms,['optimized','baseline']);
  for(const extra of [['--repeats','4'],['--repeats','0'],['--max-tokens','5000001'],
    ['--arms','baseline,baseline'],['--arms','unknown'],['--run'],['--network']]) {
    assert.throws(()=>parseArgs([...base,...extra]));
  }
  assert.throws(()=>parseArgs(['--run','--out','new.json','--legacy-root','relative']),/ABSOLUTE/);
});

test('fixture paths cannot escape the workspace or overwrite runtime configuration',()=>{
  const fixture={id:'valid',task:'Task',files:{'src/a.js':'x'},allowedFiles:['src/a.js'],verify(){}};
  assert.equal(validateCases([fixture],[])[0],fixture);
  for(const filename of ['../escape','/tmp/escape','.git/config','.agents/skills/x','src//x','src/./x']) {
    assert.throws(()=>validateCases([{...fixture,files:{[filename]:'x'}}],[]),/INVALID_FIXTURE_FILE/);
  }
  assert.throws(()=>validateCases([fixture],['missing']),/UNKNOWN_CASE/);
});

test('three cases and two repeats cover each of the six arm permutations',()=>{
  const cases=[{id:'positive'},{id:'lru-cache'},{id:'retry'}];
  const runs=sequence(cases,['baseline','legacy','optimized'],2);
  assert.equal(runs.length,18);
  const blocks=[];
  for(let index=0;index<runs.length;index+=3) blocks.push(runs.slice(index,index+3).map(run=>run.arm).join(','));
  assert.equal(new Set(blocks).size,6);
  for(const fixture of cases)for(const arm of ['baseline','legacy','optimized']) {
    assert.equal(runs.filter(run=>run.fixture.id===fixture.id&&run.arm===arm).length,2);
  }
  assert.equal(runs[9].fixture.id,'retry');
});

test('Codex dispatch fixes model, effort, isolation, and child restrictions',()=>{
  const args=buildCodexArgs('/tmp/fixture');
  for(const flag of ['exec','--ephemeral','--strict-config','--json','workspace-write',
    'gpt-5.6-terra','model_reasoning_effort="medium"','multi_agent','multi_agent_v2','web_search="disabled"']) {
    assert.ok(args.includes(flag),flag);
  }
  assert.equal(args.at(-1),'-');
  assert.ok(!args.includes('--dangerously-bypass-approvals-and-sandbox'));
});

test('command metadata accepts nested selector JSON followed by command output without retaining secrets',()=>{
  const secret='SECRET_MUST_NOT_BE_RETAINED';
  const events=[event('/bin/zsh -lc "cat /private/user/.agents/skills/start-task/SKILL.md"','# Start Task\nEntry'),
    event(`node '/private/user/.agents/skills/start-task/scripts/select-execution-profile.js' <<'JSON'\n${secret}\nJSON`,
      `before\n${decision('lightweight')}\nafter\n${secret}`)];
  const evidence=evidenceFromEvents(events,['src/a.js']);
  assert.equal(evidence.harnessEvidence.entryRead,true);
  assert.deepEqual(evidence.harnessEvidence.selectorProfiles,['lightweight']);
  assert.equal(compliant('optimized',{startTaskEntryInjected:false},evidence),true);
  assert.equal(compliant('legacy',{startTaskEntryInjected:false},evidence),false);
  assert.ok(!JSON.stringify(evidence).includes(secret));
  assert.ok(!JSON.stringify(evidence).includes('/private/user'));
  assert.equal(evidence.commandEvidence[1].commandSha256.length,64);
});

test('legacy and standard treatment require reference evidence; fabricated/failed selector output is rejected',()=>{
  const old=evidenceFromEvents([
    event('cat start-task/SKILL.md','# Start Task — choose the lightest safe execution path'),
    event('cat reference/kb/lightweight-path.md','# Lightweight and standard path'),
    event('node select-execution-profile.js',decision('standard'))],[]);
  assert.equal(compliant('legacy',{},old),true);
  assert.equal(compliant('optimized',{},old),true);
  const absent=evidenceFromEvents([event('echo anything',decision('lightweight')),
    event('node select-execution-profile.js',decision('lightweight'),1)],[]);
  assert.equal(absent.harnessEvidence.selectorExecuted,false);
  const standard=evidenceFromEvents([event('node select-execution-profile.js',decision('standard'))],[]);
  assert.equal(compliant('optimized',{startTaskEntryInjected:true},standard),false);
  assert.equal(evidenceFromEvents([event('codex exec -m gpt-5.6-terra task','')],[]).unexpectedChild,true);
  assert.equal(evidenceFromEvents([{type:'item.completed',item:{type:'collab_agent_tool_call'}}],[]).unexpectedChild,true);
  const mentions=evidenceFromEvents([event('ls start-task/SKILL.md reference/kb/lightweight-path.md',
    'start-task/SKILL.md\nreference/kb/lightweight-path.md')],[]);
  assert.equal(mentions.harnessEvidence.entryRead,false);
  assert.equal(mentions.harnessEvidence.lightweightPathRead,false);
});

test('all attempts, including failed quality and unsuccessful tasks, are charged',()=>{
  const first=attempt(false,100), repair={...attempt(true,200),number:2};
  const failure=attempt(false,300);
  const runs=[{arm:'optimized',accepted:true,finished:true,attempts:[first,repair]},
    {arm:'optimized',accepted:false,finished:true,attempts:[failure]}];
  const result=aggregate(runs,['optimized'],2).optimized;
  assert.deepEqual(sumUsage([first,repair,failure]),{input_tokens:600,cached_input_tokens:180,
    uncached_input_tokens:420,output_tokens:30,input_output_tokens:630});
  assert.equal(result.tokensPerAccepted,630);
  assert.equal(result.meanTokensPerTask,315);
  assert.equal(result.eventualPassRate,0.5);
  assert.equal(result.firstPassRate,0);
  assert.equal(result.attempts,3);
  assert.equal(result.repairs,1);
  assert.equal(result.complete,true);
  assert.equal(aggregate([{arm:'baseline',accepted:false,finished:true,attempts:[failure]}],['baseline'],1).baseline.tokensPerAccepted,null);
});

test('unknown usage remains unknown and blocks subsequent launches; guards include repairs',()=>{
  const unknown={...attempt(false),runtime:{usage:{usage_status:'unknown',input_output_tokens:null}}};
  const runs=[{arm:'baseline',attempts:[attempt(false),unknown],accepted:false,finished:false}];
  assert.equal(sumUsage(runs[0].attempts).input_output_tokens,null);
  assert.equal(stopReason(runs,1000,0,100),'USAGE_UNAVAILABLE');
  assert.equal(aggregate(runs,['baseline'],1).baseline.observedTokensLowerBound,110);
  const charged=[{attempts:[attempt(false),{...attempt(true),number:2}]}];
  assert.equal(stopReason(charged,220,0,100),'AGGREGATE_TOKEN_GUARD');
  assert.equal(stopReason(charged,221,0,100),null);
  assert.equal(stopReason(charged,1000,0,LIMITS.suiteMs),'SUITE_TIME_LIMIT');
});

test('scope checks are independent of fixture assertions and repair feedback contains no hidden output',()=>{
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'economic-runner-test-'));
  try {
    fs.writeFileSync(path.join(cwd,'allowed.js'),'before');
    const before={'allowed.js':createHash('sha256').update('before').digest('hex')};
    const fixture={allowedFiles:['allowed.js'],verify:()=>({testsPassed:true,oraclePassed:true,mutantChecksPassed:true})};
    fs.writeFileSync(path.join(cwd,'allowed.js'),'after');
    assert.equal(qualityCheck(fixture,cwd,before).passed,true);
    fs.writeFileSync(path.join(cwd,'forbidden.js'),'anything');
    const quality=qualityCheck(fixture,cwd,before);
    assert.equal(quality.passed,false);
    assert.equal(quality.checks.onlyAllowedFilesChanged,false);
    const message=feedback(quality);
    assert.match(message,/onlyAllowedFilesChanged/);
    assert.ok(!message.includes('forbidden.js'));
    fs.symlinkSync('/tmp',path.join(cwd,'link'));
    assert.equal(qualityCheck(fixture,cwd,before).checks.noSymlinksOrSpecialFiles,false);
  } finally {fs.rmSync(cwd,{recursive:true,force:true});}
});
