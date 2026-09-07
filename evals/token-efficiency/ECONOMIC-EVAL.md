# Repeated quality and token evaluation

Use a bounded improvement cycle: record the observed problem, freeze a candidate, compare identical tasks,
inspect failures and all-attempt usage, change one proposed bundle, then repeat on the fixed suite. Stop spending
when the evidence answers the current hypothesis. Neither a smaller prompt nor a passing process trace is a
substitute for correct task results.

The 2026-09-07 hypothesis is that a supported targeted installation and self-contained lightweight instructions
reduce the full-installation overhead without losing observed task quality. The candidate still executes the
deterministic risk selector and retains standard/audit escalation. This bundles installation scope and workflow
changes; it does not identify either change's independent causal effect.

## Fixed protocol

- Three tasks: finite positive-number predicate, stateful LRU bug repair, and asynchronous retry plus a client
  wrapper. Each task has fixed input files, explicit requirements, allowed files, external correctness checks,
  and mutation checks of the submitted regression tests. The model cannot inspect the external verifier.
- Baseline: plain Codex. Legacy: frozen full Vulpora installation and `$start-task`. Optimized: frozen current
  `start-task` installation, including declared dependencies, and `$start-task`.
- All arms request `gpt-5.6-terra` with `medium` effort and identical runtime/output limits. Each attempt uses a
  fresh primary session. No child model calls or network work are allowed.
- Development pilot: one positive task per arm. Confirmation: three tasks, two repeats per arm, using all six arm
  order permutations. Keep pilot and confirmation results separate. Further tuning requires a new candidate
  snapshot and result file; never overwrite an earlier measurement.
- Permit at most one repair after a completed, in-scope attempt fails quality checks. Send only failed check names,
  the original task, and current workspace. Count both attempts, including failures. Unknown usage or unexpected
  delegation stops further launches. A time/aggregate guard is not a hard provider token cap.
- Code quality and treatment evidence are separate. A correct result can lack proof of skill-body loading.
  Report such evidence as unavailable, without making the model perform extra reads only to satisfy observation.

The development pilot reduced tokens but increased the base pricing scenario because noncached input and output
grew. Its successor also combines independent reads, reuses loaded instructions, and permits a guarded selector
plus implementation batch. Both candidate versions are preserved; confirmation evaluates the successor.

The historical retention criterion for this experiment was: retain the local candidate if the confirmation suite has no observed per-case acceptance
regression and uses at least 20% fewer tokens per accepted task than the legacy condition. Economic benefit also
requires a lower API-equivalent cost per accepted task; report uncertainty when cache-write sensitivity ranges
overlap. Report the plain-Codex
comparison independently; savings versus legacy do not establish savings versus plain Codex. This finite sample
does not prove statistical quality equivalence or broad production savings.

## Product goal: stronger than the historical retention criterion

After reviewing the results, the user's target is explicit: higher final quality, fewer total tokens, and lower
actual total cost than baseline. Reducing overhead versus legacy with acceptance parity does not meet this target.
The recorded experiment is complete; **the product goal remains unmet**. All arms used Terra/medium, so model
routing superiority was not tested. Preserve the historical results and protocol rather than relabeling them.

Before a future comparison, freeze harder, representative tasks and held-out checks for completeness, existing
behavior, error handling, integration, and regression-test fault detection. Blind qualitative review to the arm
when practical, predefine scoring and improvement thresholds, and report uncertainty. Do not choose tasks or
change scoring after seeing which condition wins. Give baseline the same requirements, acceptance threshold,
feedback, and repair opportunity. Count every model used for routing, implementation, review, and retries.

A positive product claim requires stronger final quality AND fewer tokens per accepted task AND lower total
cost than baseline. Failure to finish the same acceptance target is a quality failure, not a cheap success.
Acceptance ties alone cannot prove quality superiority. API pricing scenarios cannot prove actual billed savings;
missing billing, routing, or treatment evidence must remain unverified. The cost calculator now reports this
separate `productGoal` assessment and cannot turn legacy savings into a positive baseline claim.

## Measurements

Read the final provider usage for every attempt: input, its cached subset, and output. Do not add cached input or
reported reasoning tokens a second time. Report first-attempt acceptance, final acceptance after the repair allowance,
tokens across all attempts, tokens per accepted task, and elapsed time. With no accepted tasks, per-accepted-task
usage is undefined, not zero. Unknown usage remains unknown and prevents a complete economic conclusion.

For mean all-attempt cost `C` and acceptance probability `p`, economic value improves when
`C_candidate / p_candidate < C_reference / p_reference`. Extra tokens need sufficient observed quality benefit;
equally successful results favor the lower total cost. Retain failed and noncompliant attempts in the numerator.

USD values are **API-equivalent pricing scenarios**, not observed charges. The official Terra rates checked on
2026-09-07 are $2 uncached input, $0.20 cached input, and $12 output per million tokens for standard short-context
requests; cache writes carry a premium, and Fast has different rates.
[Model pricing](https://developers.openai.com/api/docs/models/gpt-5.6-terra),
[service tiers and cache writes](https://developers.openai.com/api/docs/pricing).
Record unknown cache writes, effective service tier, and backend identity. Cumulative turn input cannot establish
whether an individual request crosses the long-context threshold. Keep the assumed short-request scenario explicit.

Also report the model usage spent on the evaluation. Dividing it by observed per-task savings gives an illustrative
number of future comparable tasks needed to recover the measurement overhead. Development conversation, engineering
time, infrastructure, and deployment costs remain outside that estimate.

## Run

The live runner is excluded from offline tests and requires explicit `--run`. Freeze a separate checkout before
editing and supply it as `--legacy-root`. The report records source and fixture hashes. For the documented September
candidate, exact prior versions of the two changed workflow documents are also retained under
[`baselines/2026-09-07`](baselines/2026-09-07/manifest.json); they can be overlaid on a copy of this checkout to
reconstruct the documentation condition while retaining the installer assets from this revision.

```sh
node evals/token-efficiency/run-economic-ab.js --run --legacy-root /absolute/frozen-checkout \
  --out /tmp/economic-pilot.json --cases positive --repeats 1
node evals/token-efficiency/run-economic-ab.js --run --legacy-root /absolute/frozen-checkout \
  --out /tmp/economic-confirmation.json --repeats 2
```

Use fresh output paths. Provider cache is shared and uncontrolled. Repetitions measure variability for these
fixtures, not diversity of real projects. Before live runs, validate the grader, usage aggregation, and stop behavior:

```sh
node --test evals/token-efficiency/economic-*.test.cjs
```
