'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {estimateUsage,summarizeReport,PRICING,PRICING_BY_MODEL} = require('./economic-cost.cjs');

const usage = (overrides={}) => ({input_tokens:1000,cached_input_tokens:600,uncached_input_tokens:400,
  output_tokens:100,input_output_tokens:1100,reasoning_tokens:80,cache_creation_input_tokens:0,
  usage_status:'observed',...overrides});
const attempt = (accepted,measurement=usage()) => ({accepted,runtime:{usage:measurement}});
const run = (arm,attempts) => ({arm,finished:true,accepted:attempts.at(-1).accepted,attempts});
const near = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-12,`${actual} != ${expected}`);

test('cache is part of input and reasoning is part of output, without double counting', () => {
  const result = estimateUsage(usage());
  near(result.standard.baseUsd,0.00212);
  near(result.standard.minUsd,0.00212);
  near(result.standard.maxUsd,0.00212);
  near(result.fast.baseUsd,0.00424);
  assert.equal(result.tokens.total,1100);
  assert.equal(result.billingAttested,false);
  assert.equal(PRICING.verifiedOn,'2026-09-07');
});

test('unknown cache writes retain a bounded surcharge scenario, known writes add only the premium', () => {
  const unknown = estimateUsage(usage({cache_creation_input_tokens:null}));
  assert.equal(unknown.cacheWritesKnown,false);
  near(unknown.standard.minUsd,0.00212);
  near(unknown.standard.maxUsd,0.00232);
  near(unknown.fast.maxUsd,0.00464);
  const known = estimateUsage(usage({cache_creation_input_tokens:200}));
  near(known.standard.minUsd,0.00222);
  near(known.standard.maxUsd,0.00222);
});

test('missing or inconsistent usage and unsupported pricing produce null, not invented cost', () => {
  for (const value of [null,{},usage({cached_input_tokens:null}),usage({output_tokens:NaN}),
    usage({input_tokens:-1}),usage({uncached_input_tokens:0}),usage({cached_input_tokens:1001}),
    usage({input_output_tokens:100}),usage({cache_creation_input_tokens:401}),usage({usage_status:'unavailable'})]) {
    assert.equal(estimateUsage(value),null);
  }
  assert.equal(estimateUsage(usage(),'another-model'),null);
});

test('cumulative input never selects a long-context tariff', () => {
  const result = estimateUsage(usage({input_tokens:500000,cached_input_tokens:0,uncached_input_tokens:500000,
    input_output_tokens:500100}));
  assert.equal(result.assumedShortRequests,true);
  near(result.standard.baseUsd,1.0012);
});

test('failed attempts and repairs are charged once per accepted task', () => {
  const report = summarizeReport({runs:[
    run('baseline',[attempt(false),attempt(true)]),
    run('baseline',[attempt(false)]),
  ]});
  const arm = report.arms.baseline;
  assert.equal(arm.taskRuns,2);
  assert.equal(arm.attemptCount,3);
  assert.equal(arm.repairAttempts,1);
  assert.equal(arm.acceptedTasks,1);
  assert.equal(arm.firstPassAcceptedTasks,0);
  assert.equal(arm.acceptanceRate,0.5);
  assert.equal(arm.totalTokens,3300);
  assert.equal(arm.tokensPerAcceptedTask,3300);
  near(arm.standard.costPerAcceptedTaskUsd.minUsd,0.00636);
});

test('zero successes leave accepted-task economics and payback undefined', () => {
  const report = summarizeReport({runs:[
    run('baseline',[attempt(false)]),run('optimized',[attempt(true)]),
  ]});
  assert.equal(report.arms.baseline.acceptanceRate,0);
  assert.equal(report.arms.baseline.tokensPerAcceptedTask,null);
  assert.equal(report.arms.baseline.standard.costPerAcceptedTaskUsd,null);
  assert.equal(report.comparisons.optimizedVsBaseline.standard.requiredCandidateSuccessRate,null);
  assert.equal(report.comparisons.optimizedVsBaseline.standard.suiteEvaluationPaybackAcceptedTasks,null);
  assert.equal(report.comparisons.optimizedVsBaseline.standard.paybackStatus,'no_accepted_tasks_in_an_arm');
});

