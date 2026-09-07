#!/usr/bin/env node
'use strict';

// An explicitly invoked live pilot, never part of the offline test inventory.
// Same task/model/effort, fresh fixtures, counterbalanced off/on then on/off.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {canonical, hash} = require('../../skills/start-task/scripts/model-routing-io.js');
const {collectCodexModelCatalog} = require('../../skills/start-task/scripts/codex-model-catalog.js');
const {parseUsage} = require('../behavioral/adapters/provider-usage.cjs');
const ROOT = path.resolve(__dirname, '../..');
const TASK = 'Add isPositive(value) to src/numbers.js and regression tests to test/numbers.test.js. '
  + 'Return true only for finite numeric values strictly greater than zero; return false for zero, negatives, '
  + 'NaN, infinities and non-number input. Preserve absolute(value). Run node --test. '
  + 'Only these two files may change. Work directly: do not delegate, start other coding sessions, commit, '
  + 'install dependencies, access the network or perform external writes. Finish with a concise summary and test result.';
const SOURCE = '"use strict";\nfunction absolute(value) { return value < 0 ? -value : value; }\nmodule.exports = { absolute };\n';
const TEST = '"use strict";\nconst test=require("node:test");\nconst assert=require("node:assert/strict");\n'
  + 'const {absolute}=require("../src/numbers.js");\ntest("absolute stays available",()=>assert.equal(absolute(-2),2));\n';
const COMMON_CONFIG = ['-c','approval_policy="never"','-c','web_search="disabled"',
  '-c','tool_output_token_limit=2000','--disable','multi_agent','--disable','multi_agent_v2'];

