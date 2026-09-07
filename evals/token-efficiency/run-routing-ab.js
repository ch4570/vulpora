#!/usr/bin/env node
'use strict';

// Paid calls require --run. This deterministic entry dispatcher selects the
// first primary model before launching Codex; it never launches an LLM router.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {canonical,hash}=require('../../skills/start-task/scripts/model-routing-io.js');
const {collectCodexModelCatalog}=require('../../skills/start-task/scripts/codex-model-catalog.js');
const {resolveTaskRoute,resolveTaskEscalation}=require('../../skills/start-task/scripts/task-router.js');
const shared=require('./run-economic-ab.js');
const ROOT=path.resolve(__dirname,'../..');
const ARMS=['baseline','luna','routed'];
const LIMITS=Object.freeze({...shared.LIMITS,maxRepeats:2,defaultTokens:1200000,estimatedTokens:4000,
  maxRelativeUnitsPerAttempt:30});
const HELP='Live calls: node evals/token-efficiency/run-routing-ab.js --run --out <new.json> '
  +'[--arms baseline,luna,routed] [--cases id,id] [--repeats 1..2] [--max-tokens 1200000]\n';
const fail=code=>{throw new Error(code);};

function parseArgs(args) {
  if (!args.length||(args.length===1&&args[0]==='--help')) return null;
  if (!args.includes('--run')) fail('EXPLICIT_RUN_REQUIRED');
  const values={};let run=false;
  for(let index=0;index<args.length;index++) {
    const key=args[index];
    if(key==='--run'){if(run)fail('DUPLICATE_ARGUMENT');run=true;continue;}
    if(!['--out','--arms','--cases','--repeats','--max-tokens'].includes(key))fail('UNKNOWN_ARGUMENT');
    if(Object.hasOwn(values,key))fail('DUPLICATE_ARGUMENT');
    const value=args[++index];
    if(!value||value.startsWith('--')||/[\0\r\n]/.test(value))fail('INVALID_ARGUMENT');
    values[key]=value;
  }
  if(!values['--out'])fail('OUT_REQUIRED');
  const integer=(value,fallback,cap)=>{
    if(value!==undefined&&!/^[1-9][0-9]*$/.test(value))fail('INVALID_LIMIT');
    const result=value===undefined?fallback:Number(value);
    if(!Number.isSafeInteger(result)||result>cap)fail('INVALID_LIMIT');return result;
  };
  const list=(value,fallback)=>{
    const result=value===undefined?[...fallback]:value.split(',');
    if(result.some(id=>!/^[a-z][a-z0-9-]*$/.test(id))||new Set(result).size!==result.length)fail('INVALID_LIST');
    return result;
  };
  const arms=list(values['--arms'],ARMS);if(arms.some(arm=>!ARMS.includes(arm)))fail('UNKNOWN_ARM');
  return {output:path.resolve(values['--out']),arms,caseIds:list(values['--cases'],[]),
    repeats:integer(values['--repeats'],1,LIMITS.maxRepeats),
    maxTokens:integer(values['--max-tokens'],LIMITS.defaultTokens,LIMITS.maxTokens)};
}