test('unknown attempt usage contaminates totals while preserving explicitly observed subtotals', () => {
  const report = summarizeReport({runs:[
    run('baseline',[attempt(false,null),attempt(true)]),run('optimized',[attempt(true)]),
  ]});
  assert.equal(report.arms.baseline.unknownUsageAttempts,1);
  assert.equal(report.arms.baseline.observedSubtotalTokens,1100);
  assert.equal(report.arms.baseline.totalTokens,null);
  assert.equal(report.suite.standard.totalUsd,null);
  assert.equal(report.comparisons.optimizedVsBaseline.standard.paybackStatus,'unknown_usage_or_pricing');
});

test('payback charges the entire suite and requires positive conservative savings', () => {
  const small = usage({input_tokens:100,cached_input_tokens:0,uncached_input_tokens:100,
    output_tokens:0,input_output_tokens:100});
  const large = usage({input_tokens:1000,cached_input_tokens:0,uncached_input_tokens:1000,
    output_tokens:0,input_output_tokens:1000});
  const report = summarizeReport({runs:[
    run('legacy',[attempt(true,large)]),run('baseline',[attempt(true,small)]),
    run('optimized',[attempt(true,small)]),
  ]});
  const legacy = report.comparisons.optimizedVsLegacy.standard;
  near(legacy.savingsPerAcceptedTaskUsd.minUsd,0.0018);
  near(legacy.requiredSuccessRateRatio.min,0.1);
  assert.deepEqual(legacy.suiteEvaluationPaybackAcceptedTasks,{min:2,max:2});
  assert.equal(report.comparisons.optimizedVsBaseline.standard.suiteEvaluationPaybackAcceptedTasks,null);
  assert.equal(report.comparisons.optimizedVsBaseline.standard.paybackStatus,'nonpositive_or_uncertain_savings');
});

test('unknown write intervals that overlap do not claim certain payback', () => {
  const report = summarizeReport({runs:[
    run('baseline',[attempt(true,usage({cache_creation_input_tokens:null}))]),
    run('optimized',[attempt(true,usage({cache_creation_input_tokens:null}))]),
  ]});
  const comparison = report.comparisons.optimizedVsBaseline.standard;
  assert.ok(comparison.savingsPerAcceptedTaskUsd.minUsd<0);
  assert.ok(comparison.savingsPerAcceptedTaskUsd.maxUsd>0);
  assert.equal(comparison.suiteEvaluationPaybackAcceptedTasks,null);
});

test('empty suite, unsupported model and partial runs remain explicit', () => {
  const empty = summarizeReport({runs:[]});
  assert.equal(empty.suite.totalTokens,null);
  assert.equal(empty.suite.acceptanceRate,null);
  const other = summarizeReport({model:'unpriced',runs:[run('baseline',[attempt(true)])]});
  assert.equal(other.pricingAvailable,false);
  assert.equal(other.suite.standard.totalUsd,null);
  const partial = summarizeReport({runs:[{arm:'baseline',finished:false,attempts:[]}]});
  assert.equal(partial.suite.taskRuns,0);
  assert.equal(partial.suite.unstartedRuns,1);
});

test('CLI emits JSON without overwriting the source report', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'economic-cost-test-'));
  try {
    const file = path.join(temp,'report.json');
    const original = JSON.stringify({runs:[run('baseline',[attempt(true)])]});
    fs.writeFileSync(file,original);
    const result = spawnSync(process.execPath,[path.join(__dirname,'economic-cost.cjs'),file],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).suite.acceptedTasks,1);
    assert.equal(fs.readFileSync(file,'utf8'),original);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});

test('saving against legacy cannot satisfy the higher-quality lower-cost baseline target', () => {
  const measure=n=>usage({input_tokens:n,cached_input_tokens:0,uncached_input_tokens:n,
    output_tokens:0,input_output_tokens:n});
  const report=summarizeReport({schema:'vulpora.economic-ab/v1',complete:true,comparable:false,runs:[
    run('baseline',[attempt(true,measure(100))]),
    run('optimized',[attempt(true,measure(200))]),
    run('legacy',[attempt(true,measure(400))]),
  ]});
  assert.equal(report.productGoal.status,'not_met');
  assert.equal(report.productGoal.lowerObservedTokensPerAcceptedTask,false);
  assert.equal(report.productGoal.higherObservedAcceptanceRate,false);
  assert.equal(report.productGoal.modelRoutingEffect,'not_exercised_fixed_model_suite');
  assert.equal(report.productGoal.strictWorkflowComparisonVerified,false);
});

