#!/usr/bin/env node
'use strict';

// Explicit live experiment. Importing this module and its offline tests never
// launches Codex. Raw prompts, runtime output, and final messages are not saved.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {canonical, hash} = require('../../skills/start-task/scripts/model-routing-io.js');
const {collectCodexModelCatalog} = require('../../skills/start-task/scripts/codex-model-catalog.js');
const {parseUsage, parseEvents} = require('../behavioral/adapters/provider-usage.cjs');
const {createTelemetry} = require('../../skills/start-task/scripts/session-telemetry.js');
const ROOT = path.resolve(__dirname, '../..');
const ARMS = ['baseline', 'legacy', 'optimized'];
const MODEL = 'gpt-5.6-terra';
const EFFORT = 'medium';
const LIMITS = Object.freeze({attemptMs:180000, suiteMs:3600000, stdoutBytes:8*1024*1024,
  stderrBytes:1024*1024, maxAttempts:2, maxRepeats:3, defaultTokens:2000000, maxTokens:5000000});
const COMMON_CONFIG = ['-c','approval_policy="never"','-c','web_search="disabled"',
  '-c','tool_output_token_limit=2000','--disable','multi_agent','--disable','multi_agent_v2'];
const TOKEN_KEYS = ['input_tokens','cached_input_tokens','uncached_input_tokens','output_tokens','input_output_tokens'];
const HELP = 'Live calls: node evals/token-efficiency/run-economic-ab.js --run --out <new.json> '
  + '--legacy-root <absolute frozen checkout> [--repeats 1..3] [--cases id,id] '
  + '[--arms baseline,legacy,optimized] [--max-tokens 2000000]\n';

