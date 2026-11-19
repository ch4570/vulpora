# Explicit workflow economics: preregistered pilot v1

This protocol is fixed before live calls. Run `run-workflow-ab.js --help` without a model call.
This is a new experiment, not a replacement or relabeling of the September 7 results.

## Question and treatments

For the same accepted task, does a concise explicit workflow reduce all-attempt tokens and API-equivalent
cost without losing observed quality? Higher quality **and** fewer tokens **and actual billed savings**
is a stronger product goal; acceptance parity or API scenarios alone cannot establish it.

| Arm | Task-session treatment |
|---|---|
| baseline | Normal Codex runtime with the common task request and all mandatory host policy retained |
| concise | Same runtime/task plus the fixed short `BRIEF` in the runner: scope, constraints, acceptance, checks, stop conditions |
| installed | Same runtime/task, frozen project `all-agents all-skills` installation, explicit `$start-task` using its existing automatic risk selection |

No arm removes mandatory instructions, approval rules or safety policy. Globally installed skills may remain
discoverable in **all** arms. Discovery IDs are not proof of project origin or body loading. Record the inventory;
if a control independently activates start-task, or installed loading/selection evidence is missing, mark the
comparison inconclusive. This measures explicit activation on this host, not an instruction-free agent.
With duplicate globally installed IDs, the current observation does not attest which package body ran.
Interpret installed as explicit activation with a frozen project installation **present**, not a causal
comparison between isolated package versions. These three fixtures have no security, credential, production,
irreversible or external side-effect boundary. Only observed lightweight/standard paths are supported by this
pilot's evidence checker; unexpected audit selection is inconclusive, never forcibly downgraded.

## Fixed tasks and equal acceptance

[`workflow-fixtures.cjs`](workflow-fixtures.cjs) is the executable task/oracle contract:

1. Multi-file catalog bug repair: production filtering/sorting and pagination integration plus regression tests.
2. Test authoring: immutable retry/loader production modules; submitted tests must pass correct code and detect held-out defects.
3. Review-only: preserve all source; write strict structured findings identifying seeded defects at source anchors, with no false positives.

Each condition receives identical initial task bytes, requirements, allowed files, test command and hidden grader.
Held-out oracle and regression mutations stay outside model workspaces; the verifier checks the final filesystem,
allowed changes, unchanged Git HEAD and no symlinks/special files. A runtime success is not task acceptance.
Review grading is deterministic and checks a finite seeded rubric, not broad human judgment or independent blind review.
The fixture tests must reject the original defects, incomplete solutions, weak tests and invalid findings before live use.

## Order, repair opportunity and limits

- One pilot repeat, all three cases: bug `baseline → concise → installed`; tests `concise → installed → baseline`;
  review `installed → baseline → concise`. Each arm appears once in every position. Shared cache is not controlled.
- Requested model `gpt-5.6-terra`, effort `medium`, fresh session per attempt. Model availability is checked without
  a paid turn; no silent substitution. Model-routing effects are a separate future experiment.
- At most two attempts per task: nine initial calls, no more than nine repairs. A repair is allowed only after
  completed, observed, in-scope quality failure. Same opportunity in every arm; only failed gate names plus
  original request/current workspace are supplied. No oracle answers. Runtime/environment failure is not a cheap success.
- Use the existing workspace-write executor, disabled web search and native delegation, 2,000-token tool output
  limit, 180-second attempt timeout and bounded runtime output. No network, dependencies, external writes or commits
  requested of task agents. Local fixture setup commits are deterministic and outside the task session.
- Stop before the next attempt at 600,000 observed input-plus-output tokens, $12 Fast/max-cache-write **scenario**,
  30 minutes, any unknown usage, unexpected delegation or source change. One admitted attempt may overshoot.
  These are admission guards, **not provider-enforced spending caps**. Strong production enforcement remains issue #1.
- Outputs must be new paths. Do not overwrite a failed/partial pilot, tune on its answer and count a retry as the
  original experiment. Future confirmation requires a new version/preregistration and fresh evidence.

## Accounting and evidence

Save every attempt's provider counters, parsed execution/quality evidence, elapsed time, treatment observation
and cumulative fixture patch, including failed and repaired attempts. The original result JSON is retained;
raw runtime text and reasoning are not. Command hashes/recognized paths and tool-output bytes are diagnostics,
not billing token attribution. No secrets, credentials or global policy text are copied into public results.

The invocation ledger names every expected primary, child, repair and model-verification call. Duplicate snapshots
of one invocation count once. Inclusive parent coverage must be explicit and consistent; partial overlaps, missing
invocations, conflicting totals and unknown usage fail closed. Cached input is already part of input; reasoning
is already part of output. Known subtotals remain visible, but missing totals are `null`, never zero.

The live pilot uses one primary owner, no child calls, and deterministic coordination/verification (zero model
calls for these two functions). It tests the aggregation contract for children offline; it does not validate live
multi-agent accounting. Supervising/development conversation, engineering time, actual billing and infrastructure
are **unmeasured**, not free. Evaluation model spend is reported separately from this unknown improvement overhead.

Report first/final pass rates, all-attempt tokens and cost per accepted task, repair counts, grader/mutation gates,
latency and unstarted cases. Zero accepted tasks gives an undefined denominator. Use the existing frozen September 7
Terra standard/Fast short-request pricing and unknown-cache-write sensitivity; do not advertise it as current
pricing or observed billing. Every underlying request length, effective tier and backend identity are unverified.

`calculatePayback` requires positive savings across both bounds, matching scope IDs and complete improvement AND
evaluation overhead. Otherwise payback stays unknown/inapplicable. A suite-only arithmetic estimate must not
be called recovery of total improvement investment.

## Decision fixed before seeing outcomes

The pilot never changes a global default. It establishes measurement feasibility and records failure modes.
Before adoption, a separately preregistered confirmation must have complete matched evidence, no per-case
acceptance or defect-detection regression, at least 20% fewer tokens per accepted task than baseline, and a
strictly lower cost-per-accepted-task range (candidate upper bound below reference lower bound) under both
standard and Fast scenarios. Compare installed separately; improvement against installed is not improvement
against baseline. Quality loss, overlapping ranges, missing evidence or inadequate sample size => hold.
Do not generalize the historical small edit-proposal **83.6%** reduction to normal repository work.

## Commands

```sh
node --test evals/token-efficiency/economic-workflow-*.test.cjs
node evals/token-efficiency/run-workflow-ab.js --help
# Explicitly starts a bounded local model experiment; existing CLI auth is reused, never copied.
node evals/token-efficiency/run-workflow-ab.js --run --out /tmp/new-workflow-pilot.json
```

The shared executor uses [Codex non-interactive JSON usage events](https://developers.openai.com/codex/noninteractive)
and existing repository parsers. No new production runner, signing key, billing integration or default routing is enabled.
