'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {summarizeInvocations,summarizeTaskRuns,calculatePayback}=require('./workflow-accounting.cjs');

const usage=(input=100,output=10)=>({usage_status:'observed',input_tokens:input,cached_input_tokens:0,
  output_tokens:output,cache_creation_input_tokens:0});
const record=(invocationId,overrides={})=>({invocationId,purpose:'implementation',model:'gpt-5.6-terra',usage:usage(),...overrides});
const summarize=records=>summarizeInvocations({expectedInvocationIds:[...new Set(records.map(value=>value.invocationId))],records});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-12,`${actual} != ${expected}`);

test('self-only parent, child, repair and verification usage are all counted once',()=>{
  const parent=record('parent',{purpose:'coordination'});
  const child=record('child',{parentInvocationId:'parent',purpose:'child'});
  const result=summarize([parent,child,record('repair',{purpose:'repair'}),record('verify',{purpose:'verification'}),{...child}]);
  assert.equal(result.totalTokens,440); assert.equal(result.duplicateSnapshots,1); assert.equal(result.complete,true);
  assert.equal(result.perPurpose.verification.accountedSubtotalTokens,110);
  near(result.standard.totalUsd.minUsd,0.00128); near(result.fast.totalUsd.minUsd,0.00256);
});

test('explicit inclusive parent snapshot covers descendants without charging their snapshots twice',()=>{
  const result=summarize([record('p',{purpose:'coordination',coverageInvocationIds:['p','c'],usage:usage(250,30)}),
    record('c',{parentInvocationId:'p',purpose:'child',usage:usage(150,20)})]);
  assert.equal(result.totalTokens,280); assert.deepEqual(result.selectedInvocationIds,['p']);
  assert.equal(result.perPurpose.coordination.inclusiveAccountingRecords,1);
  assert.equal(result.perPurpose.child.accountedSubtotalTokens,0);
});

test('inclusive ancestor coverage and descendant accounting scope may not partially overlap',()=>{
  const result=summarize([record('p',{coverageInvocationIds:['p','c']}),
    record('c',{parentInvocationId:'p',coverageInvocationIds:['c','g']}),record('g',{parentInvocationId:'c'})]);
  assert.equal(result.totalTokens,null); assert.ok(result.errors.some(value=>value.code==='partial_coverage_overlap'));
});

test('coverage must be descendant-contained, explicit, unique and use one model tariff',()=>{
  for (const records of [
    [record('p',{coverageInvocationIds:['p','c']}),record('c')],
    [record('p',{coverageInvocationIds:['p','c']}),record('c',{parentInvocationId:'p',model:'gpt-6-astra'})],
    [record('p',{coverageInvocationIds:['p','p']})],
    [record('p',{parentInvocationId:'c'}),record('c',{parentInvocationId:'p'})],
  ]) assert.equal(summarize(records).complete,false);
});

test('inclusive usage cannot be smaller than disjoint known child subtotals',()=>{
  const result=summarize([record('p',{coverageInvocationIds:['p','a','b'],usage:usage(150,20)}),
    record('a',{parentInvocationId:'p'}),record('b',{parentInvocationId:'p'})]);
  assert.equal(result.totalTokens,null); assert.ok(result.errors.some(value=>value.code==='inconsistent_inclusive_usage'));
  assert.equal(result.observedSubtotalTokens,220);
});

test('conflicting duplicate snapshots fail closed but unrelated known usage is retained',()=>{
  const result=summarize([record('p'),record('p',{usage:usage(200)}),record('verify',{purpose:'verification'})]);
  assert.equal(result.totalTokens,null); assert.equal(result.observedSubtotalTokens,110);
  assert.ok(result.errors.some(value=>value.code==='conflicting_snapshot'));
});

test('unknown invocation and usage contaminate totals without becoming zero',()=>{
  const result=summarizeInvocations({expectedInvocationIds:['p','child','missing'],records:[record('p'),record('child',{usage:null})]});
  assert.equal(result.totalTokens,null); assert.equal(result.observedSubtotalTokens,110);
  assert.deepEqual(result.unknownInvocationIds,['missing']); assert.deepEqual(result.unknownUsageIds,['child']);
  assert.equal(result.standard.totalUsd,null); assert.ok(result.standard.observedSubtotalUsd.minUsd>0);
});

test('inclusive parent does not conceal unknown usage of an expected child',()=>{
  const result=summarize([record('p',{coverageInvocationIds:['p','c']}),record('c',{parentInvocationId:'p',usage:null})]);
  assert.equal(result.totalTokens,null); assert.equal(result.observedSubtotalTokens,110);
  assert.deepEqual(result.unknownUsageIds,['c']);
});

test('unknown parent retains a known child self-only subtotal',()=>{
  const result=summarize([record('p',{coverageInvocationIds:['p','c'],usage:null}),record('c',{parentInvocationId:'p'})]);
  assert.equal(result.totalTokens,null); assert.equal(result.observedSubtotalTokens,110);
});

test('cache and reasoning subsets are not added to totals; unknown writes produce cost ranges',()=>{
  const result=summarize([record('p',{usage:{...usage(1000,100),cached_input_tokens:600,reasoning_tokens:80,
    cache_creation_input_tokens:null}})]);
  assert.equal(result.totalTokens,1100); near(result.standard.totalUsd.minUsd,0.00212);
  near(result.standard.totalUsd.maxUsd,0.00232);
  assert.equal(summarize([record('bad',{usage:{...usage(),cached_input_tokens:101}})]).totalTokens,null);
});