test('better acceptance and lower scenario cost do not prove final quality or actual billing savings', () => {
  const cheap=usage({input_tokens:100,cached_input_tokens:0,uncached_input_tokens:100,
    output_tokens:0,input_output_tokens:100});
  const report=summarizeReport({complete:true,comparable:true,runs:[
    run('baseline',[attempt(false)]),run('baseline',[attempt(true)]),
    run('optimized',[attempt(true,cheap)]),run('optimized',[attempt(true,cheap)]),
  ]});
  assert.equal(report.productGoal.lowerObservedTokensPerAcceptedTask,true);
  assert.equal(report.productGoal.lowerEstimatedCostAcrossCacheWriteScenarios,true);
  assert.equal(report.productGoal.higherObservedAcceptanceRate,true);
  assert.equal(report.productGoal.status,'not_demonstrated');
  assert.equal(report.productGoal.higherQualityAndLowerActualCostEstablished,false);
});

test('incomplete experiments or unknown usage cannot satisfy the product target', () => {
  for(const report of [{complete:false,runs:[run('baseline',[attempt(true)]),run('optimized',[attempt(true)])]},
    {complete:true,runs:[run('baseline',[attempt(true)]),run('optimized',[attempt(true,null)])]}]) {
    assert.equal(summarizeReport(report).productGoal.status,'insufficient_evidence');
  }
});

test('Luna and Astra use their official rates, including their own cache-write bounds', () => {
  const luna = estimateUsage(usage({cache_creation_input_tokens:null}),'gpt-5.6-luna');
  near(luna.standard.minUsd,0.000212);
  near(luna.standard.maxUsd,0.000232);
  near(luna.fast.maxUsd,0.000464);
  const astra = estimateUsage(usage({cache_creation_input_tokens:null}),'gpt-6-astra');
  near(astra.standard.minUsd,0.0096);
  near(astra.standard.maxUsd,0.0106);
  near(astra.fast.maxUsd,0.0212);
  for (const model of ['gpt-5.6-terra','gpt-5.6-luna','gpt-6-astra']) {
    assert.equal(PRICING_BY_MODEL[model].verifiedOn,'2026-09-07');
    assert.ok(PRICING_BY_MODEL[model].sources.includes(`https://developers.openai.com/api/docs/models/${model}`));
  }
});

const routedAttempt = (accepted,model,measurement=usage(),action='INITIAL') => ({
  accepted,routingMode:'production-task-router',selection:{action},
  route:{model,reasoning_effort:'low',taskSelection:{explicitProfile:null}},
  runtime:{usage:measurement,requestedModel:model,requestedEffort:'low',
    dispatchEvidence:{source:'spawn-arguments',binary:'codex',commandSha256:'a'.repeat(64),
      model,reasoning_effort:'low',backendIdentity:'NOT_ATTESTED'}},
});

