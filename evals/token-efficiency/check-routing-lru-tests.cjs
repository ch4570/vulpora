#!/usr/bin/env node
'use strict';
// Supplemental contract fault grid defined without inspecting candidate code or
// test output. Each arm's tests face exactly the same reference and eight faults.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw new Error(code);};
const REFERENCE=`'use strict';
class LRUCache {
  constructor(capacity){if(!Number.isInteger(capacity)||capacity<=0)throw new RangeError('capacity');this.capacity=capacity;this.items=new Map();}
  set(key,value){this.items.delete(key);this.items.set(key,value);if(this.items.size>this.capacity)this.items.delete(this.items.keys().next().value);return this;}
  get(key){if(!this.items.has(key))return undefined;const value=this.items.get(key);this.items.delete(key);this.items.set(key,value);return value;}
  has(key){return this.items.has(key);}
  get size(){return this.items.size;}
}
module.exports={LRUCache};\n`;
const definitions=[
  ['invalid-capacity-accepted',"if(!Number.isInteger(capacity)||capacity<=0)throw new RangeError('capacity');",''],
  ['set-does-not-refresh','set(key,value){this.items.delete(key);','set(key,value){'],
  ['get-does-not-refresh','const value=this.items.get(key);this.items.delete(key);this.items.set(key,value);','const value=this.items.get(key);'],
  ['has-refreshes','has(key){return this.items.has(key);}','has(key){const hit=this.items.has(key);if(hit)this.get(key);return hit;}'],
  ['missing-get-inserts-undefined','if(!this.items.has(key))return undefined;','if(!this.items.has(key)){this.items.set(key,undefined);return undefined;}'],
  ['has-loses-stored-undefined','has(key){return this.items.has(key);}','has(key){return this.items.get(key)!==undefined;}'],
  ['evicts-newest','this.items.keys().next().value','[...this.items.keys()].at(-1)'],
  ['falsy-get-lost','return value;','return value||undefined;'],
];
const MUTANTS=Object.freeze(definitions.map(([id,from,to])=>{
  if(REFERENCE.split(from).length!==2)fail('AMBIGUOUS_MUTATION');
  return Object.freeze({id,source:REFERENCE.replace(from,to)});
}));

