#!/usr/bin/env node
'use strict';

// Offline pricing scenarios, not a bill or an attestation of the served model/tier.
const fs = require('node:fs');

const MODEL = 'gpt-5.6-terra';
function modelPricing(model, standard) {
  return Object.freeze({
    model,
    verifiedOn:'2026-09-07',
    currency:'USD',
    unit:'per 1,000,000 tokens',
    sources:[
      `https://developers.openai.com/api/docs/models/${model}`,
      'https://developers.openai.com/api/docs/pricing',
      'https://developers.openai.com/api/docs/guides/prompt-caching',
    ],
    standard:Object.freeze(standard),
    fast:Object.freeze(Object.fromEntries(Object.entries(standard).map(([key,rate]) => [key,rate*2]))),
    assumptions:[
      'Every underlying request has at most 272,000 input tokens; cumulative turn tokens do not establish request context length.',
      'Cache-write tokens are a subset of noncached input; their rate replaces the ordinary input rate for those tokens.',
      'Unknown cache writes range from zero to all noncached input tokens; these are sensitivity bounds under this assumption.',
      'No region uplift, tool fees, subscription or account-specific pricing is included.',
      'Recorded model requests do not attest the served model or service tier; standard and Fast are alternative scenarios.',
      'The Fast scenario assumes an eligible endpoint; GPT-6 Astra Fast is unavailable with EU data residency.',
    ],
  });
}

const PRICING_BY_MODEL = Object.freeze({
  'gpt-5.6-terra':modelPricing('gpt-5.6-terra',{input:2,cachedInput:0.2,cacheWrite:2.5,output:12}),
  'gpt-5.6-luna':modelPricing('gpt-5.6-luna',{input:0.2,cachedInput:0.02,cacheWrite:0.25,output:1.2}),
  'gpt-6-astra':modelPricing('gpt-6-astra',{input:10,cachedInput:1,cacheWrite:12.5,output:50}),
});
// Preserve the default Terra export for fixed-model reports and existing callers.
const PRICING = PRICING_BY_MODEL[MODEL];

const validToken = value => Number.isSafeInteger(value) && value >= 0;
const missing = value => value === null || value === undefined;

const hasPricing = model => typeof model === 'string' && Object.hasOwn(PRICING_BY_MODEL,model);

function usageTokens(usage) {
  if (!usage || (usage.usage_status && usage.usage_status !== 'observed')) return null;
  const input = usage.input_tokens, cached = usage.cached_input_tokens, output = usage.output_tokens;
  if (![input,cached,output].every(validToken) || cached > input) return null;
  const uncached = input - cached;
  if (!missing(usage.uncached_input_tokens) && usage.uncached_input_tokens !== uncached) return null;
  if (!Number.isSafeInteger(input + output)) return null;
  if (!missing(usage.input_output_tokens) && usage.input_output_tokens !== input + output) return null;
  const writes = usage.cache_creation_input_tokens;
  if (!missing(writes) && (!validToken(writes) || writes > uncached)) return null;
  return {input,cached,uncached,output,total:input+output,cacheWrites:missing(writes)?null:writes};
}

function estimateUsage(usage, model = MODEL) {
  const tokens = usageTokens(usage);
  if (!hasPricing(model) || !tokens) return null;
  const {cached,uncached,output,cacheWrites:writes} = tokens;
  const minWrites = missing(writes) ? 0 : writes;
  const maxWrites = missing(writes) ? uncached : writes;
  const result = {
    model,
    billingAttested:false,
    assumedShortRequests:true,
    cacheWritesKnown:!missing(writes),
    tokens,
  };
  for (const scenario of ['standard','fast']) {
    const rates = PRICING_BY_MODEL[model][scenario];
    // cached is already part of input, and reasoning is already part of output.
    const baseUsd = (uncached*rates.input + cached*rates.cachedInput + output*rates.output)/1e6;
    const writePremium = rates.cacheWrite - rates.input;
    const cacheWriteSurchargeMinUsd = minWrites*writePremium/1e6;
    const cacheWriteSurchargeMaxUsd = maxWrites*writePremium/1e6;
    result[scenario] = {baseUsd,cacheWriteSurchargeMinUsd,cacheWriteSurchargeMaxUsd,
      minUsd:baseUsd+cacheWriteSurchargeMinUsd,maxUsd:baseUsd+cacheWriteSurchargeMaxUsd};
  }
  return result;
}

function sumEstimates(estimates, scenario) {
  const result = {baseUsd:0,cacheWriteSurchargeMinUsd:0,cacheWriteSurchargeMaxUsd:0,minUsd:0,maxUsd:0};
  for (const estimate of estimates) for (const key of Object.keys(result)) result[key] += estimate[scenario][key];
  return result;
}