function validateRoutingCases(cases,selected=[]) {
  const fixtures=shared.validateCases(cases,selected);
  for(const fixture of fixtures) {
    if(!fixture.routing||!['simple','moderate','complex'].includes(fixture.routing.difficulty)
      ||!['implementation','testing','documentation','review'].includes(fixture.routing.taskType)
      ||fixture.routing.risk!=='low'||typeof fixture.routingRationale!=='string'
      ||!fixture.routingRationale.trim()||fixture.routingRationale.length>1500
      ||Object.keys(fixture.routing).some(key=>!['taskType','difficulty','risk'].includes(key)))fail('INVALID_ROUTING_FIXTURE');
  }
  return fixtures;
}
function routeRequest(fixture,arm,remainingTokens) {
  if(!ARMS.includes(arm))fail('UNKNOWN_ARM');
  return {runtime:'codex',...fixture.routing,kind:'independent-session',
    estimatedTokens:LIMITS.estimatedTokens,remainingTokens,maxRelativeUnits:LIMITS.maxRelativeUnitsPerAttempt,
    ...(arm==='baseline'?{profile:'standard'}:arm==='luna'?{profile:'frugal'}:{})};
}
function observedUsage(usage) {
  if(usage?.usage_status!=='observed'||usage.runtime!=='codex'||usage.source_event!=='turn.completed.usage')return null;
  return {source:'codex-jsonl:turn.completed',inputTokens:usage.input_tokens,outputTokens:usage.output_tokens,
    cachedInputTokens:usage.cached_input_tokens,reasoningTokens:usage.reasoning_tokens};
}
function repairable(result) {
  const {runtime,quality}=result;
  return !result.accepted&&runtime.exitCode===0&&!runtime.reason&&!runtime.unexpectedChild
    &&runtime.usage.usage_status==='observed'&&quality.checks.verifierCompleted
    &&quality.checks.onlyAllowedFilesChanged&&quality.checks.noSymlinksOrSpecialFiles;
}
function budgetState(runs,maxTokens,maxRelativeUnits) {
  const attempts=runs.flatMap(run=>run.attempts);
  const unresolvedAttempts=attempts.filter(attempt=>attempt.runtime.usage.usage_status!=='observed').length;
  const tokens=attempts.reduce((sum,attempt)=>sum+(attempt.runtime.usage.input_output_tokens||0),0);
  const units=attempts.reduce((sum,attempt)=>sum+attempt.route.relativeUnits,0);
  return {remainingTokens:Math.max(0,maxTokens-tokens),remainingRelativeUnits:Math.max(0,maxRelativeUnits-units),
    unresolvedAttempts,overdrawn:tokens>maxTokens||units>maxRelativeUnits};
}
function selectRetry(fixture,arm,attempts,catalog,policy,accounting,now=Date.now()) {
  const previous=attempts.at(-1);
  if(!previous||!repairable(previous))return {action:'STOP',reason:'NOT_REPAIRABLE',route:null};
  if(attempts.length>=LIMITS.maxAttempts)return {action:'STOP',reason:'ATTEMPT_CAP_REACHED',route:null};
  if(accounting.unresolvedAttempts||accounting.overdrawn)return {action:'STOP',reason:'BUDGET_RECONCILIATION_REQUIRED',route:null};
  const request=routeRequest(fixture,arm,accounting.remainingTokens);
  if(arm==='routed')return resolveTaskEscalation({request,previousRoute:previous.route,
    verification:{status:'failed',failureClass:'model-quality'},attemptsUsed:attempts.length,
    maxAttempts:LIMITS.maxAttempts,accounting,previousUsage:observedUsage(previous.runtime.usage)},catalog,policy,now);
  try {
    const route=resolveTaskRoute({...request,maxRelativeUnits:Math.min(request.maxRelativeUnits,accounting.remainingRelativeUnits)},catalog,policy,now);
    if(route.model!==previous.route.model||route.reasoning_effort!==previous.route.reasoning_effort)fail('FIXED_ARM_ROUTE_CHANGED');
    return {action:'RETRY_SAME_MODEL',reason:'SAME_DETERMINISTIC_QUALITY_REPAIR_ALLOWANCE',route};
  } catch(error) {
    if(['BUDGET_EXCEEDED','ROUTE_UNAVAILABLE','STALE_CATALOG'].includes(error.message))return {action:'STOP',reason:error.message,route:null};
    throw error;
  }
}
function dispatchMatches(route,runtime) {
  const evidence=runtime.dispatchEvidence;
  return !!evidence&&runtime.requestedModel===route.model&&runtime.requestedEffort===route.reasoning_effort
    &&evidence.model===route.model&&evidence.reasoning_effort===route.reasoning_effort
    &&evidence.source==='spawn-arguments'&&evidence.binary==='codex'
    &&/^[a-f0-9]{64}$/.test(evidence.commandSha256)&&evidence.primarySessions===1&&!evidence.nestedOrchestrator;
}
function fileEvidence(cwd) {
  try {const files=shared.snapshot(cwd);return {completed:true,sha256:hash(canonical(files)),files};}
  catch {return {completed:false,sha256:null,files:null};}
}

