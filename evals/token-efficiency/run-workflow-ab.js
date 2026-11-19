#!/usr/bin/env node
'use strict';

// Opt-in local pilot. Reuse the existing bounded executor; this is not the
// trusted production runner, provider spending enforcement, or billing proof.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {canonical,hash}=require('../../skills/start-task/scripts/model-routing-io.js');
const {collectCodexModelCatalog}=require('../../skills/start-task/scripts/codex-model-catalog.js');
const shared=require('./run-economic-ab.js');
const accounting=require('./workflow-accounting.cjs');
const ROOT=path.resolve(__dirname,'../..');
const ARMS=Object.freeze(['baseline','concise','installed']);
const ROUTE=Object.freeze({model:'gpt-5.6-terra',reasoning_effort:'medium'});
const LIMITS=Object.freeze({attemptsPerTask:2,aggregateTokens:600000,scenarioMaxUsd:12,
  suiteMs:30*60*1000,attemptMs:shared.LIMITS.attemptMs});
const BRIEF='Explicit workflow: keep one short in-session brief with goal, scope, constraints, acceptance, '
  +'verification and stop conditions. Batch independent relevant reads; keep one owner for coupled work. '
  +'Use the narrowest checks proving the task. After changes, repeat affected or failed checks, not unrelated '
  +'passed checks. Inspect the diff and report evidence and remaining risks. Do not create workflow JSON, '
  +'DAG or ledger files. Stop on missing authority, unknown usage or the stated attempt limit; do not relax safety policies.';