function evaluateTests(testSource) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-lru-sensitivity-'));
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const run=(id,source)=>{
    const cwd=path.join(root,id);fs.mkdirSync(path.join(cwd,'src'),{recursive:true});fs.mkdirSync(path.join(cwd,'test'));
    fs.writeFileSync(path.join(cwd,'src/lru.js'),source);fs.writeFileSync(path.join(cwd,'test/lru.test.js'),testSource);
    const result=spawnSync(process.execPath,['--test','test/lru.test.js'],{cwd,env,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
    const assertionFailure=!result.error&&result.status===1&&/ERR_ASSERTION|AssertionError/.test((result.stdout||'')+(result.stderr||''));
    return {passed:!result.error&&result.status===0,assertionFailure,exitCode:result.status,
      processError:result.error?.code||null,stdoutSha256:hash(result.stdout||''),stderrSha256:hash(result.stderr||'')};
  };
  try {
    const control=run('reference',REFERENCE);
    const mutants=MUTANTS.map(({id,source})=>{const result=run(id,source);return {id,...result,
      outcome:!control.passed?'invalid':result.passed?'survived':result.assertionFailure?'detected':'invalid'};});
    return {control,validControl:control.passed,detectedCount:control.passed?mutants.filter(item=>item.outcome==='detected').length:null,
      totalMutants:MUTANTS.length,mutants};
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
function verifyCandidate(report,workspaceRoot,run) {
  if(report?.schema!=='vulpora.routing-ab/v1'||run.caseId!=='lru-cache'||!run.finished
    ||!Number.isSafeInteger(run.order)||run.order<1||!Array.isArray(run.attempts)||!run.attempts.length)fail('INCOMPLETE_LRU_RUN');
  const final=run.attempts.at(-1),cwd=path.join(fs.realpathSync(workspaceRoot),`run-${run.order}`,'workspace');
  if(final.afterFiles?.completed!==true)fail('MISSING_FINAL_HASHES');
  const contents={},hashes={};
  for(const name of ['src/lru.js','test/lru.test.js']) {
    const file=path.join(cwd,name);
    if(!fs.lstatSync(file).isFile()||!fs.realpathSync(file).startsWith(cwd+path.sep))fail('UNSAFE_CANDIDATE_FILE');
    contents[name]=fs.readFileSync(file,'utf8');hashes[name]=hash(contents[name]);
    if(hashes[name]!==final.afterFiles.files?.[name])fail('CANDIDATE_HASH_MISMATCH');
  }
  return {hashes,testSource:contents['test/lru.test.js']};
}
function main(args=process.argv.slice(2)) {
  if(!args.length||(args.length===1&&args[0]==='--help'))return process.stdout.write('node check-routing-lru-tests.cjs --report <routing.json> --workspace-root <run-root> --out <new.json>\n');
  const options={};for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];
    if(!['--report','--workspace-root','--out'].includes(key)||Object.hasOwn(options,key)||!value||value.startsWith('--'))fail('INVALID_ARGUMENTS');options[key]=value;}
  if(Object.keys(options).length!==3)fail('MISSING_ARGUMENTS');
  if(fs.existsSync(options['--out']))fail('REPORT_ALREADY_EXISTS');
  const raw=fs.readFileSync(options['--report'],'utf8'),report=JSON.parse(raw);
  const runs=report.runs.filter(run=>run.caseId==='lru-cache');
  if(runs.length!==3||new Set(runs.map(run=>run.arm)).size!==3||runs.some(run=>!['baseline','luna','routed'].includes(run.arm)))fail('THREE_LRU_ARMS_REQUIRED');
  // Verify every candidate before any candidate tests execute.
  const candidates=runs.map(run=>({run,...verifyCandidate(report,options['--workspace-root'],run)}));
  const output={schema:'vulpora.routing-lru-test-sensitivity/v1',createdAt:new Date().toISOString(),sourceReportSha256:hash(raw),
    sourceReportCompleteAtRead:report.complete===true,sourceReportHashScope:'snapshot at diagnostic start; completed LRU run records are bound separately',
    diagnosticSourceSha256:hash(fs.readFileSync(__filename)),referenceSha256:hash(REFERENCE),
    scope:'Supplemental sensitivity of generated regression tests to eight shared contract faults; not fixed acceptance, candidate implementation correctness, or general model quality',
    design:'Independent common reference and all eight faults fixed from the public fixture contract before inspecting candidate outputs; isolated process and fixture copy for every control and mutant',
    limitations:['Small supported fault grid; no population quality inference','A failing reference control invalidates an arm sensitivity score','Survivors and non-assertion failures are retained; original acceptance outcomes are unchanged'],
    faultGrid:MUTANTS.map(({id,source})=>({id,sourceSha256:hash(source)})),
    arms:candidates.map(({run,hashes,testSource})=>({arm:run.arm,order:run.order,repeat:run.repeat,
      originalAccepted:run.accepted,finalModel:run.attempts.at(-1).route.model,candidateRunRecordSha256:hash(JSON.stringify(run)),candidateHashes:hashes,...evaluateTests(testSource)}))};
  fs.mkdirSync(path.dirname(path.resolve(options['--out'])),{recursive:true});fs.writeFileSync(options['--out'],JSON.stringify(output,null,2)+'\n',{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({report:path.resolve(options['--out']),arms:output.arms.map(({arm,validControl,detectedCount,totalMutants})=>({arm,validControl,detectedCount,totalMutants}))})+'\n');return output;
}
module.exports={REFERENCE,MUTANTS,evaluateTests,verifyCandidate,main};
if(require.main===module)try{main();}catch(error){process.stderr.write((/^[A-Z_]+$/.test(error.message)?error.message:'LRU_DIAGNOSTIC_FAILED')+'\n');process.exitCode=2;}