function divideCost(cost, denominator) {
  if (!cost || denominator <= 0) return null;
  return {minUsd:cost.minUsd/denominator,maxUsd:cost.maxUsd/denominator};
}

function isAccepted(value) {
  return typeof value?.accepted === 'boolean' ? value.accepted : value?.passed === true;
}

function attemptModel(attempt, defaultModel) {
  const runtime = attempt.runtime || {}, route = attempt.route || {};
  const identities = [];
  for (const [record,key] of [[runtime,'requestedModel'],[runtime.dispatchEvidence || {},'model'],[route,'model']]) {
    if (Object.hasOwn(record,key)) identities.push(record[key]);
  }
  if (identities.some(model => model !== identities[0])) return null;
  // An explicit unknown identity must never inherit a cheaper default model.
  const model = identities.length ? identities[0] : defaultModel;
  return typeof model === 'string' && model ? model : null;
}

function summarizeRuns(runs, defaultModel) {
  const started = runs.filter(run => Array.isArray(run.attempts) && run.attempts.length > 0);
  const attempts = started.flatMap(run => run.attempts);
  const models = attempts.map(attempt => attemptModel(attempt,defaultModel));
  const estimates = attempts.map((attempt,index) => estimateUsage(attempt.runtime?.usage,models[index]));
  const known = estimates.filter(Boolean);
  const observed = attempts.map(attempt => usageTokens(attempt.runtime?.usage)).filter(Boolean);
  const completeUsage = attempts.length > 0 && observed.length === attempts.length;
  const completePricing = attempts.length > 0 && models.every(hasPricing);
  const acceptedTasks = started.filter(run => isAccepted(run)).length;
  const firstPassAcceptedTasks = started.filter(run => isAccepted(run.attempts[0])).length;
  const observedSubtotalTokens = observed.reduce((sum,item) => sum+item.total,0);
  const result = {
    taskRuns:started.length,
    unstartedRuns:runs.length-started.length,
    unfinishedRuns:started.filter(run => run.finished === false).length,
    attemptCount:attempts.length,
    repairAttempts:attempts.length-started.length,
    firstPassAcceptedTasks,
    acceptedTasks,
    firstPassAcceptanceRate:started.length ? firstPassAcceptedTasks/started.length : null,
    acceptanceRate:started.length ? acceptedTasks/started.length : null,
    treatmentNoncompliantAttempts:attempts.filter(attempt => attempt.treatmentCompliant === false).length,
    models:[...new Set(models.filter(model => typeof model === 'string'))],
    modelAttemptCounts:Object.fromEntries([...new Set(models.filter(model => typeof model === 'string'))]
      .map(model => [model,models.filter(value => value === model).length])),
    unknownModelAttempts:models.filter(model => typeof model !== 'string' || !model).length,
    observedUsageAttempts:observed.length,
    unknownUsageAttempts:attempts.length-observed.length,
    pricedUsageAttempts:known.length,
    unknownPricingAttempts:models.filter(model => !hasPricing(model)).length,
    completeUsage,
    completePricing,
    observedSubtotalTokens,
    totalTokens:completeUsage ? observedSubtotalTokens : null,
    tokensPerAcceptedTask:completeUsage && acceptedTasks ? observedSubtotalTokens/acceptedTasks : null,
  };
  for (const scenario of ['standard','fast']) {
    const observedSubtotalUsd = sumEstimates(known,scenario);
    const totalUsd = completeUsage && completePricing ? observedSubtotalUsd : null;
    result[scenario] = {observedSubtotalUsd,totalUsd,
      meanCostPerStartedTaskUsd:divideCost(totalUsd,started.length),
      costPerAcceptedTaskUsd:divideCost(totalUsd,acceptedTasks)};
  }
  return result;
}

