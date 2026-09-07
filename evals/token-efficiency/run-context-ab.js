#!/usr/bin/env node
'use strict';

// Explicit fresh experiment. Import/help/offline tests never launch a model.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {canonical,hash}=require('../../skills/start-task/scripts/model-routing-io.js');
const {collectCodexModelCatalog}=require('../../skills/start-task/scripts/codex-model-catalog.js');
const {resolveTaskRoute}=require('../../skills/start-task/scripts/task-router.js');
const {sourceContextFor,CONTEXT_GUIDANCE}=require('../../skills/start-task/scripts/session-context.js');
const shared=require('./run-economic-ab.js'),routing=require('./run-routing-ab.js');
const ROOT=path.resolve(__dirname,'../..'),ARMS=['read','inline'];
const LIMITS=Object.freeze({...routing.LIMITS,defaultTokens:500000,maxRepeats:2,promptBytes:8192,contextBytes:4096});
const HELP='Live calls: node evals/token-efficiency/run-context-ab.js --run --out <new.json> '
  +'[--cases query-encoding,retry] [--repeats 1..2] [--max-tokens 500000]\n';
const fail=code=>{throw new Error(code);};

function parseArgs(args) {
  if(!args.length||(args.length===1&&args[0]==='--help'))return null;
  if(args.includes('--arms'))fail('FIXED_CONTEXT_ARMS');
  const parsed=routing.parseArgs(args);
  return {...parsed,arms:[...ARMS],repeats:args.includes('--repeats')?parsed.repeats:2,
    maxTokens:args.includes('--max-tokens')?parsed.maxTokens:LIMITS.defaultTokens,
    caseIds:args.includes('--cases')?parsed.caseIds:['query-encoding','retry']};
}
function fileEvidence(cwd) {
  const files=shared.snapshot(cwd);return {completed:true,sha256:hash(canonical(files)),files};
}
function buildPrompt(fixture,arm,cwd,files,previousQuality) {
  if(!ARMS.includes(arm))fail('UNKNOWN_CONTEXT_ARM');
  const base=fixture.task+(previousQuality?'\n'+shared.feedback(previousQuality):'');
  let context=null,serialized='';
  if(arm==='inline') {
    const envelope=value=>canonical({source_context:value,instructions:[CONTEXT_GUIDANCE]});
    const overhead=Buffer.byteLength(envelope(null))-4;
    const available=Math.min(LIMITS.contextBytes,LIMITS.promptBytes-Buffer.byteLength(base)-1);
    const expected=Object.fromEntries(fixture.allowedFiles.map(name=>[name,files[name]??null]));
    context=sourceContextFor(cwd,fixture.allowedFiles,expected,Math.max(0,available-overhead));
    if(context)serialized=envelope(context);
  }
  const prompt=base+(serialized?'\n'+serialized:'');
  if(Buffer.byteLength(serialized)>LIMITS.contextBytes||Buffer.byteLength(prompt)>LIMITS.promptBytes)fail('PROMPT_BUDGET_EXCEEDED');
  return {prompt,evidence:{mode:arm,basePromptSha256:hash(base),basePromptBytes:Buffer.byteLength(base),
    included:!!context,sourceContextBytes:context?Buffer.byteLength(canonical(context)):0,
    serializedContextBytes:Buffer.byteLength(serialized),contextSha256:context?hash(canonical(context)):null,
    serializedContextSha256:serialized?hash(serialized):null,
    sourceFiles:context?context.files.map(({path:filename,sha256})=>({path:filename,sha256})):[],
    omissionReason:arm==='read'?'CONTROL_READS_FILES':context?null:'PRODUCTION_CONTEXT_INELIGIBLE'}};
}
async function executeFixture(item,run,environment) {
  const {fixture,arm,cwd,before}=item,{catalog,policy,accounting,stop,onAttempt}=environment;
  const execute=environment.execute||shared.execute,now=environment.now||Date.now;
  for(let number=1;number<=LIMITS.maxAttempts;number++) {
    const stopped=stop();if(stopped){run.stopReason=stopped;break;}
    const selection=number===1?{action:'INITIAL',reason:'PRODUCTION_TASK_CLASSIFICATION',route:resolveTaskRoute(
      routing.routeRequest(fixture,'routed',accounting().remainingTokens),catalog,policy,now())}
      :routing.selectRetry(fixture,'routed',run.attempts,catalog,policy,accounting(),now());
    if(selection.action==='STOP'){run.retryDecision=selection;run.finished=true;break;}
    const route=selection.route,initialFiles=fileEvidence(cwd);
    if(number===1&&canonical(initialFiles.files)!==canonical(before))fail('INITIAL_TASK_FILES_CHANGED');
    const prepared=buildPrompt(fixture,arm,cwd,initialFiles.files,run.attempts.at(-1)?.quality);
    if(number===1&&arm==='inline'&&!prepared.evidence.included)fail('INITIAL_CONTEXT_INELIGIBLE');
    const runtime=await execute(cwd,prepared.prompt,Object.keys(fixture.files),route);
    const quality=shared.qualityCheck(fixture,cwd,before);
    let observedHead=null;
    if(item.initialHead)try{observedHead=shared.command('git',['rev-parse','HEAD'],cwd).trim();}catch{}
    const historyUnchanged=!item.initialHead||observedHead===item.initialHead;
    if(item.initialHead){quality.checks.gitHeadUnchanged=historyUnchanged;
      quality.checksTotal++;quality.checksPassed+=Number(historyUnchanged);quality.passed&&=historyUnchanged;}
    let afterFiles;try{afterFiles=fileEvidence(cwd);}catch{afterFiles={completed:false,sha256:null,files:null};}
    const treatmentCompliant=historyUnchanged&&routing.dispatchMatches(route,runtime)&&!runtime.unexpectedChild
      &&runtime.promptBytes===Buffer.byteLength(prepared.prompt);
    const accepted=runtime.exitCode===0&&!runtime.reason&&!runtime.unexpectedChild&&quality.passed;
    const result={number,route,selection:{...selection,route:undefined},context:prepared.evidence,
      promptSha256:hash(prepared.prompt),promptBytes:Buffer.byteLength(prepared.prompt),
      initialFiles,afterFiles,runtime,quality,treatmentCompliant,accepted};
    if(item.initialHead)result.gitHistory={initialHead:item.initialHead,observedHead,unchanged:historyUnchanged};
    run.attempts.push(result);run.accepted=accepted;
    run.finished=accepted||!historyUnchanged||!routing.repairable(result)||number===LIMITS.maxAttempts;
    await onAttempt(result);if(run.finished)break;
  }
  return run;
}
function sourceEvidence() {
  const files=['evals/token-efficiency/run-context-ab.js','evals/token-efficiency/run-routing-ab.js',
    'evals/token-efficiency/run-economic-ab.js','evals/token-efficiency/CONTEXT-EVAL.md',
    'evals/token-efficiency/routing-fixtures.cjs','evals/token-efficiency/economic-fixtures.cjs',
    'evals/behavioral/adapters/provider-usage.cjs','skills/start-task/scripts/session-context.js',
    'skills/start-task/scripts/session-telemetry.js','skills/start-task/scripts/task-router.js',
    'skills/start-task/scripts/model-router.js','skills/start-task/scripts/model-routing-policy.json',
    'skills/start-task/scripts/model-routing-io.js','skills/start-task/scripts/codex-model-catalog.js'];
  const hashes=Object.fromEntries(files.map(name=>[name,hash(fs.readFileSync(path.join(ROOT,name)))]));
  return {files:hashes,sha256:hash(canonical(hashes))};
}
function saveArtifact(item,run,directory) {
  const last=run.attempts.at(-1);
  if(!last?.quality.checks.onlyAllowedFilesChanged||!last.quality.checks.noSymlinksOrSpecialFiles
    ||!last.afterFiles.completed)return {saved:false,reason:'UNSAFE_OR_MISSING_FILE_EVIDENCE'};
  if(!item.initialHead||shared.command('git',['rev-parse','HEAD'],item.cwd).trim()!==item.initialHead)
    return {saved:false,reason:'GIT_HISTORY_CHANGED_OR_UNBOUND'};
  const finalFiles=fileEvidence(item.cwd);
  if(finalFiles.sha256!==last.afterFiles.sha256)fail('ARTIFACT_SOURCE_CHANGED');
  shared.command('git',['add','--all','--',...item.fixture.allowedFiles],item.cwd);
  const patch=shared.command('git',['diff','--cached','--binary',item.initialHead,'--',...item.fixture.allowedFiles],item.cwd);
  const filename=`${String(run.order).padStart(2,'0')}-${run.caseId}-${run.arm}-${run.repeat}.patch`;
  const target=path.join(directory,filename);fs.writeFileSync(target,patch,{flag:'wx',mode:0o600});
  return {saved:true,path:filename,sha256:hash(patch),bytes:Buffer.byteLength(patch),
    accepted:run.accepted,initialFiles:item.before,finalFiles:finalFiles.files,quality:last.quality};
}
function assessment(report,candidateArm='inline') {
  const read=report.summary.read,inline=report.summary[candidateArm];
  const pairs=report.runs.filter(run=>run.arm==='read').map(control=>({control,
    candidate:report.runs.find(run=>run.arm===candidateArm&&run.caseId===control.caseId&&run.repeat===control.repeat)}));
  const qualityPreserved=!!report.comparable&&read.accepted>0&&inline.accepted===inline.planned
    &&inline.accepted>=read.accepted
    &&pairs.every(({control,candidate})=>candidate&&(!control.accepted||candidate.accepted));
  const lowerTokens=!!report.comparable&&inline.totals.input_output_tokens<read.totals.input_output_tokens;
  return {schema:'vulpora.context-ab-assessment/v1',status:!report.comparable?'INCONCLUSIVE':
    qualityPreserved&&lowerTokens?'SAMPLE_CRITERIA_MET':'SAMPLE_CRITERIA_NOT_MET',
    qualityPreserved:report.comparable?qualityPreserved:null,lowerObservedTotalTokens:report.comparable?lowerTokens:null,
    tokenReductionRatio:report.comparable&&read.totals.input_output_tokens>0
      ?1-inline.totals.input_output_tokens/read.totals.input_output_tokens:null,
    scope:'Matched synthetic source-context dispatch sample; no population quality or full installed-harness claim'};
}
async function main(args=process.argv.slice(2)) {
  const options=parseArgs(args);if(!options){process.stdout.write(HELP);return;}
  const artifacts=options.output.replace(/\.json$/i,'')+'-artifacts';
  if(fs.existsSync(options.output)||fs.existsSync(artifacts))fail('REPORT_OR_ARTIFACTS_ALREADY_EXIST');
  const source=sourceEvidence(),policy=JSON.parse(fs.readFileSync(path.join(ROOT,'skills/start-task/scripts/model-routing-policy.json'),'utf8'));
  const fixtures=routing.validateRoutingCases(require('./routing-fixtures.cjs').cases,options.caseIds);
  const plan=shared.sequence(fixtures,ARMS,options.repeats),catalog=await collectCodexModelCatalog();
  const knownSkills=fs.readdirSync(path.join(ROOT,'skills')).filter(id=>fs.existsSync(path.join(ROOT,'skills',id,'SKILL.md')));
  const work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-context-ab-'))),prepared=[];
  for(const [index,item]of plan.entries()) {
    const {fixture,arm}=item,cwd=path.join(work,`run-${index+1}`,'workspace');fs.mkdirSync(cwd,{recursive:true});
    for(const [filename,content]of Object.entries(fixture.files)) {
      const target=path.join(cwd,filename);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);
    }
    shared.command('git',['init','--quiet'],cwd);shared.command('git',['add','--all'],cwd);
    shared.command('git',['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','-m','fixture'],cwd);
    const initialHead=shared.command('git',['rev-parse','HEAD'],cwd).trim();
    if(shared.command('git',['status','--porcelain'],cwd).trim())fail('DIRTY_INITIAL_FIXTURE');
    const before=shared.snapshot(cwd),expected=Object.fromEntries(Object.entries(fixture.files).map(([name,content])=>[name,hash(content)]));
    if(canonical(before)!==canonical(expected))fail('INITIAL_TASK_FILES_DIFFER');
    const route=resolveTaskRoute(routing.routeRequest(fixture,'routed',options.maxTokens),catalog,policy);
    const prompt=buildPrompt(fixture,arm,cwd,before);
    if(arm==='inline'&&!prompt.evidence.included)fail('INITIAL_CONTEXT_INELIGIBLE');
    const discovery=shared.preflight(cwd,prompt.prompt,knownSkills,route);
    if(discovery.projectSkillIds.length||discovery.startTaskEntryInjected)fail('PROJECT_HARNESS_CONTAMINATION');
    prepared.push({...item,index,cwd,before,initialHead,discovery,initialRoute:route,initialContext:prompt.evidence});
  }
  if(sourceEvidence().sha256!==source.sha256)fail('SOURCE_CHANGED_DURING_PREFLIGHT');
  const report={schema:'vulpora.context-ab/v1',createdAt:new Date().toISOString(),
    runtime:shared.command('codex',['--version'],ROOT).trim(),model:null,arms:ARMS,repeats:options.repeats,source,policy,catalog,
    design:'Fresh matched read/inline fixtures; equal task, production routing, deterministic grading and at most two attempts',
    scope:'Production sourceContextFor dispatch optimization; no installed start-task/Audit/full session-runner workflow',
    coordinator:{kind:'deterministic-node',paidRouterTurns:0,primaryLaunchesPerAttempt:1,nestedOrchestrators:0},
    limits:{...LIMITS,aggregateTokenGuard:options.maxTokens,
      aggregateRelativeUnitsGuard:plan.length*LIMITS.maxAttempts*LIMITS.maxRelativeUnitsPerAttempt},
    commonConfig:shared.COMMON_CONFIG,artifactsDirectory:path.basename(artifacts),reusedPaidAttempts:0,sourceReports:[],
    cases:fixtures.map(fixture=>({id:fixture.id,task:fixture.task,routing:fixture.routing,
      routingRationale:fixture.routingRationale,allowedFiles:fixture.allowedFiles,fixtureSha256:hash(canonical(fixture.files))})),
    accountingScope:'All fresh primary attempts including failed checks and repairs; coordinator and grading use no model',
    acceptanceCriterion:'Complete comparable sample; every inline task accepted and at least one read task accepted; no paired acceptance regression; lower aggregate observed input plus output',
    limitations:['Small synthetic sample with uncontrolled shared cache and prior fixture exposure; no population quality claim',
      'Model/effort launch evidence does not attest backend identity or actual billing',
      'Aggregate token admission guard checks between attempts and can overshoot by one bounded attempt',
      'Global context may be injected equally; full installed harness, development and review conversation are excluded',
      'Inline repair context is refreshed and may fall back to reads under the production all-or-nothing cap',
      'Only named failed checks enter repair feedback; no hidden oracle data or raw runtime is retained'],runs:[]};
  fs.mkdirSync(path.dirname(options.output),{recursive:true});fs.mkdirSync(artifacts,{mode:0o700});
  const fd=fs.openSync(options.output,'wx',0o600),started=Date.now();
  const save=()=>{report.summary=shared.aggregate(report.runs,ARMS,fixtures.length*options.repeats);
    fs.ftruncateSync(fd,0);fs.writeSync(fd,JSON.stringify(report,null,2)+'\n',0,'utf8');fs.fsyncSync(fd);};
  const accounting=()=>routing.budgetState(report.runs,options.maxTokens,report.limits.aggregateRelativeUnitsGuard);
  const stop=()=>sourceEvidence().sha256!==source.sha256?'SOURCE_CHANGED_DURING_RUN':
    shared.stopReason(report.runs,options.maxTokens,started)
      ||(accounting().remainingTokens<LIMITS.estimatedTokens?'INSUFFICIENT_ROUTE_TOKEN_ESTIMATE':null);
  process.stdout.write(JSON.stringify({preflight:'PASS',plannedRuns:prepared.length,arms:ARMS,workspaces:work})+'\n');
  try {
    save();
    for(const item of prepared) {
      report.stopped=stop();if(report.stopped)break;
      const run={order:item.index+1,caseId:item.fixture.id,arm:item.arm,repeat:item.repeat,
        initialHead:item.initialHead,
        initialFiles:item.before,initialFilesSha256:hash(canonical(item.before)),discovery:item.discovery,
        initialContext:item.initialContext,attempts:[],accepted:false,finished:false};report.runs.push(run);
      await executeFixture(item,run,{catalog,policy,accounting,stop,onAttempt:async result=>{
        save();process.stdout.write(JSON.stringify({order:run.order,caseId:run.caseId,arm:run.arm,
          attempt:result.number,model:result.route.model,effort:result.route.reasoning_effort,
          usage:result.runtime.usage,telemetry:result.runtime.telemetry,context:result.context,
          quality:result.quality,treatmentCompliant:result.treatmentCompliant,accepted:result.accepted})+'\n');
      }});
      run.artifact=saveArtifact(item,run,artifacts);save();
    }
    report.stopped=stop();report.completedAt=new Date().toISOString();report.elapsedMs=Date.now()-started;
    report.finalSource=sourceEvidence();report.sourceUnchanged=report.finalSource.sha256===source.sha256;
    report.complete=report.runs.length===prepared.length&&report.runs.every(run=>run.finished);
    report.comparable=report.complete&&report.sourceUnchanged&&report.runs.every(run=>run.artifact?.saved&&
      run.attempts.every(attempt=>attempt.runtime.usage.usage_status==='observed'&&attempt.treatmentCompliant));
    save();report.assessment=assessment(report);save();
    fs.writeFileSync(path.join(artifacts,'manifest.json'),JSON.stringify({schema:'vulpora.context-ab-artifacts/v1',
      report:path.basename(options.output),sourceSha256:source.sha256,runs:report.runs.map(({order,caseId,arm,repeat,artifact})=>
        ({order,caseId,arm,repeat,artifact}))},null,2)+'\n',{flag:'wx',mode:0o600});
    process.stdout.write(JSON.stringify({report:options.output,complete:report.complete,
      comparable:report.comparable,stopped:report.stopped,summary:report.summary,assessment:report.assessment})+'\n');
  }catch(error){report.stopped='RUNNER_ERROR';report.errorCode=/^[A-Z][A-Z0-9_:.-]*$/.test(error.message)?error.message:'UNEXPECTED_ERROR';save();throw error;}
  finally{fs.closeSync(fd);}
}
module.exports={parseArgs,buildPrompt,executeFixture,sourceEvidence,saveArtifact,assessment,LIMITS,main};
if(require.main===module)main().catch(error=>{
  process.stderr.write((/^[A-Z][A-Z0-9_:.-]*$/.test(error.message)?error.message:'CONTEXT_RUNNER_FAILED')+'\n');process.exitCode=2;
});
