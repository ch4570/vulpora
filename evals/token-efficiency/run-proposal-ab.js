#!/usr/bin/env node
'use strict';

// A matched experiment through the actual production session transport.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {canonical,hash}=require('../../skills/start-task/scripts/model-routing-io.js');
const {collectCodexModelCatalog}=require('../../skills/start-task/scripts/codex-model-catalog.js');
const {resolveTaskRoute}=require('../../skills/start-task/scripts/task-router.js');
const {initBudget,readBudget}=require('../../skills/start-task/scripts/session-budget.js');
const session=require('../../skills/start-task/scripts/session-runner.js');
const {parseUsage}=require('../behavioral/adapters/provider-usage.cjs');
const shared=require('./run-economic-ab.js'),routing=require('./run-routing-ab.js'),context=require('./run-context-ab.js');
const ROOT=path.resolve(__dirname,'../..'),ARMS=['agent','proposal'];
const LIMITS=Object.freeze({...context.LIMITS,maxResultBytes:16384});
const fail=code=>{throw new Error(code);};
const HELP='Live calls: node evals/token-efficiency/run-proposal-ab.js --run --out <new.json> '
  +'[--cases query-encoding,retry] [--repeats 1..2] [--max-tokens 500000]\n';

function parseArgs(args){const options=context.parseArgs(args);return options?{...options,arms:ARMS}:null;}
function normalizeRuntime(result) {
  const original=result.runtime||{},usage=original.usage||{};
  // Adapt already-observed production usage, not model text or a new estimate.
  const normalized=usage.source==='codex-jsonl:turn.completed'?parseUsage('codex',JSON.stringify({type:'turn.completed',usage:{
    input_tokens:usage.inputTokens,...(usage.cachedInputTokens==null?{}:{cached_input_tokens:usage.cachedInputTokens}),output_tokens:usage.outputTokens,
    ...(usage.reasoningTokens==null?{}:{reasoning_output_tokens:usage.reasoningTokens})}}),
    {invocationFailed:!!original.reason||original.exitCode!==0||original.closeObserved!==true}):parseUsage('codex','');
  const {runtimeThreadId,usage:omitted,...metadata}=original;
  return {...metadata,reason:result.reason||original.reason||(result.status==='candidate'?null:'WORKER_NOT_CANDIDATE'),
    usage:normalized,usageAdapterSource:'production session-result.runtime.usage',unexpectedChild:false,
    requestedModel:result.requestedRoute?.model,requestedEffort:result.requestedRoute?.reasoning_effort};
}
function prepareAttempt(item,route,number,environment,previousQuality) {
  const parent=path.dirname(item.cwd),taskFile=path.join(parent,`task-${number}.json`),out=path.join(parent,`attempt-${number}`);
  const task={schema:'vulpora.session-task/v1',id:`${item.fixture.id}-${item.arm}-${item.repeat}-${number}`,
    goal:item.fixture.task+(previousQuality?'\n'+shared.feedback(previousQuality):''),cwd:item.cwd,
    files:item.fixture.allowedFiles,acceptance:['Meet the complete task contract and provide regression coverage. The coordinator independently checks behavior and file scope.'],
    ...item.fixture.routing,workerMode:item.arm==='proposal'?'edit-proposal':'agent',mode:'workspace-write',
    delegation:'independent-session',profile:route.profile,estimatedTokens:LIMITS.estimatedTokens,
    remainingTokens:environment.maxTokens,maxRelativeUnits:LIMITS.maxRelativeUnitsPerAttempt,
    limits:{timeoutMs:LIMITS.attemptMs,maxResultBytes:LIMITS.maxResultBytes,maxPromptBytes:LIMITS.promptBytes,toolOutputTokens:2000}};
  fs.writeFileSync(taskFile,canonical(task),{flag:'wx',mode:0o600});
  const plan=session.prepare({task:taskFile,catalog:environment.catalogFile,policy:environment.policyFile,
    budget:environment.budgetFile,out});
  if(plan.status!=='PREPARED'||plan.model!==route.model||plan.reasoning_effort!==route.reasoning_effort)fail('PRODUCTION_ROUTE_MISMATCH');
  const capsule=JSON.parse(fs.readFileSync(plan.capsulePath)),prompt=session.workerPromptFor(capsule);
  return {capsulePath:plan.capsulePath,route:capsule.route,prompt,
    evidence:{capsuleSha256:plan.capsuleSha256,workerMode:task.workerMode,promptSha256:hash(prompt),
      promptBytes:Buffer.byteLength(prompt),sourceContextBytes:capsule.sourceContext?Buffer.byteLength(canonical(capsule.sourceContext)):0,
      sourceContextSha256:capsule.sourceContext?hash(canonical(capsule.sourceContext)):null}};
}
async function executeFixture(item,run,environment) {
  const {fixture,cwd,before}=item,now=environment.now||Date.now;
  for(let number=1;number<=LIMITS.maxAttempts;number++) {
    const stopped=environment.stop();if(stopped){run.stopReason=stopped;break;}
    const selection=number===1?{action:'INITIAL',reason:'PRODUCTION_TASK_CLASSIFICATION',route:item.initialRoute}:
      routing.selectRetry(fixture,'routed',run.attempts,environment.catalog,environment.policy,environment.accounting(),now());
    if(selection.action==='STOP'){run.retryDecision=selection;run.finished=true;break;}
    let prepared;
    try{prepared=number===1?item.prepared:prepareAttempt(item,selection.route,number,environment,run.attempts.at(-1).quality);}
    catch(error){if(number===1)throw error;run.retryDecision={action:'STOP',reason:/^[A-Z_]+$/.test(error.message)?error.message:'PREPARE_FAILED'};run.finished=true;break;}
    const initialFiles=shared.snapshot(cwd);
    const result=await (environment.launch||session.run)({capsule:prepared.capsulePath});
    const runtime=normalizeRuntime(result),quality=shared.qualityCheck(fixture,cwd,before);
    let observedHead=null;try{observedHead=shared.command('git',['rev-parse','HEAD'],cwd).trim();}catch{}
    const historyUnchanged=observedHead===item.initialHead;
    quality.checks.gitHeadUnchanged=historyUnchanged;quality.checksTotal++;quality.checksPassed+=Number(historyUnchanged);
    quality.passed&&=historyUnchanged;
    let afterFiles;try{const files=shared.snapshot(cwd);afterFiles={completed:true,files,sha256:hash(canonical(files))};}
    catch{afterFiles={completed:false,files:null,sha256:null};}
    const treatmentCompliant=historyUnchanged&&routing.dispatchMatches(prepared.route,runtime)
      &&runtime.promptBytes===prepared.evidence.promptBytes;
    const accepted=result.status==='candidate'&&result.execution==='EXIT_ZERO'&&!runtime.reason&&quality.passed;
    const attempt={number,route:prepared.route,selection:{action:selection.action,reason:selection.reason},
      ...prepared.evidence,initialFiles:{completed:true,files:initialFiles,sha256:hash(canonical(initialFiles))},
      afterFiles,runtime,quality,treatmentCompliant,accepted,
      gitHistory:{initialHead:item.initialHead,observedHead,unchanged:historyUnchanged},
      transport:{status:result.status,execution:result.execution,verification:result.verification,
        mutationState:result.mutationState,scopedFilesChanged:result.scopedFilesChanged,
        budget:{committedTokens:result.budget?.committedTokens,remainingTokens:result.budget?.remainingTokens,
          unresolvedAttempts:result.budget?.unresolvedAttempts}}};
    run.attempts.push(attempt);run.accepted=accepted;
    run.finished=accepted||!historyUnchanged||!routing.repairable(attempt)||number===LIMITS.maxAttempts;
    await environment.onAttempt(attempt);if(run.finished)break;
  }
}
function sourceEvidence() {
  const names=[...Object.keys(context.sourceEvidence().files),'evals/token-efficiency/run-proposal-ab.js',
    'evals/token-efficiency/PROPOSAL-EVAL.md','skills/start-task/scripts/session-runner.js',
    'skills/start-task/scripts/session-io.js','skills/start-task/scripts/session-budget.js',
    'skills/start-task/scripts/session-task.schema.json','skills/start-task/scripts/session-candidate.schema.json',
    'skills/start-task/scripts/session-edit-proposal.js','skills/start-task/scripts/session-edit-proposal.schema.json',
    'skills/start-task/scripts/session-output-schema.js'];
  const files=Object.fromEntries(names.map(name=>[name,hash(fs.readFileSync(path.join(ROOT,name)))]));
  return {files,sha256:hash(canonical(files))};
}
function assessment(report) {
  const mapped={...report,summary:{...report.summary,read:report.summary.agent},
    runs:report.runs.map(run=>({...run,arm:run.arm==='agent'?'read':run.arm}))};
  return {...context.assessment(mapped,'proposal'),schema:'vulpora.proposal-ab-assessment/v1',
    scope:'Actual production agent versus edit-proposal session transport; synthetic tasks; excludes full installed skill/Audit and development conversation'};
}
async function main(args=process.argv.slice(2)) {
  const options=parseArgs(args);if(!options){process.stdout.write(HELP);return;}
  const artifacts=options.output.replace(/\.json$/i,'')+'-artifacts';
  if(fs.existsSync(options.output)||fs.existsSync(artifacts))fail('REPORT_OR_ARTIFACTS_ALREADY_EXIST');
  const source=sourceEvidence(),policy=JSON.parse(fs.readFileSync(path.join(ROOT,'skills/start-task/scripts/model-routing-policy.json')));
  const catalog=await collectCodexModelCatalog(),fixtures=routing.validateRoutingCases(require('./routing-fixtures.cjs').cases,options.caseIds);
  const plan=shared.sequence(fixtures,ARMS,options.repeats),work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-proposal-ab-')));
  const environment={catalog,policy,maxTokens:options.maxTokens,catalogFile:path.join(work,'catalog.json'),
    policyFile:path.join(work,'policy.json'),budgetFile:path.join(work,'budget.json')};
  fs.writeFileSync(environment.catalogFile,canonical(catalog));fs.writeFileSync(environment.policyFile,canonical(policy));
  initBudget(environment.budgetFile,{totalTokens:options.maxTokens,maxRelativeUnits:plan.length*LIMITS.maxAttempts*30});
  const knownSkills=fs.readdirSync(path.join(ROOT,'skills')).filter(id=>fs.existsSync(path.join(ROOT,'skills',id,'SKILL.md'))),prepared=[];
  for(const [index,item]of plan.entries()) {
    const cwd=path.join(work,`run-${index+1}`,'workspace');fs.mkdirSync(cwd,{recursive:true});
    for(const [file,content]of Object.entries(item.fixture.files)){fs.mkdirSync(path.dirname(path.join(cwd,file)),{recursive:true});fs.writeFileSync(path.join(cwd,file),content);}
    shared.command('git',['init','--quiet'],cwd);shared.command('git',['add','--all'],cwd);
    shared.command('git',['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','-m','fixture'],cwd);
    const before=shared.snapshot(cwd),initialHead=shared.command('git',['rev-parse','HEAD'],cwd).trim();
    if(canonical(before)!==canonical(Object.fromEntries(Object.entries(item.fixture.files).map(([n,c])=>[n,hash(c)]))))fail('INITIAL_TASK_FILES_DIFFER');
    const initialRoute=resolveTaskRoute(routing.routeRequest(item.fixture,'routed',options.maxTokens),catalog,policy);
    const entry={...item,index,cwd,before,initialHead,initialRoute};entry.prepared=prepareAttempt(entry,initialRoute,1,environment);
    entry.discovery=shared.preflight(cwd,entry.prepared.prompt,knownSkills,initialRoute);
    if(entry.discovery.projectSkillIds.length||entry.discovery.startTaskEntryInjected)fail('PROJECT_HARNESS_CONTAMINATION');
    prepared.push(entry);
  }
  if(sourceEvidence().sha256!==source.sha256)fail('SOURCE_CHANGED_DURING_PREFLIGHT');
  const report={schema:'vulpora.proposal-ab/v1',createdAt:new Date().toISOString(),model:null,
    runtime:shared.command('codex',['--version'],ROOT).trim(),arms:ARMS,repeats:options.repeats,source,policy,catalog,
    design:'Two fresh production transport arms; same original goals, files, routes, shared budget, independent graders and two-attempt repair cap',
    scope:'session.prepare/run: agent tools versus read-only edit proposal plus deterministic parent application and grading',
    limits:{...LIMITS,aggregateTokenGuard:options.maxTokens},reusedPaidAttempts:0,sourceReports:[],artifactsDirectory:path.basename(artifacts),
    coordinator:{kind:'deterministic-node',paidRouterTurns:0,primaryLaunchesPerAttempt:1,nestedOrchestrators:0},
    cases:fixtures.map(f=>({id:f.id,task:f.task,routing:f.routing,allowedFiles:f.allowedFiles,fixtureSha256:hash(canonical(f.files))})),
    limitations:['Small synthetic sample; shared cache and prior fixture exposure are uncontrolled',
      'Different output schemas and tool surfaces are intentional parts of the treatment; preflight byte counts do not include every runtime schema/tool difference',
      'Every failed attempt and repair counts; prior pilot, development/review conversation and full installed skill/Audit are excluded',
      'Requested model and API price scenarios do not attest served identity or actual billing',
      'Aggregate admission guard can overshoot by one attempt; unknown usage blocks more dispatch'],runs:[]};
  fs.mkdirSync(path.dirname(options.output),{recursive:true});fs.mkdirSync(artifacts,{mode:0o700});
  const fd=fs.openSync(options.output,'wx',0o600),started=Date.now();
  const save=()=>{report.summary=shared.aggregate(report.runs,ARMS,fixtures.length*options.repeats);
    fs.ftruncateSync(fd,0);fs.writeSync(fd,JSON.stringify(report,null,2)+'\n',0,'utf8');fs.fsyncSync(fd);};
  environment.accounting=()=>routing.budgetState(report.runs,options.maxTokens,plan.length*LIMITS.maxAttempts*30);
  environment.stop=()=>sourceEvidence().sha256!==source.sha256?'SOURCE_CHANGED_DURING_RUN':
    shared.stopReason(report.runs,options.maxTokens,started)||
    (readBudget(environment.budgetFile).unresolvedAttempts?'BUDGET_RECONCILIATION_REQUIRED':null);
  process.stdout.write(JSON.stringify({preflight:'PASS',plannedRuns:prepared.length,workspaces:work})+'\n');
  try{
    save();for(const item of prepared){report.stopped=environment.stop();if(report.stopped)break;
      const run={order:item.index+1,caseId:item.fixture.id,arm:item.arm,repeat:item.repeat,initialHead:item.initialHead,
        initialFiles:item.before,discovery:item.discovery,attempts:[],accepted:false,finished:false};report.runs.push(run);
      await executeFixture(item,run,{...environment,onAttempt:async a=>{save();process.stdout.write(JSON.stringify({order:run.order,
        caseId:run.caseId,arm:run.arm,repeat:run.repeat,attempt:a.number,model:a.route.model,
        tokens:a.runtime.usage.input_output_tokens,commands:a.runtime.telemetry?.itemCompleted.commandExecutions,
        accepted:a.accepted,reason:a.runtime.reason,treatmentCompliant:a.treatmentCompliant})+'\n');}});
      run.artifact=context.saveArtifact(item,run,artifacts);save();
    }
    report.stopped=environment.stop();report.completedAt=new Date().toISOString();report.elapsedMs=Date.now()-started;
    report.finalSource=sourceEvidence();report.sourceUnchanged=report.finalSource.sha256===source.sha256;
    report.complete=report.runs.length===prepared.length&&report.runs.every(run=>run.finished);
    report.comparable=report.complete&&report.sourceUnchanged&&report.runs.every(run=>run.artifact?.saved&&run.attempts.every(a=>a.runtime.usage.usage_status==='observed'&&a.treatmentCompliant));
    report.finalBudget=readBudget(environment.budgetFile);save();report.assessment=assessment(report);save();
    fs.writeFileSync(path.join(artifacts,'manifest.json'),JSON.stringify({schema:'vulpora.proposal-ab-artifacts/v1',
      report:path.basename(options.output),sourceSha256:source.sha256,runs:report.runs.map(({order,caseId,arm,repeat,artifact})=>({order,caseId,arm,repeat,artifact}))},null,2)+'\n',{flag:'wx'});
    process.stdout.write(JSON.stringify({complete:report.complete,comparable:report.comparable,assessment:report.assessment,summary:report.summary})+'\n');
  }catch(error){report.stopped='RUNNER_ERROR';report.errorCode=/^[A-Z_]+$/.test(error.message)?error.message:'UNEXPECTED_ERROR';save();throw error;}
  finally{fs.closeSync(fd);}
}
module.exports={parseArgs,normalizeRuntime,prepareAttempt,executeFixture,sourceEvidence,assessment,LIMITS,main};
if(require.main===module)main().catch(error=>{process.stderr.write((/^[A-Z_]+$/.test(error.message)?error.message:'PROPOSAL_RUNNER_FAILED')+'\n');process.exitCode=2;});