test('mixed routing charges every failed escalation and preserves each model cache-write bound', () => {
  const unknownWrites = usage({cache_creation_input_tokens:null});
  const report = summarizeReport({schema:'vulpora.routing-ab/v1',complete:true,runs:[
    run('baseline',[routedAttempt(true,'gpt-5.6-terra')]),
    run('luna',[routedAttempt(true,'gpt-5.6-luna')]),
    run('routed',[
      routedAttempt(false,'gpt-5.6-luna',unknownWrites),
      routedAttempt(false,'gpt-5.6-terra',unknownWrites,'ESCALATE'),
      routedAttempt(true,'gpt-6-astra',unknownWrites,'ESCALATE'),
    ]),
  ]});
  const arm = report.arms.routed;
  assert.equal(report.model,'mixed');
  assert.equal(report.pricing,null);
  assert.equal(report.pricingAvailable,true);
  assert.equal(arm.attemptCount,3);
  assert.equal(arm.repairAttempts,2);
  assert.equal(arm.totalTokens,3300);
  assert.equal(arm.tokensPerAcceptedTask,3300);
  assert.deepEqual(arm.modelAttemptCounts,{'gpt-5.6-luna':1,'gpt-5.6-terra':1,'gpt-6-astra':1});
  near(arm.standard.costPerAcceptedTaskUsd.minUsd,0.011932);
  near(arm.standard.costPerAcceptedTaskUsd.maxUsd,0.013152);
  near(arm.fast.costPerAcceptedTaskUsd.maxUsd,0.026304);
  near(report.suite.standard.totalUsd.minUsd,0.014264);
  assert.equal(report.productGoal.candidateArm,'routed');
  assert.equal(report.productGoal.status,'not_met');
  assert.equal(report.productGoal.modelRoutingEvidence.recordedDispatchAttempts,3);
  assert.equal(report.productGoal.modelRoutingEvidence.recordedEscalationAttempts,2);
  assert.equal(report.productGoal.modelRoutingEvidence.servedModelAttested,false);
  assert.equal(report.productGoal.higherQualityAndLowerActualCostEstablished,false);
  assert.equal(report.comparisons.lunaVsBaseline.standard.paybackStatus,'positive_savings_in_both_bounds');
  assert.equal(report.comparisons.routedVsBaseline.standard.paybackStatus,'nonpositive_or_uncertain_savings');
});

test('routed versus Luna includes unsuccessful Luna tasks and all escalation attempts per accepted task', () => {
  const report = summarizeReport({schema:'vulpora.routing-ab/v1',complete:true,runs:[
    run('baseline',[routedAttempt(true,'gpt-5.6-terra')]),
    run('baseline',[routedAttempt(true,'gpt-5.6-terra')]),
    run('luna',[routedAttempt(true,'gpt-5.6-luna')]),
    run('luna',[routedAttempt(false,'gpt-5.6-luna'),routedAttempt(false,'gpt-5.6-luna')]),
    run('routed',[routedAttempt(true,'gpt-5.6-luna')]),
    run('routed',[routedAttempt(false,'gpt-5.6-luna'),routedAttempt(true,'gpt-5.6-terra',usage(),'ESCALATE')]),
  ]});
  assert.equal(report.arms.luna.acceptedTasks,1);
  assert.equal(report.arms.routed.acceptedTasks,2);
  assert.equal(report.arms.luna.attemptCount,3);
  assert.equal(report.arms.routed.attemptCount,3);
  assert.equal(report.arms.luna.tokensPerAcceptedTask,3300);
  assert.equal(report.arms.routed.tokensPerAcceptedTask,1650);
  near(report.arms.luna.standard.costPerAcceptedTaskUsd.minUsd,0.000636);
  near(report.arms.routed.standard.costPerAcceptedTaskUsd.minUsd,0.001272);
  const comparison = report.comparisons.routedVsLuna;
  assert.equal(comparison.candidateAcceptanceRate,1);
  assert.equal(comparison.referenceAcceptanceRate,0.5);
  assert.equal(comparison.tokenSavingsPerAcceptedTask,1650);
  near(comparison.standard.requiredSuccessRateRatio.min,4);
  near(comparison.standard.requiredCandidateSuccessRate.min,2);
  near(comparison.standard.savingsPerAcceptedTaskUsd.minUsd,-0.000636);
  near(comparison.fast.savingsPerAcceptedTaskUsd.minUsd,-0.001272);
  assert.equal(comparison.standard.paybackStatus,'nonpositive_or_uncertain_savings');
  assert.equal(comparison.standard.suiteEvaluationPaybackAcceptedTasks,null);
  assert.equal(report.comparisons.routedVsBaseline.standard.paybackStatus,'positive_savings_in_both_bounds');
  assert.equal(report.productGoal.higherQualityAndLowerActualCostEstablished,false);
});