function fail(code) { throw new Error(code); }
function command(binary, args, cwd, options = {}) {
  const result = spawnSync(binary, args, {cwd, encoding:'utf8', timeout:30000,
    killSignal:'SIGKILL', maxBuffer:4*1024*1024, ...options});
  if (result.error || result.status !== 0) fail(`COMMAND_FAILED:${path.basename(binary)}:${result.status}`);
  return result.stdout;
}
function parseArgs(args) {
  if (!args.length || (args.length===1 && args[0]==='--help')) return null;
  if (!args.includes('--run')) fail('EXPLICIT_RUN_REQUIRED');
  const values = {}; let run = false;
  for (let index=0; index<args.length; index++) {
    const key = args[index];
    if (key==='--run') { if (run) fail('DUPLICATE_ARGUMENT'); run=true; continue; }
    if (!['--out','--legacy-root','--repeats','--cases','--arms','--max-tokens'].includes(key)) fail('UNKNOWN_ARGUMENT');
    if (Object.hasOwn(values,key)) fail('DUPLICATE_ARGUMENT');
    const value=args[++index];
    if (!value || value.startsWith('--') || /[\0\r\n]/.test(value)) fail('INVALID_ARGUMENT');
    values[key]=value;
  }
  if (!values['--out'] || !values['--legacy-root']) fail('OUT_AND_LEGACY_ROOT_REQUIRED');
  if (!path.isAbsolute(values['--legacy-root'])) fail('LEGACY_ROOT_MUST_BE_ABSOLUTE');
  const integer = (value, fallback, cap) => {
    if (value!==undefined && !/^[1-9][0-9]*$/.test(value)) fail('INVALID_LIMIT');
    const result=value===undefined?fallback:Number(value);
    if (!Number.isSafeInteger(result) || result>cap) fail('INVALID_LIMIT');
    return result;
  };
  const list = (value, fallback) => {
    const result=value===undefined?fallback:value.split(',');
    if (result.some(id=>!/^[a-z][a-z0-9-]*$/.test(id)) || new Set(result).size!==result.length) fail('INVALID_LIST');
    return result;
  };
  const arms=list(values['--arms'],ARMS);
  if (arms.some(arm=>!ARMS.includes(arm))) fail('UNKNOWN_ARM');
  return {output:path.resolve(values['--out']), legacyRoot:values['--legacy-root'], arms,
    repeats:integer(values['--repeats'],2,LIMITS.maxRepeats),
    maxTokens:integer(values['--max-tokens'],LIMITS.defaultTokens,LIMITS.maxTokens),
    caseIds:list(values['--cases'],[])};
}
function safeRelative(filename) {
  return typeof filename==='string' && filename.length<240 && /^[a-zA-Z0-9_./-]+$/.test(filename)
    && !path.isAbsolute(filename) && filename.split('/').every(part=>part && part!=='.' && part!=='..')
    && !filename.split('/').some(part=>part==='.git'||part==='.agents'||part==='.codex');
}
function validateCases(cases, selected) {
  if (!Array.isArray(cases) || !cases.length || cases.length>12) fail('INVALID_FIXTURES');
  const ids = new Set();
  for (const fixture of cases) {
    if (!/^[a-z][a-z0-9-]*$/.test(fixture.id) || ids.has(fixture.id)
      || typeof fixture.task!=='string' || !fixture.task.trim() || fixture.task.length>12000
      || typeof fixture.verify!=='function' || !fixture.files || typeof fixture.files!=='object'
      || !Array.isArray(fixture.allowedFiles) || !fixture.allowedFiles.length) fail('INVALID_FIXTURE');
    ids.add(fixture.id);
    for (const [filename, content] of Object.entries(fixture.files)) {
      if (!safeRelative(filename) || typeof content!=='string' || Buffer.byteLength(content)>1024*1024) fail('INVALID_FIXTURE_FILE');
    }
    if (fixture.allowedFiles.some(filename=>!safeRelative(filename))) fail('INVALID_ALLOWED_FILE');
  }
  if (selected.some(id=>!ids.has(id))) fail('UNKNOWN_CASE');
  return selected.length?selected.map(id=>cases.find(fixture=>fixture.id===id)):cases;
}
function snapshot(cwd, directory=cwd, result={}) {
  for (const item of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (item.name==='.git') continue;
    const absolute=path.join(directory,item.name), relative=path.relative(cwd,absolute).split(path.sep).join('/');
    if (item.isSymbolicLink()) result[relative]='SYMLINK';
    else if (item.isDirectory()) snapshot(cwd,absolute,result);
    else if (item.isFile()) result[relative]=hash(fs.readFileSync(absolute));
    else result[relative]='SPECIAL_FILE';
  }
  return result;
}
function qualityCheck(fixture, cwd, before) {
  let gates;
  try {
    const result=fixture.verify(cwd);
    gates={testsPassed:result.testsPassed===true, oraclePassed:result.oraclePassed===true,
      mutantChecksPassed:result.mutantChecksPassed===true, verifierCompleted:true};
  } catch { gates={testsPassed:false,oraclePassed:false,mutantChecksPassed:false,verifierCompleted:false}; }
  let after, changedFiles=[];
  try { after=snapshot(cwd); }
  catch { gates.fileInspectionCompleted=false; }
  if (after) {
    changedFiles=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(name=>before[name]!==after[name]);
    gates.onlyAllowedFilesChanged=changedFiles.every(name=>fixture.allowedFiles.includes(name));
    gates.noSymlinksOrSpecialFiles=Object.values(after).every(value=>/^[a-f0-9]{64}$/.test(value));
  } else gates.onlyAllowedFilesChanged=false;
  return {passed:Object.values(gates).every(Boolean),checks:gates,
    changedFiles:changedFiles.map(name=>safeRelative(name)?name:`unrecognized:${hash(name).slice(0,16)}`),
    checksPassed:Object.values(gates).filter(Boolean).length,checksTotal:Object.keys(gates).length};
}
function feedback(quality) {
  // Never expose hidden inputs, expected answers, tool output, or mutant source.
  const failed=Object.entries(quality.checks).filter(([,passed])=>!passed).map(([name])=>name);
  return `Deterministic verification failed ${failed.length} of ${quality.checksTotal} checks: ${failed.join(', ')}. `
    + 'Inspect the existing changes, repair the task within its original file scope, and run the relevant tests.';
}
function sequence(cases, arms, repeats) {
  const runs=[];
  const permutations = values => values.length===1?[values]:values.flatMap((value,index)=>
    permutations(values.filter((_,other)=>other!==index)).map(rest=>[value,...rest]));
  const orders=permutations(arms);
  for (let repeat=0;repeat<repeats;repeat++) {
    const caseOrder=repeat%2?[...cases].reverse():cases;
    for (let index=0;index<caseOrder.length;index++) {
      const ordered=orders[(repeat*cases.length+index)%orders.length];
      for (const arm of ordered) runs.push({fixture:caseOrder[index],arm,repeat:repeat+1});
    }
  }
  return runs;
}
function dispatchSettings(route) {
  const model=route?.model??MODEL,effort=route?.reasoning_effort??EFFORT;
  if (typeof model!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,199}$/.test(model)
    ||!['minimal','low','medium','high','xhigh','max','ultra'].includes(effort)) fail('INVALID_DISPATCH_ROUTE');
  return {model,effort};
}
function preflight(cwd,prompt,knownSkills,route) {
  const {model,effort}=dispatchSettings(route);
  const input=JSON.parse(command('codex',['debug','prompt-input',...COMMON_CONFIG,
    '-c',`model="${model}"`,'-c',`model_reasoning_effort="${effort}"`,prompt],cwd));
  const texts=input.flatMap(item=>(item.content||[]).filter(part=>part.type==='input_text').map(part=>part.text));
  const skillIds=[...new Set(texts.flatMap(text=>text.split('\n')
    .filter(line=>line.includes('SKILL.md')).map(line=>/^\s*- ([a-z0-9][a-z0-9:-]*):/.exec(line)?.[1]).filter(Boolean)))].sort();
  return {skillIds,projectSkillIds:skillIds.filter(id=>knownSkills.includes(id)),
    startTaskEntryInjected:texts.some(text=>/^# Start Task(?: —[^\n]*)?\s*$/m.test(text)),
    renderedInputBytes:Buffer.byteLength(canonical(input)),renderedInputSha256:hash(canonical(input)),
    source:'codex debug prompt-input; no model turn',rawContextRetained:false};
}
function buildCodexArgs(cwd,route) {
  const {model,effort}=dispatchSettings(route);
  return ['exec','--ephemeral','--strict-config','--json','--color','never','--cd',cwd,
    '--model',model,'-c',`model_reasoning_effort="${effort}"`,'--sandbox','workspace-write',...COMMON_CONFIG,'-'];
}
function evidenceFromEvents(events, fixtureFiles) {
  const commands=events.filter(event=>event.type==='item.completed'&&event.item?.type==='command_execution').map(event=>event.item);
  const references=['start-task/SKILL.md','lightweight-path.md','select-execution-profile.js'];
  let entryRead=false, pathRead=false;
  const selectorProfiles=[];
  const evidence=commands.map(item=>{
    const cmd=typeof item.command==='string'?item.command:'';
    const output=typeof item.aggregated_output==='string'?item.aggregated_output:'';
    const success=item.exit_code===0;
    const referencedHarnessPaths=references.filter(name=>cmd.includes(name));
    const entryRendered=success&&/^# Start Task(?: —[^\n]*)?\s*$/m.test(output);
    const pathRendered=success&&/^# (?:Lightweight and standard(?: execution| path)?|Standard execution)\s*$/im.test(output);
    entryRead ||= entryRendered;
    pathRead ||= pathRendered;
    const decisions=[];
    if (success&&cmd.includes('select-execution-profile.js')) {
      // Batched reads and commands can put other text around the JSON result.
      for (const match of output.matchAll(/\{[^{}]*"schema"\s*:\s*"vulpora\.start-task-profile-decision\/v1"[^{}]*\}/g)) {
        try { const decision=JSON.parse(match[0]);
          if (['lightweight','standard','audit'].includes(decision.profile)) decisions.push(decision.profile);
        } catch {}
      }
      // The normal decision contains nested objects/arrays, so also parse the
      // whole command output and each bounded JSON suffix where appropriate.
      const candidates=[output.trim(),...output.split(/\r?\n/).filter(line=>line.trim().startsWith('{'))];
      for (const match of output.matchAll(/(?:^|\n)(\{)/g)) candidates.push(output.slice(match.index+(match[0].length-1)).trim());
      for (const candidate of candidates.slice(0,16)) {
        try { const decision=JSON.parse(candidate);
          if (decision.schema==='vulpora.start-task-profile-decision/v1'
            && ['lightweight','standard','audit'].includes(decision.profile)) decisions.push(decision.profile);
        } catch {}
      }
    }
    selectorProfiles.push(...decisions);
    return {commandSha256:hash(cmd),exitCode:Number.isInteger(item.exit_code)?item.exit_code:null,
      referencedHarnessPaths,referencedFixturePaths:fixtureFiles.filter(name=>cmd.includes(name)),
      entryRendered,pathRendered,selectorProfiles:[...new Set(decisions)]};
  });
  const unexpectedChild=commands.some(item=>/\bcodex\s+(?:[^\n;]*\s)?exec\b|session-runner\.js|\bvulpora\s+session\s+run\b/.test(item.command||''))
    || events.some(event=>/collab|spawn_agent/.test(event.type||'')||/collab|spawn_agent/.test(event.item?.type||''));
  return {commandEvidence:evidence,unexpectedChild,harnessEvidence:{entryRead,lightweightPathRead:pathRead,
    selectorProfiles:[...new Set(selectorProfiles)],selectorExecuted:selectorProfiles.length>0}};
}
async function execute(cwd,prompt,fixtureFiles,route) {
  const args=buildCodexArgs(cwd,route);
  const started=Date.now(),child=spawn('codex',args,
    {cwd,detached:true,shell:false,stdio:['pipe','pipe','pipe']});
  let stream='',bytes=0,stderrBytes=0,reason=null,killTimer;
  function stop(value) {
    reason ||= value;
    if (!child.pid) return;
    try { process.kill(-child.pid,'SIGTERM'); } catch {}
    killTimer ||= setTimeout(()=>{try {process.kill(-child.pid,'SIGKILL');} catch {}},500);
  }
  const timer=setTimeout(()=>stop('TIME_LIMIT'),LIMITS.attemptMs);
  const interrupt=()=>stop('INTERRUPTED');
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',chunk=>{bytes+=Buffer.byteLength(chunk);
    if(bytes>LIMITS.stdoutBytes)stop('OUTPUT_LIMIT');else stream+=chunk;});
  child.stderr.on('data',chunk=>{stderrBytes+=chunk.length;if(stderrBytes>LIMITS.stderrBytes)stop('ERROR_OUTPUT_LIMIT');});
  child.stdin.on('error',()=>stop('INPUT_FAILED'));
  const completionPromise=new Promise(resolve=>{
    child.once('error',()=>{reason||='START_FAILED';});
    child.once('close',(exitCode,signal)=>resolve({exitCode,signal}));
  });
  child.stdin.end(prompt);
  const completion=await completionPromise;
  clearTimeout(timer);clearTimeout(killTimer);
  process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
  const usage=parseUsage('codex',stream,{invocationFailed:!!reason||completion.exitCode!==0});
  let events=[];try {events=parseEvents(stream);}catch {}
  const telemetry=createTelemetry();for(const event of events)telemetry.observe(event);
  return {...completion,reason,usage,elapsedMs:Date.now()-started,outputBytes:bytes,stderrBytes,
    telemetry:telemetry.summary(),promptBytes:Buffer.byteLength(prompt),
    runtimeStreamSha256:hash(stream),rawRuntimeRetained:false,streamTruncated:bytes>LIMITS.stdoutBytes,
    ...(route?{requestedModel:route.model,requestedEffort:route.reasoning_effort,
      dispatchEvidence:{source:'spawn-arguments',binary:'codex',commandSha256:hash(canonical(['codex',...args])),
        model:route.model,reasoning_effort:route.reasoning_effort,backendIdentity:'NOT_ATTESTED',
        primarySessions:1,nestedOrchestrator:false}}:{}),
    ...evidenceFromEvents(events,fixtureFiles)};
}
function compliant(arm,discovery,runtime) {
  if (arm==='baseline') return true;
  const evidence=runtime.harnessEvidence;
  const selected=evidence.selectorProfiles.at(-1);
  const referenceRequired=arm==='legacy'||selected==='standard';
  return (discovery.startTaskEntryInjected||evidence.entryRead)&&(!referenceRequired||evidence.lightweightPathRead)
    &&evidence.selectorExecuted&&['lightweight','standard'].includes(selected);
}
function sumUsage(attempts) {
  const totals={};
  for (const key of TOKEN_KEYS) {
    totals[key]=attempts.some(attempt=>attempt.runtime.usage.usage_status!=='observed'
      || !Number.isSafeInteger(attempt.runtime.usage[key]))?null:
      attempts.reduce((sum,attempt)=>sum+attempt.runtime.usage[key],0);
  }
  return totals;
}
function aggregate(runs,arms,plannedPerArm) {
  const result={};
  for (const arm of arms) {
    const selected=runs.filter(run=>run.arm===arm),attempts=selected.flatMap(run=>run.attempts);
    const accepted=selected.filter(run=>run.accepted).length;
    const firstPasses=selected.filter(run=>run.attempts[0]?.accepted).length;
    const complete=selected.length===plannedPerArm && selected.every(run=>run.finished);
    const totals=sumUsage(attempts);
    result[arm]={planned:plannedPerArm,completed:selected.filter(run=>run.finished).length,
      attempts:attempts.length,accepted,firstPasses,repairs:attempts.filter(attempt=>attempt.number===2).length,
      complete,usageComplete:attempts.every(attempt=>attempt.runtime.usage.usage_status==='observed'),
      observedTokensLowerBound:attempts.reduce((sum,attempt)=>sum+(attempt.runtime.usage.input_output_tokens||0),0),
      totals,firstPassRate:selected.length?firstPasses/selected.length:null,
      eventualPassRate:selected.length?accepted/selected.length:null,
      tokensPerAccepted:accepted&&totals.input_output_tokens!==null?totals.input_output_tokens/accepted:null,
      uncachedInputPlusOutputPerAccepted:accepted&&totals.uncached_input_tokens!==null&&totals.output_tokens!==null
        ?(totals.uncached_input_tokens+totals.output_tokens)/accepted:null,
      meanTokensPerTask:selected.length&&totals.input_output_tokens!==null?totals.input_output_tokens/selected.length:null,
      treatmentCompliant:selected.filter(run=>run.attempts.every(attempt=>attempt.treatmentCompliant)).length};
  }
  return result;
}
function stopReason(runs,maxTokens,started,now=Date.now()) {
  const attempts=runs.flatMap(run=>run.attempts);
  if (attempts.some(attempt=>attempt.runtime.reason==='INTERRUPTED')) return 'INTERRUPTED';
  if (attempts.some(attempt=>attempt.runtime.unexpectedChild)) return 'UNEXPECTED_CHILD';
  if (attempts.some(attempt=>attempt.runtime.usage.usage_status!=='observed')) return 'USAGE_UNAVAILABLE';
  if (attempts.reduce((sum,attempt)=>sum+attempt.runtime.usage.input_output_tokens,0)>=maxTokens) return 'AGGREGATE_TOKEN_GUARD';
  if (now-started>=LIMITS.suiteMs) return 'SUITE_TIME_LIMIT';
  return null;
}
function freezeSource(source,target) {
  fs.mkdirSync(target,{recursive:true});
  // Include every production installer asset root. Exclude local state, Git,
  // reports and credentials; no source file is edited during installation.
  for (const name of ['vulpora','VERSION','install','skills','agents','templates','memory','evals']) {
    fs.cpSync(path.join(source,name),path.join(target,name),{recursive:true,dereference:false,errorOnExist:true});
  }
  const files=snapshot(target);
  if (Object.values(files).some(value=>!/^[a-f0-9]{64}$/.test(value))) fail('UNSAFE_INSTALL_SOURCE');
  return hash(canonical(files));
}
function install(arm,cwd,legacyRoot,optimizedRoot) {
  if (arm==='baseline') return;
  const source=arm==='legacy'?legacyRoot:optimizedRoot;
  const selectors=arm==='legacy'?['all-agents','all-skills']:['start-task'];
  command('bash',[path.join(source,'vulpora'),'setup','--runtime','codex',
    '--scope','project','--target',cwd,...selectors],source,{timeout:120000});
}
async function main(args=process.argv.slice(2)) {
  const options=parseArgs(args);if(!options){process.stdout.write(HELP);return;}
  if (fs.existsSync(options.output)) fail('REPORT_ALREADY_EXISTS');
  const suppliedLegacyRoot=fs.realpathSync(options.legacyRoot);
  if (suppliedLegacyRoot===fs.realpathSync(ROOT) || !fs.statSync(path.join(suppliedLegacyRoot,'vulpora')).isFile()) fail('INVALID_LEGACY_ROOT');
  const fixturesPath=path.join(__dirname,'economic-fixtures.cjs');
  const fixtures=validateCases(require(fixturesPath).cases,options.caseIds);
  const plan=sequence(fixtures,options.arms,options.repeats);
  const catalog=await collectCodexModelCatalog();
  if (!catalog.models.some(item=>item.id===MODEL&&item.reasoningEfforts.includes(EFFORT))) fail('ROUTE_UNAVAILABLE');
  const work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-economic-ab-')));
  const optimizedRoot=path.join(work,'optimized-source');
  const optimizedSourceSha256=freezeSource(ROOT,optimizedRoot);
  const legacyRoot=path.join(work,'legacy-source');
  const legacySourceSha256=freezeSource(suppliedLegacyRoot,legacyRoot);
  const knownSkills=[...new Set([optimizedRoot,legacyRoot].flatMap(root=>fs.readdirSync(path.join(root,'skills'))
    .filter(id=>fs.existsSync(path.join(root,'skills',id,'SKILL.md')))))];
  const report={schema:'vulpora.economic-ab/v1',createdAt:new Date().toISOString(),
    runtime:command('codex',['--version'],ROOT).trim(),model:MODEL,effort:EFFORT,
    design:'matched fixtures; six arm permutations across three cases and two repeats; reverse case order on second repeat; fresh primary session per attempt',
    arms:options.arms,repeats:options.repeats,limits:{...LIMITS,aggregateTokenGuard:options.maxTokens},
    commonConfig:COMMON_CONFIG,fixtureModuleSha256:hash(fs.readFileSync(fixturesPath)),
    cases:fixtures.map(fixture=>({id:fixture.id,task:fixture.task,allowedFiles:fixture.allowedFiles,
      fixtureSha256:hash(canonical(fixture.files))})),
    installations:{baseline:'plain Codex; no project Vulpora assets',legacy:'frozen checkout: all-agents all-skills',
      optimized:'frozen current checkout: supported start-task installation including declared dependencies'},
    legacySourceSha256,optimizedSourceSha256,
    accountingScope:'all isolated primary attempts, including failed quality checks and one repair; deterministic coordinator and verifier use no model',
    cacheControl:'shared provider cache; order counterbalanced, cache not isolated',
    limitations:['small synthetic fixture suite; requested model and effort, backend identity not attested',
      'aggregate guard is checked between attempts and can overshoot by one bounded attempt; no hard provider token cap',
      'cache is a subset of input; uncached-plus-output is a token proxy, not a monetary cost',
      'fresh repair session rereads current workspace and original task; only failed check names are supplied',
      'full installation versus targeted supported installation and optimized instructions is a bundled treatment; individual changes are not isolated',
      'raw runtime output and final messages discarded; command hashes, recognized paths, and parsed evidence retained'],runs:[]};
  const prepared=[];
  // Complete fixture preparation and discovery checks before any paid model turn.
  for (let index=0;index<plan.length;index++) {
    const {fixture,arm,repeat}=plan[index],cwd=path.join(work,`run-${index+1}`,'workspace');
    fs.mkdirSync(cwd,{recursive:true});
    for (const [filename,content] of Object.entries(fixture.files)) {
      const target=path.join(cwd,filename);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);
    }
    command('git',['init','--quiet'],cwd);install(arm,cwd,legacyRoot,optimizedRoot);
    command('git',['add','-A'],cwd);
    command('git',['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','-m','fixture'],cwd);
    if (command('git',['status','--porcelain'],cwd).trim()) fail('DIRTY_INITIAL_FIXTURE');
    const prompt=(arm==='baseline'?'':'$start-task\n')+fixture.task;
    const discovery=preflight(cwd,prompt,knownSkills);
    if (arm==='baseline'&&discovery.projectSkillIds.length) fail('BASELINE_CONTAMINATED');
    if (arm!=='baseline'&&!discovery.projectSkillIds.includes('start-task')) fail('HARNESS_NOT_DISCOVERED');
    if (arm==='optimized'&&discovery.projectSkillIds.some(id=>!['start-task','code-authoring-router','korean-dev-writer'].includes(id))) fail('TARGETED_ARM_CONTAMINATED');
    const before=snapshot(cwd);
    if (Object.values(before).some(value=>!/^[a-f0-9]{64}$/.test(value))) fail('UNSAFE_INITIAL_FIXTURE');
    const taskFiles=Object.fromEntries(Object.keys(fixture.files).map(name=>[name,fs.readFileSync(path.join(cwd,name),'utf8')]));
    const initialTaskFilesSha256=hash(canonical(taskFiles));
    if (initialTaskFilesSha256!==hash(canonical(fixture.files))) fail('INITIAL_TASK_FILES_DIFFER');
    prepared.push({index,fixture,arm,repeat,cwd,prompt,discovery,before,initialTaskFilesSha256});
  }
  fs.mkdirSync(path.dirname(options.output),{recursive:true});
  const fd=fs.openSync(options.output,'wx',0o600);
  const save=()=>{report.summary=aggregate(report.runs,options.arms,fixtures.length*options.repeats);
    const serialized=JSON.stringify(report,null,2)+'\n';fs.ftruncateSync(fd,0);fs.writeSync(fd,serialized,0,'utf8');fs.fsyncSync(fd);};
  process.stdout.write(JSON.stringify({preflight:'PASS',plannedRuns:prepared.length,
    cases:fixtures.map(fixture=>fixture.id),arms:options.arms,workspaces:work})+'\n');
  const started=Date.now();
  try {
    save();
    for (const item of prepared) {
      report.stopped=stopReason(report.runs,options.maxTokens,started);if(report.stopped)break;
      const {index,fixture,arm,repeat,cwd,prompt,discovery,before,initialTaskFilesSha256}=item;
      const run={order:index+1,caseId:fixture.id,arm,repeat,discovery,
        initialFilesSha256:hash(canonical(before)),initialTaskFilesSha256,attempts:[],accepted:false,finished:false};
      report.runs.push(run);
      for (let attempt=1;attempt<=LIMITS.maxAttempts;attempt++) {
        report.stopped=stopReason(report.runs,options.maxTokens,started);if(report.stopped)break;
        const attemptPrompt=attempt===1?prompt:prompt+'\n'+feedback(run.attempts[0].quality);
        const runtime=await execute(cwd,attemptPrompt,Object.keys(fixture.files));
        const quality=qualityCheck(fixture,cwd,before);
        const accepted=runtime.exitCode===0&&!runtime.reason&&!runtime.unexpectedChild&&quality.passed;
        const result={number:attempt,promptBytes:Buffer.byteLength(attemptPrompt),runtime,quality,
          treatmentCompliant:compliant(arm,discovery,runtime),accepted};
        run.attempts.push(result);run.accepted=accepted;
        // A repair is permitted only after a completed, observed, in-scope
        // attempt fails deterministic quality. Unknown usage blocks launches.
        const repairable=!accepted&&runtime.exitCode===0&&!runtime.reason&&!runtime.unexpectedChild
          &&runtime.usage.usage_status==='observed'&&quality.checks.verifierCompleted
          &&quality.checks.onlyAllowedFilesChanged&&quality.checks.noSymlinksOrSpecialFiles;
        run.finished=accepted||!repairable||attempt===LIMITS.maxAttempts;
        save();
        process.stdout.write(JSON.stringify({order:run.order,caseId:fixture.id,arm,repeat,attempt,
          usage:runtime.usage,quality,treatmentCompliant:result.treatmentCompliant,accepted})+'\n');
        if(run.finished)break;
      }
      save();if(report.stopped)break;
    }
    report.stopped ||= stopReason(report.runs,options.maxTokens,started);
    report.completedAt=new Date().toISOString();report.elapsedMs=Date.now()-started;
    report.complete=report.runs.length===prepared.length&&report.runs.every(run=>run.finished);
    report.comparable=report.complete&&report.runs.every(run=>run.attempts.every(attempt=>
      attempt.runtime.usage.usage_status==='observed'&&!attempt.runtime.unexpectedChild&&attempt.treatmentCompliant));
    save();
    process.stdout.write(JSON.stringify({report:options.output,complete:report.complete,comparable:report.comparable,
      stopped:report.stopped,summary:report.summary})+'\n');
  } catch (error) {
    report.stopped='RUNNER_ERROR';report.errorCode=/^[A-Z][A-Z0-9_:.-]*$/.test(error.message)?error.message:'UNEXPECTED_ERROR';
    save();throw error;
  } finally {fs.closeSync(fd);}
}

module.exports={parseArgs,validateCases,qualityCheck,feedback,sequence,buildCodexArgs,evidenceFromEvents,
  compliant,sumUsage,aggregate,stopReason,LIMITS,main,command,snapshot,preflight,execute,COMMON_CONFIG};
if(require.main===module)main().catch(error=>{
  process.stderr.write((/^[A-Z][A-Z0-9_:.-]*$/.test(error.message)?error.message:'ECONOMIC_RUNNER_FAILED')+'\n');
  process.exitCode=2;
});