test('unknown model preserves measured tokens, not an inherited cheap cost',()=>{
  for (const model of ['unknown',null,undefined,'']) {
    const result=summarize([record('p',{model})]);
    assert.equal(result.totalTokens,110); assert.equal(result.standard.totalUsd,null);
    assert.deepEqual(result.unknownPricingIds,['p']); assert.equal(result.complete,false);
  }
});

test('malformed attempt records fail closed instead of throwing or accepting forged success',()=>{
  const result=summarizeTaskRuns({expectedInvocationIds:['a'],records:[record('a')],runs:[
    {runId:'a',finished:true,accepted:true,attempts:[null]}]});
  assert.equal(result.complete,false); assert.equal(result.tokensPerAcceptedTask,null);
  assert.ok(result.runErrors.includes('invalid_attempt'));
});

test('failed repairs remain charged and first-pass success stays distinct from final success',()=>{
  const records=['a1','a2','a3','b1','b2'].map(value=>record(value));
  const result=summarizeTaskRuns({expectedInvocationIds:records.map(value=>value.invocationId),records,runs:[
    {runId:'a',finished:true,accepted:true,attempts:[{accepted:false,invocationIds:['a1']},
      {accepted:false,invocationIds:['a2']},{accepted:true,invocationIds:['a3']}]},
    {runId:'b',finished:true,accepted:false,attempts:[{accepted:false,invocationIds:['b1']},{accepted:false,invocationIds:['b2']}]},
  ]});
  assert.equal(result.totalTokens,550); assert.equal(result.repairAttempts,3); assert.equal(result.attemptCount,5);
  assert.equal(result.firstPassAcceptanceRate,0); assert.equal(result.acceptanceRate,0.5);
  assert.equal(result.tokensPerAcceptedTask,550); assert.equal(result.complete,true);
});

test('zero completed successes, no runs, and unfinished runs cannot invent a success denominator',()=>{
  const result=summarizeTaskRuns({expectedInvocationIds:['a'],records:[record('a')],runs:[
    {runId:'a',finished:true,accepted:false,attempts:[{accepted:false,invocationIds:['a']}]}]});
  assert.equal(result.tokensPerAcceptedTask,null); assert.equal(result.standard.costPerAcceptedTaskUsd,null);
  const empty=summarizeTaskRuns({expectedInvocationIds:[],records:[],runs:[]});
  assert.equal(empty.acceptanceRate,null); assert.equal(empty.tokensPerAcceptedTask,null);
  const unfinished=summarizeTaskRuns({expectedInvocationIds:['a'],records:[record('a')],runs:[
    {runId:'a',finished:false,accepted:true,attempts:[{accepted:true,invocationIds:['a']}]}]});
  assert.equal(unfinished.acceptedTasks,0); assert.equal(unfinished.complete,false);
});

test('invocations may not be reused to inflate successful-task counts',()=>{
  const result=summarizeTaskRuns({expectedInvocationIds:['a'],records:[record('a')],runs:['a','b'].map(runId=>({
    runId,finished:true,accepted:true,attempts:[{accepted:true,invocationIds:['a']}]}))});
  assert.equal(result.complete,false); assert.equal(result.tokensPerAcceptedTask,null);
  assert.ok(result.runErrors.includes('invocation_assignment_mismatch'));
});

const paybackInput=()=>({candidate:{scopeId:'model-workflow',costPerCompletedTaskUsd:{minUsd:1,maxUsd:2}},
  reference:{scopeId:'model-workflow',costPerCompletedTaskUsd:{minUsd:4,maxUsd:5}},
  improvementOverhead:{scopeId:'model-workflow',complete:true,totalUsd:{minUsd:10,maxUsd:12}},
  evaluationOverhead:{scopeId:'model-workflow',complete:true,totalUsd:{minUsd:6,maxUsd:8}}});

test('payback includes both improvement and evaluation overhead at both savings bounds',()=>{
  const result=calculatePayback(paybackInput());
  assert.deepEqual(result.totalOverheadUsd,{minUsd:16,maxUsd:20});
  assert.deepEqual(result.paybackCompletedTasks,{min:4,max:10});
});

test('overlapping savings, missing overhead and incompatible cost scopes cannot claim payback',()=>{
  for (const mutate of [value=>{value.candidate.costPerCompletedTaskUsd.maxUsd=4;},
    value=>{value.evaluationOverhead.totalUsd=null;},value=>{value.improvementOverhead.complete=false;},
    value=>{value.candidate.scopeId='inner-runner-only';},value=>{value.reference.costPerCompletedTaskUsd=null;}]) {
    const input=paybackInput(); mutate(input); assert.equal(calculatePayback(input).paybackCompletedTasks,null);
  }
});

test('unsafe aggregate token and payback arithmetic cannot become known totals',()=>{
  const result=summarize([record('a',{usage:usage(Number.MAX_SAFE_INTEGER,0)}),record('b')]);
  assert.equal(result.totalTokens,null); assert.equal(result.observedSubtotalTokens,null);
  const input=paybackInput(); input.improvementOverhead.totalUsd={minUsd:Number.MAX_VALUE,maxUsd:Number.MAX_VALUE};
  assert.equal(calculatePayback(input).paybackCompletedTasks,null);
});
