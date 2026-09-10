'use strict';

const {isDeepStrictEqual} = require('node:util');
const {estimateUsage,PRICING,PRICING_BY_MODEL} = require('./economic-cost.cjs');

const id = value => typeof value === 'string' && value.trim().length > 0;
const uniqueIds = values => Array.isArray(values) && values.every(id) && new Set(values).size === values.length;
const contains = (outer,inner) => inner.every(value => outer.includes(value));
const zeroCost = () => ({minUsd:0,maxUsd:0});
const addCost = (target,value) => { target.minUsd += value.minUsd; target.maxUsd += value.maxUsd; };

// Records are final invocation snapshots, not additive streaming usage deltas.
// Coverage defaults to self only; inclusive snapshots must explicitly name descendants.
function summarizeInvocations({expectedInvocationIds,records}) {
  if (!uniqueIds(expectedInvocationIds) || !Array.isArray(records)) {
    throw new TypeError('Expected unique invocation IDs and an array of records');
  }
  const expected = new Set(expectedInvocationIds), canonical = new Map(), tainted = new Set(), errors = [];
  const fail = (code,invocationIds) => {
    errors.push({code,invocationIds});
    for (const value of invocationIds) tainted.add(value);
  };
  let duplicateSnapshots = 0;
  for (const record of records) {
    if (!record || !id(record.invocationId)) { fail('invalid_record',[]); continue; }
    const value = {...record,model:id(record.model)?record.model:null,parentInvocationId:record.parentInvocationId ?? null,
      coverageInvocationIds:record.coverageInvocationIds ?? [record.invocationId]};
    if (!uniqueIds(value.coverageInvocationIds) || !value.coverageInvocationIds.includes(value.invocationId)
      || !id(value.purpose) || (value.parentInvocationId !== null && !id(value.parentInvocationId))) {
      fail('invalid_record',[value.invocationId]); continue;
    }
    value.coverageInvocationIds = [...value.coverageInvocationIds].sort();
    if (!expected.has(value.invocationId) || value.coverageInvocationIds.some(covered => !expected.has(covered))) {
      fail('unexpected_invocation',[value.invocationId]);
    }
    if (canonical.has(value.invocationId)) {
      if (!isDeepStrictEqual(canonical.get(value.invocationId),value)) fail('conflicting_snapshot',[value.invocationId]);
      else duplicateSnapshots++;
    } else canonical.set(value.invocationId,value);
  }
  const entries = [...canonical.values()];
  for (const record of entries) {
    const ancestors = new Set([record.invocationId]);
    let parent = record.parentInvocationId;
    while (parent !== null) {
      if (ancestors.has(parent)) { fail('parent_cycle',[...ancestors]); break; }
      ancestors.add(parent);
      if (!canonical.has(parent) || !expected.has(parent)) { fail('missing_parent',[record.invocationId]); break; }
      parent = canonical.get(parent).parentInvocationId;
    }
    for (const covered of record.coverageInvocationIds) {
      if (covered === record.invocationId) continue;
      const descendant = canonical.get(covered), visited = new Set();
      let cursor = descendant?.parentInvocationId;
      while (cursor && cursor !== record.invocationId && !visited.has(cursor)) {
        visited.add(cursor); cursor = canonical.get(cursor)?.parentInvocationId;
      }
      if (cursor !== record.invocationId) fail('non_descendant_coverage',[record.invocationId]);
      if (descendant && record.model !== descendant.model) fail('mixed_model_coverage',[record.invocationId]);
    }
  }
  for (let left=0;left<entries.length;left++) for (let right=left+1;right<entries.length;right++) {
    const a=entries[left], b=entries[right], ac=a.coverageInvocationIds, bc=b.coverageInvocationIds;
    if (!ac.some(value => bc.includes(value))) continue;
    if (!contains(ac,bc) && !contains(bc,ac)) fail('partial_coverage_overlap',[a.invocationId,b.invocationId]);
  }
  // Use the existing pricing module's token validation, without pricing unknown models as its default.
  const tokens = new Map(entries.map(record => [record.invocationId,estimateUsage(record.usage,PRICING.model)?.tokens ?? null]));
  for (const outer of entries) {
    const inner = entries.filter(record => record !== outer && contains(outer.coverageInvocationIds,record.coverageInvocationIds));
    const maximal = inner.filter(record => !inner.some(other => other !== record
      && contains(other.coverageInvocationIds,record.coverageInvocationIds)));
    const measured = maximal.map(record => tokens.get(record.invocationId)).filter(Boolean), total=tokens.get(outer.invocationId);
    if (total && ['input','cached','uncached','output'].some(key => measured.reduce((sum,value) => sum+value[key],0)>total[key])) {
      fail('inconsistent_inclusive_usage',[outer.invocationId]);
    }
  }
  // A conflicting nested snapshot must not be hidden by its enclosing aggregate.
  for (let changed=true;changed;) {
    changed=false;
    for (const record of entries) if (!tainted.has(record.invocationId)
      && record.coverageInvocationIds.some(value => tainted.has(value))) {
      tainted.add(record.invocationId); changed=true;
    }
  }
  const usable = entries.filter(record => expected.has(record.invocationId)
    && !tainted.has(record.invocationId) && tokens.get(record.invocationId));
  const selected = usable.filter(record => !usable.some(other => other !== record
    && contains(other.coverageInvocationIds,record.coverageInvocationIds)));
  const unknownInvocationIds = expectedInvocationIds.filter(value => !canonical.has(value));
  const unknownUsageIds = expectedInvocationIds.filter(value => canonical.has(value) && !tokens.get(value));
  const unknownPricingIds = expectedInvocationIds.filter(value => canonical.has(value)
    && !Object.hasOwn(PRICING_BY_MODEL,canonical.get(value).model));
  const observedSubtotalTokens = selected.reduce((sum,record) => sum+tokens.get(record.invocationId).total,0);
  if (!Number.isSafeInteger(observedSubtotalTokens)) fail('unsafe_token_sum',selected.map(record => record.invocationId));
  const completeUsage = !errors.length && !unknownInvocationIds.length && !unknownUsageIds.length;
  const completePricing = completeUsage && !unknownPricingIds.length;
  const perPurpose = Object.create(null);
  for (const record of entries) {
    const entry = perPurpose[record.purpose] ??= {invocations:0,unknownUsage:0,selectedAccountingRecords:0,
      accountedSubtotalTokens:0,inclusiveAccountingRecords:0};
    entry.invocations++;
    if (!tokens.get(record.invocationId)) entry.unknownUsage++;
    if (selected.includes(record)) {
      entry.selectedAccountingRecords++;
      entry.accountedSubtotalTokens += tokens.get(record.invocationId).total;
      if (record.coverageInvocationIds.length>1) entry.inclusiveAccountingRecords++;
    }
  }
  const result = {expectedInvocations:expected.size,observedInvocations:canonical.size,duplicateSnapshots,
    selectedInvocationIds:selected.map(record => record.invocationId),unknownInvocationIds,unknownUsageIds,
    unknownPricingIds,errors,perPurpose,completeUsage,completePricing,complete:completeUsage && completePricing,
    observedSubtotalTokens:Number.isSafeInteger(observedSubtotalTokens)?observedSubtotalTokens:null,
    totalTokens:completeUsage?observedSubtotalTokens:null,billingAttested:false};
  for (const scenario of ['standard','fast']) {
    const subtotal=zeroCost();
    for (const record of selected) {
      const estimate=estimateUsage(record.usage,record.model);
      if (estimate) addCost(subtotal,estimate[scenario]);
    }
    result[scenario]={observedSubtotalUsd:subtotal,totalUsd:completePricing?subtotal:null};
  }
  return result;
}