const fail=code=>{throw new Error(code);};
function parseArgs(args) {
  if(!args.length||(args.length===1&&args[0]==='--help'))return null;
  if(args.length!==3||args[0]!=='--run'||args[1]!=='--out'||!args[2]
    ||args[2].startsWith('--')||/[\0\r\n]/.test(args[2]))fail('USE_RUN_OUT_NEW_JSON');
  return {output:path.resolve(args[2])};
}
function sequence(fixtures) {
  return fixtures.flatMap((fixture,index)=>ARMS.map((_,offset)=>
    ({fixture,arm:ARMS[(index+offset)%ARMS.length],repeat:1})));
}
function buildPrompt(fixture,arm,previousQuality) {
  if(!ARMS.includes(arm))fail('UNKNOWN_ARM');
  const prefix=arm==='installed'?'$start-task\nUse the project installation at .agents/skills/start-task/SKILL.md.\n'
    :arm==='concise'?BRIEF+'\n':'';
  return prefix+fixture.task+(previousQuality?'\n'+shared.feedback(previousQuality):'');
}
function inventory(runs) {
  const records=[],expectedInvocationIds=[],taskRuns=[];
  for(const run of runs) {
    const attempts=run.attempts.map(attempt=>{
      const invocationId=`run-${run.order}-attempt-${attempt.number}`;
      const invocationIds=[invocationId];expectedInvocationIds.push(invocationId);
      records.push({invocationId,parentInvocationId:null,purpose:attempt.number===1?'primary':'repair',
        model:ROUTE.model,usage:attempt.runtime.usage});
      if(attempt.runtime.unexpectedChild) {
        const unknownId=invocationId+'-unobserved-child';
        expectedInvocationIds.push(unknownId);invocationIds.push(unknownId);
      }
      return {accepted:attempt.accepted,invocationIds};
    });
    taskRuns.push({runId:`run-${run.order}`,finished:run.finished,accepted:run.accepted,attempts});
  }
  return {records,expectedInvocationIds,runs:taskRuns};
}
function costs(runs) {return accounting.summarizeTaskRuns(inventory(runs));}
function stopReason(runs,started,now=Date.now()) {
  const sharedStop=shared.stopReason(runs,LIMITS.aggregateTokens,started,now);
  if(sharedStop)return sharedStop;
  if(now-started>=LIMITS.suiteMs)return 'WORKFLOW_SUITE_TIME_LIMIT';
  if(runs.some(run=>run.attempts.length)) {
    const spend=accounting.summarizeInvocations(inventory(runs));
    if(!spend.complete)return 'WORKFLOW_ACCOUNTING_INCOMPLETE';
    if(spend.fast.totalUsd.maxUsd>=LIMITS.scenarioMaxUsd)return 'SCENARIO_SPEND_GUARD';
  }
  return null;
}
function treatment(arm,discovery,runtime) {
  if(runtime.requestedModel!==ROUTE.model||runtime.requestedEffort!==ROUTE.reasoning_effort
    ||runtime.dispatchEvidence?.model!==ROUTE.model
    ||runtime.dispatchEvidence?.reasoning_effort!==ROUTE.reasoning_effort)return false;
  if(arm==='installed')return shared.compliant('optimized',discovery,runtime);
  // Global mandatory policy is retained. If it independently activates the
  // installed workflow in a control, do not call the intended arms comparable.
  return !discovery.startTaskEntryInjected&&!runtime.harnessEvidence.entryRead
    &&!runtime.harnessEvidence.selectorExecuted;
}
function acceptedRuntime(runtime,quality) {
  return runtime.exitCode===0&&!runtime.reason&&!runtime.unexpectedChild&&quality.passed;
}
function repairable(runtime,quality) {
  return runtime.exitCode===0&&!runtime.reason&&!runtime.unexpectedChild
    &&runtime.usage.usage_status==='observed'&&quality.checks.verifierCompleted
    &&quality.checks.onlyAllowedFilesChanged&&quality.checks.noSymlinksOrSpecialFiles
    &&quality.checks.gitHeadUnchanged;
}
function artifact(cwd,fixture,initialHead,directory,run,attempt) {
  const safe=attempt.quality.checks.onlyAllowedFilesChanged&&attempt.quality.checks.noSymlinksOrSpecialFiles
    &&attempt.quality.checks.gitHeadUnchanged;
  if(!safe)return {saved:false,reason:'UNSAFE_OR_OUT_OF_SCOPE_RESULT'};
  const tracked=new Set(shared.command('git',['ls-files','--',...fixture.allowedFiles],cwd).trim().split('\n'));
  const stageable=fixture.allowedFiles.filter(name=>tracked.has(name)||fs.existsSync(path.join(cwd,name)));
  if(stageable.length)shared.command('git',['add','--all','--',...stageable],cwd);
  const patch=shared.command('git',['diff','--cached','--binary',initialHead,'--',...fixture.allowedFiles],cwd);
  const filename=`${String(run.order).padStart(2,'0')}-${run.caseId}-${run.arm}-attempt-${attempt.number}.patch`;
  fs.writeFileSync(path.join(directory,filename),patch,{flag:'wx',mode:0o600});
  return {saved:true,path:filename,sha256:hash(patch),bytes:Buffer.byteLength(patch)};
}
function assess(report) {
  const totals=Object.fromEntries(ARMS.map(arm=>{
    const runs=report.runs.filter(run=>run.arm===arm),planned=report.plan.filter(item=>item.arm===arm).length;
    const measured=costs(runs),unstarted=planned-runs.filter(run=>run.attempts.length).length;
    return [arm,{...measured,complete:measured.complete&&unstarted===0&&runs.length===planned,
      plannedRuns:planned,unstartedRuns:unstarted,
      runtimeElapsedMs:runs.flatMap(run=>run.attempts).reduce((sum,attempt)=>sum+attempt.runtime.elapsedMs,0)}];
  }));
  // Pilot results never promote a global default. Missing treatment, usage or
  // planned cases prevents even a matched descriptive comparison.
  const key=item=>canonical([item.order,item.caseId,item.arm,item.repeat]);
  const planKeys=report.plan.map(key),runKeys=report.runs.map(key);
  const matched=planKeys.length>0&&new Set(planKeys).size===planKeys.length
    &&new Set(runKeys).size===runKeys.length&&runKeys.every(value=>planKeys.includes(value));
  const complete=matched&&report.runs.length===report.plan.length&&report.runs.every(run=>run.finished);
  const comparable=complete&&ARMS.every(arm=>totals[arm].complete)&&report.runs.every(run=>run.attempts.length&&run.attempts.every(attempt=>
    attempt.treatmentCompliant&&attempt.runtime.usage.usage_status==='observed'&&!attempt.runtime.unexpectedChild));
  const comparisons={};
  for(const referenceArm of ['baseline','installed']) {
    const reference=totals[referenceArm],candidate=totals.concise;
    const qualityPreserved=comparable&&candidate.acceptedTasks>0&&reference.acceptedTasks>0
      &&report.runs.filter(run=>run.arm===referenceArm).every(control=>!control.accepted
        ||report.runs.some(run=>run.arm==='concise'&&run.caseId===control.caseId&&run.repeat===control.repeat&&run.accepted));
    const tokenReductionRatio=comparable&&reference.tokensPerAcceptedTask>0&&candidate.tokensPerAcceptedTask!==null
      ?1-candidate.tokensPerAcceptedTask/reference.tokensPerAcceptedTask:null;
    const costRanges={};
    for(const scenario of ['standard','fast']) {
      const a=candidate[scenario].costPerAcceptedTaskUsd,b=reference[scenario].costPerAcceptedTaskUsd;
      costRanges[scenario]={strictlyLower:comparable&&!!a&&!!b?a.maxUsd<b.minUsd:null,
        savingsPerAcceptedTaskUsd:comparable&&a&&b?{minUsd:b.minUsd-a.maxUsd,maxUsd:b.maxUsd-a.minUsd}:null};
    }
    comparisons[`conciseVs${referenceArm[0].toUpperCase()+referenceArm.slice(1)}`]={
      qualityPreserved:comparable?qualityPreserved:null,tokenReductionRatio,costRanges,
      sampleCriteriaMet:!!qualityPreserved&&tokenReductionRatio!==null&&tokenReductionRatio>=0.2
        &&Object.values(costRanges).every(value=>value.strictlyLower===true)};
  }
  return {complete,comparable,totals,comparisons,status:comparable?'PILOT_ONLY':'INCONCLUSIVE',
    globalDefaultChange:false,qualitySuperiority:'NOT_ESTABLISHED',actualBilledSavings:'NOT_MEASURED',
    improvementAndEvaluationPayback:'UNKNOWN_IMPROVEMENT_COST_AND_BILLING',
    scope:'All fresh primary and repair invocations; deterministic coordinator and oracle have zero model calls. Host policy retained; installed means explicit activation with a frozen project installation present, not attestation of which duplicate package body ran. No full development-conversation or production multi-agent claim.'};
}
async function main(args=process.argv.slice(2),dependencies={}) {
  const options=parseArgs(args);
  if(!options){process.stdout.write('Opt-in fixed pilot: node evals/token-efficiency/run-workflow-ab.js --run --out <new.json>\n');return;}
  const artifactDirectory=options.output.replace(/\.json$/i,'')+'-artifacts';
  if(fs.existsSync(options.output)||fs.existsSync(artifactDirectory))fail('REPORT_OR_ARTIFACTS_ALREADY_EXIST');
  const fixtures=shared.validateCases(dependencies.fixtures??require('./workflow-fixtures.cjs').cases,[]);
  if(fixtures.length!==3)fail('THREE_PREREGISTERED_FIXTURES_REQUIRED');
  const plan=sequence(fixtures),catalog=await (dependencies.collectCatalog??collectCodexModelCatalog)();
  if(!catalog.models.some(model=>model.id===ROUTE.model&&model.reasoningEfforts.includes(ROUTE.reasoning_effort)))fail('ROUTE_UNAVAILABLE');
  const work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-workflow-ab-')));
  const frozen=path.join(work,'source'),sourceSha256=shared.freezeSource(ROOT,frozen);
  const sourceFiles=['run-workflow-ab.js','workflow-fixtures.cjs','workflow-accounting.cjs','WORKFLOW-EVAL.md',
    'run-economic-ab.js','economic-cost.cjs','../behavioral/adapters/provider-usage.cjs'];
  const sourceHashes=()=>Object.fromEntries(sourceFiles.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))]));
  const source=sourceHashes(),knownSkills=fs.readdirSync(path.join(frozen,'skills'));
  const prepared=[];
  for(const [index,item]of plan.entries()) {
    const {fixture,arm}=item,cwd=path.join(work,`run-${index+1}`,'workspace');
    fs.mkdirSync(cwd,{recursive:true});
    for(const [name,content]of Object.entries(fixture.files)) {
      const target=path.join(cwd,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);
    }
    shared.command('git',['init','--quiet'],cwd);
    if(arm==='installed') {
      if(dependencies.install)dependencies.install(cwd,frozen);
      else shared.command('bash',[path.join(frozen,'vulpora'),'setup','--runtime','codex',
        '--scope','project','--target',cwd,'all-agents','all-skills'],frozen,{timeout:120000});
    }
    shared.command('git',['add','--all'],cwd);
    shared.command('git',['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','-m','Freeze identical acceptance inputs'],cwd);
    const initialHead=shared.command('git',['rev-parse','HEAD'],cwd).trim(),before=shared.snapshot(cwd);
    for(const [name,content]of Object.entries(fixture.files))if(before[name]!==hash(content))fail('INITIAL_FIXTURE_CHANGED');
    const discovery=(dependencies.preflight??shared.preflight)(cwd,buildPrompt(fixture,arm),knownSkills,ROUTE);
    // shared.projectSkillIds matches IDs, not origins. Record honestly as host
    // discovery; do not remove mandatory global policy to obtain a cleaner arm.
    discovery.knownVulporaSkillIds=discovery.projectSkillIds;delete discovery.projectSkillIds;
    if(arm==='installed'&&!discovery.skillIds.includes('start-task'))fail('INSTALLED_SKILL_UNDISCOVERED');
    prepared.push({...item,index,cwd,initialHead,before,discovery});
  }
  if(canonical(sourceHashes())!==canonical(source))fail('SOURCE_CHANGED_BEFORE_RUN');
  const report={schema:'vulpora.workflow-ab/v1',createdAt:new Date().toISOString(),
    runtime:shared.command('codex',['--version'],ROOT).trim(),model:ROUTE.model,effort:ROUTE.reasoning_effort,
    sourceRevision:shared.command('git',['rev-parse','HEAD'],ROOT).trim(),sourceSha256,source,
    protocol:'WORKFLOW-EVAL.md',route:ROUTE,limits:LIMITS,commonConfig:shared.COMMON_CONFIG,
    plan:prepared.map(item=>({order:item.index+1,caseId:item.fixture.id,arm:item.arm,repeat:1})),
    cases:fixtures.map(fixture=>({id:fixture.id,task:fixture.task,rubric:fixture.rubric,allowedFiles:fixture.allowedFiles,
      fixtureSha256:hash(canonical(fixture.files))})),
    coordinator:{kind:'deterministic-node',modelInvocations:0,verificationModelInvocations:0,childInvocationsAllowed:false},
    artifactsDirectory:path.basename(artifactDirectory),improvementCost:{status:'unknown',tokens:null,actualUsd:null},
    pricing:{kind:'frozen-2026-09-07-API-sensitivity-not-billing',actualUsd:null},
    limitations:['Nine planned task runs, one repeat; representative synthetic fixtures, not production tasks or statistical equivalence.',
      'All global host policies and discovered skill metadata retained in controls; not an instruction-free or skill-free baseline.',
      'Treatment evidence is command/render observation, not protected attestation; missing evidence prevents comparison.',
      'Known provider counters and per-attempt patches retained; raw runtime text, secrets and reasoning not retained.',
      'Shared uncontrolled cache; identical requested model/effort does not attest served backend or tier.',
      'Spending guards are checked between attempts and may overshoot by one time/output-bounded attempt; not provider hard caps.',
      'Improvement/development and supervising conversation costs unknown, not zero; total investment payback remains unknown.',
      'Deterministic offline accounting supports parent/child coverage, but live delegation is forbidden and not validated here.'],runs:[]};
  fs.mkdirSync(path.dirname(options.output),{recursive:true});fs.mkdirSync(artifactDirectory,{mode:0o700});
  const fd=fs.openSync(options.output,'wx',0o600),started=Date.now();
  const save=()=>{report.assessment=assess(report);report.accounting=costs(report.runs);
    fs.ftruncateSync(fd,0);fs.writeSync(fd,JSON.stringify(report,null,2)+'\n',0,'utf8');fs.fsyncSync(fd);};
  const stop=()=>canonical(sourceHashes())!==canonical(source)?'SOURCE_CHANGED_DURING_RUN':stopReason(report.runs,started);
  process.stdout.write(JSON.stringify({preflight:'PASS',plannedRuns:prepared.length,workspaces:work})+'\n');
  try {
    save();
    for(const item of prepared) {
      report.stopped=stop();if(report.stopped)break;
      const {fixture,arm,cwd,before,initialHead,discovery}=item;
      const run={order:item.index+1,caseId:fixture.id,arm,repeat:1,discovery,
        initialFilesSha256:hash(canonical(before)),attempts:[],accepted:false,finished:false};report.runs.push(run);
      for(let number=1;number<=LIMITS.attemptsPerTask;number++) {
        report.stopped=stop();if(report.stopped)break;
        const prompt=buildPrompt(fixture,arm,run.attempts.at(-1)?.quality);
        const runtime=await (dependencies.execute??shared.execute)(cwd,prompt,Object.keys(fixture.files),ROUTE);
        const quality=shared.qualityCheck(fixture,cwd,before);
        let currentHead=null;try{currentHead=shared.command('git',['rev-parse','HEAD'],cwd).trim();}catch{}
        quality.checks.gitHeadUnchanged=currentHead===initialHead;quality.checksTotal++;
        quality.checksPassed+=Number(quality.checks.gitHeadUnchanged);quality.passed&&=quality.checks.gitHeadUnchanged;
        const accepted=acceptedRuntime(runtime,quality);
        const attempt={number,promptSha256:hash(prompt),runtime,quality,accepted,
          failureKind:accepted?null:runtime.reason||runtime.exitCode!==0?'runtime_or_environment':'quality_or_scope',
          treatmentCompliant:treatment(arm,discovery,runtime)};
        run.attempts.push(attempt);run.accepted=accepted;
        run.finished=accepted||!repairable(runtime,quality)||number===LIMITS.attemptsPerTask;
        // Save usage/failure first so an artifact I/O error cannot erase spend.
        save();attempt.artifact=artifact(cwd,fixture,initialHead,artifactDirectory,run,attempt);save();
        process.stdout.write(JSON.stringify({order:run.order,caseId:fixture.id,arm,number,accepted,
          treatmentCompliant:attempt.treatmentCompliant,tokens:runtime.usage.input_output_tokens,failureKind:attempt.failureKind})+'\n');
        if(run.finished)break;
      }
    }
    report.stopped ||= stop();report.completedAt=new Date().toISOString();report.elapsedMs=Date.now()-started;save();
    process.stdout.write(JSON.stringify({report:options.output,status:report.assessment.status,
      complete:report.assessment.complete,comparable:report.assessment.comparable,stopped:report.stopped})+'\n');
  } catch(error) {
    report.stopped='RUNNER_ERROR';report.errorCode=/^[A-Z][A-Z0-9_:.-]*$/.test(error.message)?error.message:'UNEXPECTED_ERROR';save();throw error;
  } finally {fs.closeSync(fd);}
}
module.exports={ARMS,ROUTE,LIMITS,BRIEF,parseArgs,sequence,buildPrompt,inventory,costs,stopReason,treatment,
  acceptedRuntime,repairable,artifact,assess,main};
if(require.main===module)main().catch(error=>{
  process.stderr.write((/^[A-Z][A-Z0-9_:.-]*$/.test(error.message)?error.message:'WORKFLOW_RUNNER_FAILED')+'\n');process.exitCode=2;
});
