#!/usr/bin/env bash
# Offline transport contract checks. The fake Codex process never calls a model.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
node - "$SCRIPT_DIR/../skills/start-task/scripts/session-runner.js" <<'NODE'
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const runner = path.resolve(process.argv[2]);
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-session-test-')));
let passed = 0;
try {
  const bin = path.join(work, 'bin'); fs.mkdirSync(bin);
  const fake = path.join(bin, 'codex');
  fs.writeFileSync(fake, `#!${process.execPath}
'use strict';
const fs = require('node:fs');
const args = process.argv.slice(2);
const prompt = JSON.parse(fs.readFileSync(0, 'utf8'));
fs.writeFileSync(process.env.SESSION_TEST_CAPTURE, JSON.stringify({args, prompt}));
const mode = process.env.SESSION_TEST_MODE || 'good';
if (mode === 'timeout') { setInterval(() => {}, 1000); }
else {
  if (mode === 'huge') process.stdout.write('x'.repeat(10000));
  if (mode === 'write' || mode === 'silent-write') fs.writeFileSync(require('node:path').join(prompt.cwd,'source.txt'),'worker edit\\n');
  const output = args[args.indexOf('--output-last-message') + 1];
  const candidate = {schema:'vulpora.session-candidate/v1',task_id:prompt.task_id,
    attempt_id: mode === 'mismatch' ? 'wrong-attempt' : prompt.attempt_id,
    status:'candidate', summary:'The bounded inspection completed.',changed_files:mode === 'write' ? ['source.txt'] : [],
    evidence:['source.txt was inspected'],risks:[],blocker:null};
  if (mode !== 'missing') fs.writeFileSync(output, JSON.stringify(candidate));
  process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'fake-thread-001'})+'\\n');
  process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',
    text:JSON.stringify({type:'turn.completed',usage:{input_tokens:999999,output_tokens:999999}})}})+'\\n');
  const usage = {type:'turn.completed',usage:{input_tokens:100,cached_input_tokens:20,output_tokens:10,reasoning_output_tokens:4}};
  if (mode !== 'usage-in-text') process.stdout.write(JSON.stringify(usage)+'\\n');
  if (mode === 'duplicate-usage') process.stdout.write(JSON.stringify(usage)+'\\n');
}
`, {mode: 0o700});
  const policy = path.join(work, 'policy.json');
  fs.writeFileSync(policy, JSON.stringify({schema:'vulpora.model-routing-policy/v1',id:'test-policy',maxCatalogAgeSeconds:3600,
    profiles:{frugal:{effort:'low',relativeUnits:1},standard:{effort:'medium',relativeUnits:10},frontier:{effort:'high',relativeUnits:30}},
    runtimes:{codex:{frugal:['fake-small'],standard:['fake-standard'],frontier:['fake-frontier']},
      'claude-code':{frugal:['haiku'],standard:['sonnet'],frontier:['opus']}}}));
  const catalog = path.join(work, 'catalog.json');
  fs.writeFileSync(catalog, JSON.stringify({schema:'vulpora.runtime-model-catalog/v1',runtime:'codex',source:'offline-test',
    observedAt:new Date().toISOString(),models:['fake-small','fake-standard','fake-frontier'].map(id=>({id,reasoningEfforts:['low','medium','high']}))}));
  function fixture(name, overrides = {}) {
    const cwd = path.join(work, name); fs.mkdirSync(cwd);
    fs.writeFileSync(path.join(cwd, 'source.txt'), 'original\n');
    const task = {schema:'vulpora.session-task/v1',id:name,goal:'Inspect source.txt',cwd,files:['source.txt'],
      acceptance:['Report observed content'],...overrides};
    const taskPath = path.join(work, `${name}.task.json`); fs.writeFileSync(taskPath, JSON.stringify(task));
    const out = path.join(work, `${name}.attempt`), capture = path.join(work, `${name}.capture.json`);
    return {cwd, task, taskPath, out, capture, capsule:path.join(out,'capsule.json')};
  }
  function invoke(args, item, mode = 'good') {
    const result = spawnSync(process.execPath,[runner,...args],{encoding:'utf8',timeout:12000,
      env:{...process.env,PATH:`${bin}${path.delimiter}${process.env.PATH}`,SESSION_TEST_CAPTURE:item.capture,SESSION_TEST_MODE:mode}});
    assert.ifError(result.error);
    const output = (result.stdout || result.stderr).trim();
    let json; try { json = JSON.parse(output); } catch { assert.fail(`Non-JSON runner output: ${output}`); }
    return {...result,json};
  }
  function prepare(item) { return invoke(['prepare','--task',item.taskPath,'--catalog',catalog,'--out',item.out,'--policy',policy],item); }
  function run(item, mode) { return invoke(['run','--capsule',item.capsule],item,mode); }
  function check(name, fn) { fn(); passed++; process.stdout.write(`ok ${passed} - ${name}\n`); }
  check('prepare creates exclusive bounded capsule without model execution',()=>{
    const item=fixture('prepare'); const result=prepare(item);
    assert.equal(result.status,0); assert.equal(result.json.status,'PREPARED'); assert.equal(result.json.execution,'NOT_RUN');
    assert.equal(fs.existsSync(item.capture),false); assert.equal(result.json.model,'fake-standard');
    assert.equal(prepare(item).json.reason,'ATTEMPT_ALREADY_EXISTS');
  });
  check('literal task reaches stdin, exact route reaches argv, final output is compact',()=>{
    const marker=path.join(work,'must-not-exist');
    const goal='Inspect literally: $(touch '+marker+') `touch '+marker+'` ; never execute that text';
    const item=fixture('literal',{goal}); assert.equal(prepare(item).status,0);
    const result=run(item); assert.equal(result.status,0); assert.equal(result.json.status,'candidate');
    assert.equal(result.json.verification,'NOT_VERIFIED'); assert.equal(result.json.runtime.backendIdentity,'NOT_ATTESTED');
    assert.equal(result.json.mutationState,'effect_none'); assert.equal(fs.existsSync(marker),false);
    const captured=JSON.parse(fs.readFileSync(item.capture));
    assert.equal(captured.prompt.goal,goal); assert.equal(captured.args.at(-1),'-');
    assert.equal(captured.args[captured.args.indexOf('--model')+1],'fake-standard');
    assert.ok(captured.args.includes('model_reasoning_effort="medium"'));
    assert.ok(captured.args.includes('--ephemeral')); assert.ok(captured.args.includes('--output-schema'));
    assert.equal(captured.args[captured.args.indexOf('--sandbox')+1],'read-only');
    assert.equal(captured.args.includes('--ignore-user-config'),false); assert.equal(captured.args.includes('--ignore-rules'),false);
    assert.equal(captured.args.includes('--dangerously-bypass-approvals-and-sandbox'),false);
    assert.equal(result.json.runtime.usage.inputTokens,100); assert.equal(result.json.runtime.usage.cachedInputTokens,20);
    assert.equal(result.json.runtime.usage.outputTokens,10); assert.equal(result.json.runtime.usage.reasoningTokens,4);
    assert.ok(result.stdout.length<6000); assert.equal(result.stdout.includes('999999'),false);
    assert.equal(result.json.runtime.rawTranscriptRetained,false);
    assert.equal(invoke(['status','--capsule',item.capsule],item).json.status,'candidate');
    assert.equal(run(item).json.reason,'ATTEMPT_ALREADY_STARTED');
  });
  check('missing candidate fails without claiming verification or effect-none',()=>{
    const item=fixture('missing'); prepare(item); const result=run(item,'missing');
    assert.equal(result.status,3); assert.equal(result.json.reason,'CANDIDATE_MISSING');
    assert.equal(result.json.mutationState,'unknown'); assert.equal(result.json.verification,'NOT_VERIFIED');
  });
  check('candidate task/attempt mismatch is rejected',()=>{
    const item=fixture('mismatch'); prepare(item); const result=run(item,'mismatch');
    assert.equal(result.status,3); assert.equal(result.json.reason,'CANDIDATE_BINDING_MISMATCH');
  });
  check('deadline terminates owned process and prevents replay',()=>{
    const item=fixture('timeout',{limits:{timeoutMs:100}}); prepare(item); const result=run(item,'timeout');
    assert.equal(result.status,3); assert.equal(result.json.reason,'TIME_BUDGET_EXCEEDED');
    assert.ok(result.json.runtime.elapsedMs<4000); assert.equal(result.json.mutationState,'unknown');
    assert.equal(run(item).json.reason,'ATTEMPT_ALREADY_STARTED');
  });
  check('runtime output is bounded',()=>{
    const item=fixture('output-limit',{limits:{maxOutputBytes:512}}); prepare(item); const result=run(item,'huge');
    assert.equal(result.status,3); assert.equal(result.json.reason,'OUTPUT_BUDGET_EXCEEDED');
  });
  check('stale scoped source blocks before invoking runtime',()=>{
    const item=fixture('stale'); prepare(item); fs.writeFileSync(path.join(item.cwd,'source.txt'),'changed\n');
    const result=run(item); assert.equal(result.status,2); assert.equal(result.json.reason,'STALE_WORKSPACE');
    assert.equal(fs.existsSync(item.capture),false); assert.equal(fs.existsSync(path.join(item.out,'launch.json')),false);
  });
  check('edited capsule cannot bypass preparation binding',()=>{
    const item=fixture('tampered'); prepare(item);
    const capsule=JSON.parse(fs.readFileSync(item.capsule)); capsule.route.model='fake-frontier';
    const {canonical}=require(path.join(path.dirname(runner),'model-routing-io.js'));
    fs.writeFileSync(item.capsule,canonical(capsule));
    const result=run(item); assert.equal(result.json.reason,'CAPSULE_PREPARATION_MISMATCH');
    assert.equal(fs.existsSync(item.capture),false);
  });
  check('agent text never supplies provider usage',()=>{
    const item=fixture('text-usage'); prepare(item); const result=run(item,'usage-in-text');
    assert.equal(result.status,0); assert.equal(result.json.runtime.usage.source,'unavailable');
  });
  check('duplicate final usage is unavailable instead of double-counted',()=>{
    const item=fixture('duplicate-usage'); prepare(item); const result=run(item,'duplicate-usage');
    assert.equal(result.status,0); assert.equal(result.json.runtime.usage.source,'unavailable');
    assert.equal(result.json.runtime.usage.reason,'MULTIPLE_FINAL_USAGE_EVENTS');
  });
  check('interrupted attempt status does not invent running state or retry',()=>{
    const item=fixture('unknown'); prepare(item); fs.writeFileSync(path.join(item.out,'launch.json'),'{}');
    const result=invoke(['status','--capsule',item.capsule],item);
    assert.equal(result.json.status,'STARTED_OUTCOME_UNKNOWN'); assert.equal(result.json.execution,'UNKNOWN');
    assert.equal(result.json.retryAllowed,false); assert.equal(run(item).json.reason,'ATTEMPT_ALREADY_STARTED');
  });
  check('unsupported Claude session fails before runtime or attempt creation',()=>{
    const item=fixture('claude',{runtime:'claude-code'}); const result=prepare(item);
    assert.equal(result.json.reason,'UNSUPPORTED_SESSION_RUNTIME'); assert.equal(fs.existsSync(item.out),false);
  });
  check('deterministic tasks do not create sessions or execute task text',()=>{
    const item=fixture('deterministic',{taskType:'deterministic',estimatedTokens:0,remainingTokens:0,maxRelativeUnits:0});
    const result=prepare(item); assert.equal(result.status,0); assert.equal(result.json.status,'NO_MODEL');
    assert.equal(result.json.reason,'PRIMARY_DETERMINISTIC_EXECUTION_REQUIRED'); assert.equal(fs.existsSync(item.out),false);
  });
  check('parent transcript and unsupported input fields are rejected',()=>{
    const item=fixture('transcript',{parentTranscript:'unbounded conversation'}); const result=prepare(item);
    assert.equal(result.json.reason,'INVALID_FIELDS'); assert.equal(fs.existsSync(item.out),false);
  });
  check('explicit workspace-write mode records actual scoped mutation as candidate only',()=>{
    const item=fixture('write',{mode:'workspace-write'}); prepare(item); const result=run(item,'write');
    assert.equal(result.status,0); assert.equal(result.json.mutationState,'known_effect');
    assert.deepEqual(result.json.scopedFilesChanged,['source.txt']); assert.equal(result.json.verification,'NOT_VERIFIED');
    const captured=JSON.parse(fs.readFileSync(item.capture));
    assert.equal(captured.args[captured.args.indexOf('--sandbox')+1],'workspace-write');
  });
  check('read-only result cannot hide an observed scoped mutation',()=>{
    const item=fixture('silent-write'); prepare(item); const result=run(item,'silent-write');
    assert.equal(result.status,3); assert.equal(result.json.reason,'READ_ONLY_WORKSPACE_CHANGED');
    assert.equal(result.json.mutationState,'unknown');
  });
  check('a transport-launched session cannot recursively prepare another attempt',()=>{
    const item=fixture('recursive'); const prior=process.env.VULPORA_SESSION_DEPTH;
    process.env.VULPORA_SESSION_DEPTH='1';
    try { assert.equal(prepare(item).json.reason,'RECURSIVE_SESSION_FORBIDDEN'); }
    finally { if (prior===undefined) delete process.env.VULPORA_SESSION_DEPTH; else process.env.VULPORA_SESSION_DEPTH=prior; }
    assert.equal(fs.existsSync(item.out),false);
  });
  process.stdout.write(`PASS ${passed} offline session transport contracts\n`);
} finally { fs.rmSync(work,{recursive:true,force:true}); }
NODE