// All attempts, including failed repairs, remain in the accounting numerator.
function summarizeTaskRuns({runs,...input}) {
  if (!Array.isArray(runs)) throw new TypeError('Expected task runs');
  const accounting=summarizeInvocations(input), runErrors=[], seenRuns=new Set(), assignments=new Map();
  let started=0, firstPassAcceptedTasks=0, acceptedTasks=0, attemptCount=0, unfinishedRuns=0;
  for (const run of runs) {
    if (!run || !id(run.runId) || seenRuns.has(run.runId) || !Array.isArray(run.attempts)) {
      runErrors.push('invalid_or_duplicate_run'); continue;
    }
    seenRuns.add(run.runId);
    if (!run.attempts.length) continue;
    started++; attemptCount+=run.attempts.length;
    if (run.finished !== true) unfinishedRuns++;
    if (typeof run.finished!=='boolean' || typeof run.accepted!=='boolean') runErrors.push('invalid_run_status');
    if (run.attempts[0]?.accepted === true) firstPassAcceptedTasks++;
    if (run.finished === true && run.accepted === true) acceptedTasks++;
    if (run.finished === true && run.accepted !== run.attempts.at(-1)?.accepted) runErrors.push('conflicting_final_acceptance');
    for (const attempt of run.attempts) {
      if (!attempt || !uniqueIds(attempt.invocationIds) || !attempt.invocationIds.length || typeof attempt.accepted !== 'boolean') {
        runErrors.push('invalid_attempt'); continue;
      }
      for (const value of attempt.invocationIds) assignments.set(value,(assignments.get(value) ?? 0)+1);
    }
  }
  if (input.expectedInvocationIds.some(value => assignments.get(value)!==1)
    || [...assignments.keys()].some(value => !input.expectedInvocationIds.includes(value))) runErrors.push('invocation_assignment_mismatch');
  const result={...accounting,runErrors,complete:accounting.complete && !runErrors.length && !unfinishedRuns
    && started===runs.length,taskRuns:started,unstartedRuns:runs.length-started,unfinishedRuns,attemptCount,
    repairAttempts:attemptCount-started,firstPassAcceptedTasks,acceptedTasks,
    firstPassAcceptanceRate:started && !runErrors.length?firstPassAcceptedTasks/started:null,
    acceptanceRate:started && !runErrors.length?acceptedTasks/started:null,
    tokensPerAcceptedTask:accounting.totalTokens!==null && acceptedTasks && !runErrors.length
      ?accounting.totalTokens/acceptedTasks:null};
  for (const scenario of ['standard','fast']) result[scenario]={...accounting[scenario],
    costPerAcceptedTaskUsd:accounting[scenario].totalUsd && acceptedTasks && !runErrors.length
      ?{minUsd:accounting[scenario].totalUsd.minUsd/acceptedTasks,maxUsd:accounting[scenario].totalUsd.maxUsd/acceptedTasks}:null};
  return result;
}