function compareArms(candidate, reference, suite) {
  if (!candidate || !reference) return {status:'missing_arm'};
  const result = {status:'observed_sample_only',
    candidateAcceptanceRate:candidate.acceptanceRate,
    referenceAcceptanceRate:reference.acceptanceRate,
    tokenSavingsPerAcceptedTask:candidate.tokensPerAcceptedTask !== null && reference.tokensPerAcceptedTask !== null
      ? reference.tokensPerAcceptedTask-candidate.tokensPerAcceptedTask : null,
  };
  for (const scenario of ['standard','fast']) {
    const candidateMean = candidate[scenario].meanCostPerStartedTaskUsd;
    const referenceMean = reference[scenario].meanCostPerStartedTaskUsd;
    const candidateAccepted = candidate[scenario].costPerAcceptedTaskUsd;
    const referenceAccepted = reference[scenario].costPerAcceptedTaskUsd;
    const suiteSpend = suite[scenario].totalUsd;
    const entry = {requiredSuccessRateRatio:null,requiredCandidateSuccessRate:null,
      savingsPerAcceptedTaskUsd:null,suiteEvaluationPaybackAcceptedTasks:null,paybackStatus:null};
    if (candidateMean && referenceMean && referenceMean.minUsd > 0) {
      entry.requiredSuccessRateRatio = {min:candidateMean.minUsd/referenceMean.maxUsd,
        max:candidateMean.maxUsd/referenceMean.minUsd};
      // A reference with no accepted tasks cannot supply an empirical break-even target.
      if (reference.acceptanceRate > 0) entry.requiredCandidateSuccessRate = {
        min:reference.acceptanceRate*entry.requiredSuccessRateRatio.min,
        max:reference.acceptanceRate*entry.requiredSuccessRateRatio.max,
      };
    }
    if (!candidate.completeUsage || !reference.completeUsage || !suite.completeUsage
      || !candidate.completePricing || !reference.completePricing || !suite.completePricing) {
      entry.paybackStatus = 'unknown_usage_or_pricing';
    } else if (!candidate.acceptedTasks || !reference.acceptedTasks) {
      entry.paybackStatus = 'no_accepted_tasks_in_an_arm';
    } else {
      const savings = {minUsd:referenceAccepted.minUsd-candidateAccepted.maxUsd,
        maxUsd:referenceAccepted.maxUsd-candidateAccepted.minUsd};
      entry.savingsPerAcceptedTaskUsd = savings;
      if (savings.minUsd > 0) {
        entry.suiteEvaluationPaybackAcceptedTasks = {
          min:Math.ceil(suiteSpend.minUsd/savings.maxUsd),
          max:Math.ceil(suiteSpend.maxUsd/savings.minUsd),
        };
        entry.paybackStatus = 'positive_savings_in_both_bounds';
      } else entry.paybackStatus = 'nonpositive_or_uncertain_savings';
    }
    result[scenario] = entry;
  }
  return result;
}

function routingEvidence(report) {
  const attempts = report.runs.filter(run => run.arm === 'routed')
    .flatMap(run => Array.isArray(run.attempts) ? run.attempts : []);
  const recorded = attempts.filter(attempt => {
    const route = attempt.route, runtime = attempt.runtime, dispatch = runtime?.dispatchEvidence;
    return attempt.routingMode === 'production-task-router' && route?.taskSelection
      && typeof route.model === 'string' && route.model.length > 0
      && route.model === runtime?.requestedModel && route.model === dispatch?.model
      && typeof route.reasoning_effort === 'string' && route.reasoning_effort.length > 0
      && route.reasoning_effort === runtime?.requestedEffort
      && route.reasoning_effort === dispatch?.reasoning_effort
      && dispatch?.source === 'spawn-arguments' && dispatch.binary === 'codex'
      && /^[a-f0-9]{64}$/i.test(dispatch.commandSha256 || '');
  });
  return {
    status:recorded.length ? recorded.length === attempts.length ? 'recorded_dispatches' : 'partial_dispatch_evidence'
      : 'no_recorded_routed_dispatches',
    routedAttempts:attempts.length,
    recordedDispatchAttempts:recorded.length,
    missingOrConflictingDispatchAttempts:attempts.length-recorded.length,
    requestedModels:[...new Set(recorded.map(attempt => attempt.route.model))],
    recordedEscalationAttempts:recorded.filter(attempt => attempt.selection?.action === 'ESCALATE').length,
    servedModelAttested:false,
    qualityOrSavingsEffectEstablished:false,
  };
}