test('explicit unknown or conflicting attempt models never inherit Terra pricing', () => {
  for (const model of [null,undefined,'','unpriced','constructor','__proto__']) {
    const unknown = attempt(true);
    unknown.runtime.requestedModel = model;
    const report = summarizeReport({model:'gpt-5.6-terra',runs:[run('baseline',[unknown])]});
    assert.equal(report.pricingAvailable,false);
    assert.equal(report.suite.completeUsage,true);
    assert.equal(report.suite.completePricing,false);
    assert.equal(report.suite.totalTokens,1100);
    assert.equal(report.suite.unknownPricingAttempts,1);
    assert.equal(report.suite.standard.totalUsd,null);
  }
  for (const key of ['requestedModel','dispatchEvidence']) {
    const conflicting = routedAttempt(true,'gpt-5.6-luna');
    if (key === 'dispatchEvidence') conflicting.runtime.dispatchEvidence.model = 'gpt-5.6-terra';
    else conflicting.runtime.requestedModel = 'gpt-5.6-terra';
    const report = summarizeReport({model:'gpt-5.6-terra',runs:[run('routed',[conflicting])]});
    assert.equal(report.suite.standard.totalUsd,null);
    assert.equal(report.productGoal.modelRoutingEvidence.recordedDispatchAttempts,0);
  }
});

test('recorded attempt identity overrides report defaults and missing routed identity stays unknown', () => {
  const requested = attempt(true);
  requested.runtime.requestedModel = 'gpt-5.6-luna';
  const routed = attempt(true);
  routed.route = {model:'gpt-6-astra'};
  const report = summarizeReport({model:'unpriced-report-default',runs:[run('baseline',[requested,routed])]});
  assert.equal(report.pricingAvailable,true);
  near(report.suite.standard.totalUsd.minUsd,0.009812);
  const missing = summarizeReport({schema:'vulpora.routing-ab/v1',model:'gpt-5.6-terra',
    runs:[run('routed',[attempt(true)])]});
  assert.equal(missing.pricingAvailable,false);
  assert.equal(missing.suite.standard.totalUsd,null);
});

test('routing flags and inconsistent launch records cannot establish routing evidence or superiority', () => {
  const first = routedAttempt(true,'gpt-5.6-luna');
  const second = routedAttempt(true,'gpt-5.6-luna');
  second.runtime.dispatchEvidence.reasoning_effort = 'high';
  const report = summarizeReport({schema:'vulpora.routing-ab/v1',complete:true,comparable:true,
    modelRoutingExercised:true,higherQualityAndLowerActualCostEstablished:true,runs:[
      run('baseline',[routedAttempt(true,'gpt-5.6-terra')]),
      run('routed',[first,second]),
    ]});
  assert.equal(report.productGoal.modelRoutingEvidence.status,'partial_dispatch_evidence');
  assert.equal(report.productGoal.modelRoutingEvidence.recordedDispatchAttempts,1);
  assert.equal(report.productGoal.modelRoutingEvidence.missingOrConflictingDispatchAttempts,1);
  assert.equal(report.productGoal.modelRoutingEvidence.qualityOrSavingsEffectEstablished,false);
  assert.equal(report.productGoal.higherQualityAndLowerActualCostEstablished,false);
  const forged = summarizeReport({schema:'vulpora.routing-ab/v1',modelRoutingExercised:true,runs:[
    run('routed',[attempt(true)]),
  ]});
  assert.equal(forged.productGoal.modelRoutingEvidence.status,'no_recorded_routed_dispatches');
  assert.equal(forged.productGoal.modelRoutingEffect,'not_established');
});

test('unpriced escalation preserves observed spend but blocks total cost, payback and product assessment', () => {
  const report = summarizeReport({schema:'vulpora.routing-ab/v1',complete:true,runs:[
    run('baseline',[routedAttempt(true,'gpt-5.6-terra')]),
    run('routed',[routedAttempt(false,'gpt-5.6-luna'),routedAttempt(true,'unpriced',usage(),'ESCALATE')]),
  ]});
  near(report.arms.routed.standard.observedSubtotalUsd.minUsd,0.000212);
  assert.equal(report.arms.routed.standard.totalUsd,null);
  assert.equal(report.arms.routed.totalTokens,2200);
  assert.equal(report.comparisons.routedVsBaseline.standard.paybackStatus,'unknown_usage_or_pricing');
  assert.equal(report.productGoal.status,'insufficient_evidence');
});