function calculatePayback({candidate,reference,improvementOverhead,evaluationOverhead}) {
  const unknown = status => ({status,savingsPerCompletedTaskUsd:null,paybackCompletedTasks:null});
  const values=[candidate,reference,improvementOverhead,evaluationOverhead];
  if (values.some(value => !value || !id(value.scopeId))) return unknown('unknown_scope');
  if (values.some(value => value.scopeId!==candidate.scopeId)) return unknown('incompatible_cost_scopes');
  const valid = value => value && Number.isFinite(value.minUsd) && Number.isFinite(value.maxUsd)
    && value.minUsd>=0 && value.maxUsd>=value.minUsd;
  if (improvementOverhead.complete!==true || evaluationOverhead.complete!==true
    || !valid(candidate.costPerCompletedTaskUsd) || !valid(reference.costPerCompletedTaskUsd)
    || !valid(improvementOverhead.totalUsd) || !valid(evaluationOverhead.totalUsd)) return unknown('unknown_cost_or_overhead');
  const savings={minUsd:reference.costPerCompletedTaskUsd.minUsd-candidate.costPerCompletedTaskUsd.maxUsd,
    maxUsd:reference.costPerCompletedTaskUsd.maxUsd-candidate.costPerCompletedTaskUsd.minUsd};
  if (savings.minUsd<=0) return {...unknown('nonpositive_or_uncertain_savings'),savingsPerCompletedTaskUsd:savings};
  const overhead=zeroCost(); addCost(overhead,improvementOverhead.totalUsd); addCost(overhead,evaluationOverhead.totalUsd);
  const payback={min:Math.ceil(overhead.minUsd/savings.maxUsd),max:Math.ceil(overhead.maxUsd/savings.minUsd)};
  if (!valid(overhead) || !Number.isSafeInteger(payback.min) || !Number.isSafeInteger(payback.max)) return unknown('unsafe_payback_range');
  return {status:'positive_savings_in_both_bounds',savingsPerCompletedTaskUsd:savings,
    paybackCompletedTasks:payback,
    totalOverheadUsd:overhead,scopeId:candidate.scopeId,billingAttested:false};
}

module.exports={summarizeInvocations,summarizeTaskRuns,calculatePayback};