function assessProductGoal(report, arms) {
  const candidateArm = arms.routed ? 'routed' : 'optimized';
  const candidate=arms[candidateArm], baseline=arms.baseline;
  const modelRoutingEvidence = routingEvidence(report);
  const lowerTokens=candidate?.tokensPerAcceptedTask!=null&&baseline?.tokensPerAcceptedTask!=null
    ?candidate.tokensPerAcceptedTask<baseline.tokensPerAcceptedTask:null;
  const candidateCost=candidate?.standard.costPerAcceptedTaskUsd;
  const baselineCost=baseline?.standard.costPerAcceptedTaskUsd;
  const lowerCostAcrossWriteScenarios=candidateCost&&baselineCost
    ?candidateCost.maxUsd<baselineCost.minUsd:null;
  const costCannotBeLower=candidateCost&&baselineCost
    ?candidateCost.minUsd>=baselineCost.maxUsd:false;
  const complete=report.complete===true&&candidate?.completeUsage&&baseline?.completeUsage
    &&candidate.completePricing&&baseline.completePricing
    &&candidate.acceptedTasks>0&&baseline.acceptedTasks>0
    &&!candidate.unfinishedRuns&&!baseline.unfinishedRuns;
  return {
    target:'Higher final quality AND lower total tokens AND lower actual cost than baseline',
    candidateArm,
    status:!complete?'insufficient_evidence':lowerTokens===false||costCannotBeLower?'not_met':'not_demonstrated',
    lowerObservedTokensPerAcceptedTask:lowerTokens,
    lowerEstimatedCostAcrossCacheWriteScenarios:lowerCostAcrossWriteScenarios,
    higherObservedAcceptanceRate:candidate?.acceptanceRate!=null&&baseline?.acceptanceRate!=null
      ?candidate.acceptanceRate>baseline.acceptanceRate:null,
    finalQualitySuperiority:'not_established_by_acceptance_rates_alone',
    actualBilledSavings:'not_measured_by_this_calculator',
    strictWorkflowComparisonVerified:report.comparable===true,
    modelRoutingEvidence,
    modelRoutingEffect:modelRoutingEvidence.recordedDispatchAttempts>0
      ?'requested_routes_exercised_effect_not_established'
      :report.schema==='vulpora.economic-ab/v1'?'not_exercised_fixed_model_suite':'not_established',
    higherQualityAndLowerActualCostEstablished:false,
  };
}

function summarizeReport(report) {
  if (!report || !Array.isArray(report.runs)) throw new TypeError('Expected report.runs array');
  // Old fixed-model reports may omit the model. Routing reports require an identity per attempt.
  const defaultModel = report.schema === 'vulpora.routing-ab/v1' ? null
    : Object.hasOwn(report,'model') ? report.model : MODEL;
  const arms = {};
  for (const arm of [...new Set(report.runs.map(run => run.arm))]) {
    if (typeof arm !== 'string' || !arm || ['__proto__','constructor','prototype'].includes(arm)) {
      throw new TypeError('Expected a valid run.arm string');
    }
    arms[arm] = summarizeRuns(report.runs.filter(run => run.arm === arm),defaultModel);
  }
  const suite = summarizeRuns(report.runs,defaultModel);
  const model = suite.models.length>1 ? 'mixed' : suite.models.length===1 && !suite.unknownModelAttempts
    ? suite.models[0] : suite.attemptCount ? null : defaultModel;
  const pricingAvailable = suite.attemptCount ? suite.completePricing : hasPricing(defaultModel);
  return {
    schema:'vulpora.economic-cost/v1',
    model,
    models:suite.models,
    pricingAvailable,
    billingAttested:false,
    pricing:hasPricing(model) ? PRICING_BY_MODEL[model] : null,
    pricingByModel:Object.fromEntries(suite.models.filter(hasPricing).map(model => [model,PRICING_BY_MODEL[model]])),
    accounting:'All recorded attempts, including failed attempts, repairs and model escalations, contribute to spend at their recorded requested-model rates. Missing usage or unknown model pricing is never zero.',
    breakEvenEquation:'candidate mean spend / candidate success rate < reference mean spend / reference success rate',
    paybackEquation:'ceil(all recorded suite attempt spend / savings per accepted task)',
    limitations:[
      'USD values are API pricing scenarios, not observed charges or subscription savings.',
      'Payback recoups only this recorded evaluation suite, excluding development, coordinator, installation and human time.',
      'Acceptance rates describe the recorded task sample; repeated fixed tasks do not establish general quality or future savings.',
      'Context length, served model, service tier and cache-write accounting must be independently verified for billing use.',
      'Routing evidence records consistent requested dispatch configuration; it does not prove the served model or a causal quality/cost advantage.',
    ],
    suite,
    arms,
    productGoal:assessProductGoal(report,arms),
    comparisons:{
      optimizedVsLegacy:compareArms(arms.optimized,arms.legacy,suite),
      optimizedVsBaseline:compareArms(arms.optimized,arms.baseline,suite),
      lunaVsBaseline:compareArms(arms.luna,arms.baseline,suite),
      routedVsBaseline:compareArms(arms.routed,arms.baseline,suite),
      routedVsLuna:compareArms(arms.routed,arms.luna,suite),
    },
  };
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node economic-cost.cjs <report.json>');
    const report = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    process.stdout.write(JSON.stringify(summarizeReport(report),null,2)+'\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {estimateUsage,summarizeReport,PRICING,PRICING_BY_MODEL};