function command(binary, args, cwd, options = {}) {
  const result = spawnSync(binary, args, {cwd, encoding:'utf8', timeout:30000, maxBuffer:4*1024*1024, ...options});
  if (result.error || result.status !== 0) throw new Error(`COMMAND_FAILED:${path.basename(binary)}:${result.status}`);
  return result.stdout;
}
function texts(input) {
  return input.flatMap(item => (item.content || []).filter(part => part.type === 'input_text').map(part => part.text));
}
function preflight(cwd, prompt, model, effort, vulporaSkills) {
  const input = JSON.parse(command('codex', ['debug','prompt-input',...COMMON_CONFIG,
    '-c',`model="${model}"`,'-c',`model_reasoning_effort="${effort}"`,prompt], cwd));
  const context = texts(input);
  const skillIds = [...new Set(context.flatMap(text => text.split('\n')
    .filter(line => line.includes('SKILL.md')).map(line => /^\s*- ([a-z0-9][a-z0-9:-]*):/.exec(line)?.[1]).filter(Boolean)))].sort();
  return {skillIds, vulporaSkills:skillIds.filter(id => vulporaSkills.includes(id)),
    renderedInputBytes:Buffer.byteLength(canonical(input)), renderedInputSha256:hash(canonical(input)),
    startTaskEntryInjected:context.some(text=>text.includes('# Start Task — choose the lightest safe execution path')),
    source:'codex debug prompt-input; no model turn', rawContextRetained:false};
}
function files(cwd, directory = cwd) {
  const result = {};
  for (const item of fs.readdirSync(directory, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (item.name === '.git') continue;
    const absolute=path.join(directory,item.name), relative=path.relative(cwd,absolute);
    if(item.isSymbolicLink()) throw new Error('SYMLINK_FIXTURE');
    if(item.isDirectory()) Object.assign(result,files(cwd,absolute));
    else result[relative]=hash(fs.readFileSync(absolute));
  }
  return result;
}
async function execute(cwd, prompt, model, effort, finalPath) {
  const args=['exec','--ephemeral','--strict-config','--json','--color','never','--cd',cwd,
    '--model',model,'-c',`model_reasoning_effort="${effort}"`,'--sandbox','workspace-write',
    ...COMMON_CONFIG,'--output-last-message',finalPath,'-'];
  const started=Date.now(), child=spawn('codex',args,{cwd,detached:true,shell:false,stdio:['pipe','pipe','pipe']});
  let stream='',errorBytes=0,bytes=0,reason=null,killTimer;
  function stop(value) { reason ||= value; try{process.kill(-child.pid,'SIGTERM');}catch{}
    killTimer ||= setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},500); }
  const timer=setTimeout(()=>stop('TIME_LIMIT'),180000);
  const interrupt=()=>stop('INTERRUPTED');process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{bytes+=Buffer.byteLength(chunk);
    if(bytes>8*1024*1024) stop('OUTPUT_LIMIT');else stream+=chunk;});
  child.stderr.on('data',chunk=>{errorBytes+=chunk.length;if(errorBytes>1024*1024)stop('ERROR_OUTPUT_LIMIT');});
  child.stdin.on('error',()=>stop('INPUT_FAILED'));
  child.stdin.end(prompt);
  const completion=await new Promise(resolve=>{child.on('error',()=>{reason||='START_FAILED';});
    child.on('close',(exitCode,signal)=>resolve({exitCode,signal}));});
  clearTimeout(timer);clearTimeout(killTimer);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
  const usage=parseUsage('codex',stream,{invocationFailed:!!reason||completion.exitCode!==0});
  const events=stream.split(/\r?\n/).filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return {};}});
  const commands=events.filter(event=>event.type==='item.completed'&&event.item?.type==='command_execution').map(event=>event.item);
  const selector=commands.find(item=>{
    if(!/\bnode\s+[^;\n]*select-execution-profile\.js/.test(item.command||'')||item.exit_code!==0)return false;
    try { const decision=JSON.parse((item.aggregated_output||'').trim());
      return decision.schema==='vulpora.start-task-profile-decision/v1'&&decision.profile==='lightweight';
    }catch{return false;}
  });
  const entryRead=commands.some(item=>/start-task\/SKILL\.md/.test(item.command||'')&&item.exit_code===0);
  const pathRead=commands.some(item=>/lightweight-path\.md/.test(item.command||'')&&item.exit_code===0);
  const unexpectedChild=commands.some(item=>/\bcodex\s+exec\b|session-runner\.js\s+run|vulpora\s+session\s+run/.test(item.command||''))
    || events.some(event=>/collab|spawn_agent/.test(event.item?.type||''));
  return {...completion,reason,usage,elapsedMs:Date.now()-started,commandCount:commands.length,outputBytes:bytes,
    stderrBytes:errorBytes,retainedStreamSha256:hash(stream),streamTruncated:bytes>8*1024*1024,rawRuntimeRetained:false,
    harnessEvidence:{entryRead,lightweightPathRead:pathRead,lightweightSelectorExecuted:!!selector},
    unexpectedChild};
}
function verify(cwd, before) {
  const after=files(cwd), allowed=['src/numbers.js','test/numbers.test.js'];
  const changed=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(file=>before[file]!==after[file]);
  let testsPassed=false,oraclePassed=false,mutantChecksPassed=false;
  try { command('node',['--test'],cwd);testsPassed=true; }catch{}
  try { command('node',['-e',`const a=require('node:assert/strict'),m=require('./src/numbers.js');
    for(const x of [1,0.1,42])a.equal(m.isPositive(x),true);
    for(const x of [-1,0,-0,NaN,Infinity,-Infinity,'1',true,null,undefined,{}])a.equal(m.isPositive(x),false);
    a.equal(m.absolute(-2),2);a.equal(m.absolute(0),0);a.equal(m.absolute(5),5);
    a.match(require('node:fs').readFileSync('test/numbers.test.js','utf8'),/isPositive/);`],cwd);oraclePassed=true; }catch{}
  if(testsPassed&&oraclePassed) {
    mutantChecksPassed=[true,false].every(value=>{
      const preload=path.join(path.dirname(cwd),`mutant-${value}.cjs`);
      fs.writeFileSync(preload,`const M=require('node:module'),load=M._load;M._load=function(name,parent,main){
        const value=load.apply(this,arguments);return M._resolveFilename(name,parent)===${JSON.stringify(path.join(cwd,'src/numbers.js'))}
          ?{...value,isPositive:()=>${value}}:value;};`);
      const result=spawnSync('node',['--require',preload,'--test'],{cwd,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
      return !result.error&&result.status===1&&/AssertionError|ERR_ASSERTION/.test(result.stdout+result.stderr);
    });
  }
  return {testsPassed,oraclePassed,mutantChecksPassed,onlyAllowedFilesChanged:changed.every(file=>allowed.includes(file)),changedFiles:changed};
}
function average(runs, key) {
  return runs.some(run=>run.runtime.usage[key]===null)?null:runs.reduce((sum,run)=>sum+run.runtime.usage[key],0)/runs.length;
}
async function main() {
  const args=process.argv.slice(2);
  if(args.length!==3||args[0]!=='--run'||args[1]!=='--out') {
    process.stdout.write('Live model calls: node evals/token-efficiency/run-harness-ab.js --run --out <new-report.json>\n');return;
  }
  const output=path.resolve(args[2]);if(fs.existsSync(output))throw new Error('REPORT_ALREADY_EXISTS');
  const model='gpt-5.6-terra',effort='medium';
  const catalog=await collectCodexModelCatalog();
  if(!catalog.models.some(item=>item.id===model&&item.reasoningEfforts.includes(effort)))throw new Error('ROUTE_UNAVAILABLE');
  const work=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-harness-ab-')));
  const version=command('codex',['--version'],ROOT).trim();
  const vulporaSkills=fs.readdirSync(path.join(ROOT,'skills')).filter(id=>fs.existsSync(path.join(ROOT,'skills',id,'SKILL.md')));
  const report={schema:'vulpora.harness-ab/v1',createdAt:new Date().toISOString(),runtime:version,model,effort,
    design:'two matched pairs, off/on then on/off; fixed single-agent task',task:TASK,
    fixtureSha256:hash(canonical({source:SOURCE,test:TEST})),
    harness:'project installation of all Vulpora agents/skills plus explicit start-task invocation',
    commonConfig:COMMON_CONFIG,cacheControl:'shared provider cache; order counterbalanced, not isolated',
    accountingScope:'entire isolated primary turn; benchmark coordinator/installation/verification use deterministic tools',
    limitations:['one tiny task and two repeats per arm, not a general benchmark','independent-session routing not exercised',
      'requested model and effort, backend identity not attested','no USD pricing or billing-savings claim'],runs:[]};
  const sequence=['off','on','on','off'],prepared=[];
  // Prove discovery/isolation in every arm before paying for any model turn.
  for(let index=0;index<sequence.length;index++) {
    const arm=sequence[index],runRoot=path.join(work,`run-${index+1}`),cwd=path.join(runRoot,'workspace');
    fs.mkdirSync(path.join(cwd,'src'),{recursive:true});fs.mkdirSync(path.join(cwd,'test'));
    fs.writeFileSync(path.join(cwd,'src/numbers.js'),SOURCE);fs.writeFileSync(path.join(cwd,'test/numbers.test.js'),TEST);
    command('git',['init','--quiet'],cwd);command('git',['add','.'],cwd);
    command('git',['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','-m','fixture'],cwd);
    if(arm==='on') command(path.join(ROOT,'vulpora'),['setup','--runtime','codex','--scope','project','--target',cwd,'all-agents','all-skills'],ROOT,{timeout:120000});
    if(arm==='on') {
      command('git',['add','-A'],cwd);
      command('git',['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','--allow-empty','-m','harness fixture'],cwd);
    }
    if(command('git',['status','--porcelain'],cwd).trim())throw new Error('DIRTY_INITIAL_FIXTURE');
    const prompt=arm==='on'?'$start-task\n'+TASK:TASK;
    const discovery=preflight(cwd,prompt,model,effort,vulporaSkills);
    if(arm==='off'&&discovery.vulporaSkills.length)throw new Error('BASELINE_CONTAMINATED');
    if(arm==='on'&&!discovery.vulporaSkills.includes('start-task'))throw new Error('HARNESS_NOT_DISCOVERED');
    const before=files(cwd);
    prepared.push({index,arm,cwd,runRoot,prompt,discovery,before});
  }
  process.stdout.write(JSON.stringify({preflight:'PASS',runs:prepared.map(run=>({arm:run.arm,
    discoveredVulporaSkills:run.discovery.vulporaSkills.length,renderedInputBytes:run.discovery.renderedInputBytes}))})+'\n');
  for(const {index,arm,cwd,runRoot,prompt,discovery,before} of prepared) {
    if(report.runs.some(run=>run.runtime.usage.usage_status!=='observed'||run.runtime.unexpectedChild)
      || report.runs.reduce((sum,run)=>sum+(run.runtime.usage.input_output_tokens||0),0)>450000) {
      report.stopped='USAGE_UNAVAILABLE_CHILD_OR_PILOT_BUDGET';break;
    }
    const runtime=await execute(cwd,prompt,model,effort,path.join(runRoot,'final.txt'));
    const quality=verify(cwd,before);
    const compliant=arm==='off'||((discovery.startTaskEntryInjected||runtime.harnessEvidence.entryRead)
      &&runtime.harnessEvidence.lightweightPathRead&&runtime.harnessEvidence.lightweightSelectorExecuted);
    const run={order:index+1,pair:Math.floor(index/2)+1,arm,promptBytes:Buffer.byteLength(prompt),
      initialFilesSha256:hash(canonical(before)),
      discovery,runtime,quality,treatmentCompliant:compliant};
    report.runs.push(run);fs.writeFileSync(output,JSON.stringify(report,null,2));
    process.stdout.write(JSON.stringify({order:run.order,arm,usage:runtime.usage,quality,treatmentCompliant:compliant})+'\n');
  }
  if(report.runs.length===4&&report.runs.every(run=>run.runtime.usage.usage_status==='observed')) {
    report.means={};for(const arm of ['off','on']) {
      const runs=report.runs.filter(run=>run.arm===arm);report.means[arm]={};
      for(const key of ['input_tokens','cached_input_tokens','uncached_input_tokens','output_tokens','input_output_tokens'])report.means[arm][key]=average(runs,key);
    }
    report.totalTokenRatio=report.means.on.input_output_tokens/report.means.off.input_output_tokens;
    report.totalTokenChangePercent=(report.totalTokenRatio-1)*100;
  }
  report.comparable=report.runs.length===4&&report.runs.every(run=>run.runtime.usage.usage_status==='observed'
    &&run.treatmentCompliant&&!run.runtime.unexpectedChild
    &&run.runtime.exitCode===0&&Object.entries(run.quality).filter(([key])=>key!=='changedFiles').every(([,value])=>value));
  fs.writeFileSync(output,JSON.stringify(report,null,2));
  process.stdout.write(JSON.stringify({report:output,workspaces:work,comparable:report.comparable,
    means:report.means,totalTokenChangePercent:report.totalTokenChangePercent})+'\n');
}
module.exports={preflight,verify};
if(require.main===module)main().catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=2;});