// The injected executor is used only by offline tests. The CLI always uses the
// same bounded executor as the fixed-model experiment.
async function executeFixture(item,run,environment) {
  const {fixture,arm,cwd,before}=item;
  const {catalog,policy,accounting,stop,onAttempt}=environment;
  const execute=environment.execute||shared.execute;
  const now=environment.now||Date.now;
  let selection={action:'INITIAL',reason:arm==='routed'?'PRODUCTION_TASK_CLASSIFICATION':'FIXED_CONTROL',route:null};
  for(let number=1;number<=LIMITS.maxAttempts;number++) {
    const stopped=stop();if(stopped){run.stopReason=stopped;break;}
    if(number===1)selection.route=resolveTaskRoute(routeRequest(fixture,arm,accounting().remainingTokens),catalog,policy,now());
    else selection=selectRetry(fixture,arm,run.attempts,catalog,policy,accounting(),now());
    if(selection.action==='STOP'){run.retryDecision=selection;run.finished=true;break;}
    const route=selection.route;
    const prompt=fixture.task+(number===1?'':'\n'+shared.feedback(run.attempts[0].quality));
    const initialFiles=fileEvidence(cwd);
    const runtime=await execute(cwd,prompt,Object.keys(fixture.files),route);
    const quality=shared.qualityCheck(fixture,cwd,before);
    const afterFiles=fileEvidence(cwd);
    const treatmentCompliant=dispatchMatches(route,runtime)&&!runtime.unexpectedChild;
    const accepted=runtime.exitCode===0&&!runtime.reason&&!runtime.unexpectedChild&&quality.passed;
    const result={number,routingMode:arm==='routed'?'production-task-router':'fixed-control',
      route,selection:{...selection,route:undefined},promptSha256:hash(prompt),promptBytes:Buffer.byteLength(prompt),
      initialFiles,afterFiles,runtime,quality,treatmentCompliant,accepted};
    run.attempts.push(result);run.accepted=accepted;
    run.finished=accepted||!repairable(result)||number===LIMITS.maxAttempts;
    await onAttempt(result);
    if(run.finished)break;
  }
  return run;
}

function sourceEvidence() {
  const files=['evals/token-efficiency/run-routing-ab.js','evals/token-efficiency/run-economic-ab.js',
    'evals/token-efficiency/routing-fixtures.cjs','evals/token-efficiency/economic-fixtures.cjs',
    'evals/behavioral/adapters/provider-usage.cjs','skills/start-task/scripts/task-router.js',
    'skills/start-task/scripts/model-router.js','skills/start-task/scripts/model-routing-policy.json',
    'skills/start-task/scripts/model-routing-io.js','skills/start-task/scripts/codex-model-catalog.js',
    'skills/start-task/scripts/session-telemetry.js'];
  const hashes=Object.fromEntries(files.map(name=>[name,hash(fs.readFileSync(path.join(ROOT,name)))]));
  return {files:hashes,sha256:hash(canonical(hashes))};
}

async function main(args=process.argv.slice(2)) {
  const options=parseArgs(args);if(!options){process.stdout.write(HELP);return;}
  if(fs.existsSync(options.output))fail('REPORT_ALREADY_EXISTS');
  const source=sourceEvidence();
  const policy=JSON.parse(fs.readFileSync(path.join(ROOT,'skills/start-task/scripts/model-routing-policy.json'),'utf8'));
  const fixtures=validateRoutingCases(require('./routing-fixtures.cjs').cases,options.caseIds);
  const plan=shared.sequence(fixtures,options.arms,options.repeats);
  const catalog=await collectCodexModelCatalog();
  const knownSkills=fs.readdirSync(path.join(ROOT,'skills')).filter(id=>fs.existsSync(path.join(ROOT,'skills',id,'SKILL.md')));
  const work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-routing-ab-')));
  const prepared=[];
  for(let index=0;index<plan.length;index++) {
    const {fixture,arm,repeat}=plan[index],cwd=path.join(work,`run-${index+1}`,'workspace');
    const route=resolveTaskRoute(routeRequest(fixture,arm,options.maxTokens),catalog,policy);
    if(arm==='baseline'&&(route.model!=='gpt-5.6-terra'||route.reasoning_effort!=='medium'))fail('BASELINE_POLICY_CHANGED');
    if(arm==='luna'&&(route.model!=='gpt-5.6-luna'||route.reasoning_effort!=='low'))fail('LUNA_POLICY_CHANGED');
    fs.mkdirSync(cwd,{recursive:true});
    for(const [filename,content]of Object.entries(fixture.files)) {
      const target=path.join(cwd,filename);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);
    }
    shared.command('git',['init','--quiet'],cwd);shared.command('git',['add','-A'],cwd);
    shared.command('git',['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','-m','fixture'],cwd);
    if(shared.command('git',['status','--porcelain'],cwd).trim())fail('DIRTY_INITIAL_FIXTURE');
    const discovery=shared.preflight(cwd,fixture.task,knownSkills,route);
    if(discovery.projectSkillIds.length||discovery.startTaskEntryInjected)fail('PROJECT_HARNESS_CONTAMINATION');
    const before=shared.snapshot(cwd),expected=Object.fromEntries(Object.entries(fixture.files).map(([name,content])=>[name,hash(content)]));
    if(canonical(before)!==canonical(expected))fail('INITIAL_TASK_FILES_DIFFER');
    prepared.push({index,fixture,arm,repeat,cwd,before,discovery,initialRoute:route});
  }
  if(sourceEvidence().sha256!==source.sha256)fail('SOURCE_CHANGED_DURING_PREFLIGHT');
  const report={schema:'vulpora.routing-ab/v1',createdAt:new Date().toISOString(),
    runtime:shared.command('codex',['--version'],ROOT).trim(),arms:options.arms,repeats:options.repeats,
    design:'Fresh matched fixture runs with equal prompts and repair allowances; arm permutations and reverse case order on repeat 2',
    scope:'production deterministic task-router/model-router at entry; one fresh primary Codex exec per attempt; not a full SKILL, Audit, or session-runner workflow evaluation',
    coordinator:{kind:'deterministic-node',paidRouterTurns:0,primaryLaunchesPerAttempt:1,nestedOrchestrators:0},
    source,policy,catalog,limits:{...LIMITS,aggregateTokenGuard:options.maxTokens,
      aggregateRelativeUnitsGuard:plan.length*LIMITS.maxAttempts*LIMITS.maxRelativeUnitsPerAttempt},
    commonConfig:shared.COMMON_CONFIG,installations:'All arms use plain fresh project workspaces without project Vulpora skills or agents',
    cases:fixtures.map(fixture=>({id:fixture.id,task:fixture.task,routing:fixture.routing,
      routingRationale:fixture.routingRationale,allowedFiles:fixture.allowedFiles,fixtureSha256:hash(canonical(fixture.files))})),
    reusedPaidAttempts:0,sourceReports:[],
    accountingScope:'Every fresh primary attempt, including failed quality checks and repairs; deterministic routing and grading use no model',
    cacheControl:'shared provider cache and prior fixture exposure; cache not isolated; no previous paid results reused as paired observations',
    limitations:['Small synthetic pilot; arm order is rotated, not a randomized or population-representative quality study',
      'Requested model/effort and launch arguments are recorded; backend identity and actual billing are not attested',
      'Global runtime context may still be injected equally across arms; no full project harness bundle is installed',
      'Retry feedback contains failed deterministic check names only; all arms retain the same original file scope and at most two attempts',
      'Aggregate token guard is checked between bounded attempts and can overshoot by one attempt; estimates are not provider token caps',
      'Task classifications are declared before model execution from fixture requirements; no LLM classification cost',
      'Relative units are routing policy units, not USD; no previous experiment spend is included in this fresh suite',
      'Raw prompts beyond public fixture tasks, commands, runtime output and final messages are discarded; hashes and parsed evidence retained'],runs:[]};
  fs.mkdirSync(path.dirname(options.output),{recursive:true});
  const fd=fs.openSync(options.output,'wx',0o600);
  const save=()=>{report.summary=shared.aggregate(report.runs,options.arms,fixtures.length*options.repeats);
    fs.ftruncateSync(fd,0);fs.writeSync(fd,JSON.stringify(report,null,2)+'\n',0,'utf8');fs.fsyncSync(fd);};
  const started=Date.now();
  const accounting=()=>budgetState(report.runs,options.maxTokens,report.limits.aggregateRelativeUnitsGuard);
  const stop=()=>{
    if(sourceEvidence().sha256!==source.sha256)return 'SOURCE_CHANGED_DURING_RUN';
    return shared.stopReason(report.runs,options.maxTokens,started)
      ||(accounting().remainingTokens<LIMITS.estimatedTokens?'INSUFFICIENT_ROUTE_TOKEN_ESTIMATE':null);
  };
  process.stdout.write(JSON.stringify({preflight:'PASS',plannedRuns:prepared.length,arms:options.arms,
    routes:fixtures.map(fixture=>({caseId:fixture.id,...fixture.routing,
      routedModel:resolveTaskRoute(routeRequest(fixture,'routed',options.maxTokens),catalog,policy).model})),workspaces:work})+'\n');
  try {
    save();
    for(const item of prepared) {
      report.stopped=stop();if(report.stopped)break;
      const {index,fixture,arm,repeat,before,discovery}=item;
      const run={order:index+1,caseId:fixture.id,arm,repeat,discovery,
        initialFilesSha256:hash(canonical(before)),initialFiles:before,
        initialTaskFilesSha256:hash(canonical(fixture.files)),attempts:[],accepted:false,finished:false};
      report.runs.push(run);
      await executeFixture(item,run,{catalog,policy,accounting,stop,onAttempt:async result=>{
        save();process.stdout.write(JSON.stringify({order:run.order,caseId:fixture.id,arm,repeat,
          attempt:result.number,model:result.route.model,effort:result.route.reasoning_effort,
          selection:result.selection,usage:result.runtime.usage,quality:result.quality,
          treatmentCompliant:result.treatmentCompliant,accepted:result.accepted})+'\n');
      }});
      save();
    }
    report.stopped=stop();report.completedAt=new Date().toISOString();report.elapsedMs=Date.now()-started;
    report.finalSource=sourceEvidence();report.sourceUnchanged=report.finalSource.sha256===source.sha256;
    report.complete=report.runs.length===prepared.length&&report.runs.every(run=>run.finished);
    report.comparable=report.complete&&report.sourceUnchanged&&report.runs.every(run=>run.attempts.every(attempt=>
      attempt.runtime.usage.usage_status==='observed'&&attempt.treatmentCompliant));
    save();process.stdout.write(JSON.stringify({report:options.output,complete:report.complete,
      comparable:report.comparable,stopped:report.stopped,summary:report.summary})+'\n');
  }catch(error){report.stopped='RUNNER_ERROR';report.errorCode=/^[A-Z][A-Z0-9_:.-]*$/.test(error.message)?error.message:'UNEXPECTED_ERROR';save();throw error;}
  finally{fs.closeSync(fd);}
}

module.exports={parseArgs,validateRoutingCases,routeRequest,observedUsage,repairable,budgetState,
  selectRetry,dispatchMatches,fileEvidence,executeFixture,sourceEvidence,LIMITS,main};
if(require.main===module)main().catch(error=>{
  process.stderr.write((/^[A-Z][A-Z0-9_:.-]*$/.test(error.message)?error.message:'ROUTING_RUNNER_FAILED')+'\n');process.exitCode=2;
});
