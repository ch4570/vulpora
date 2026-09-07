# Bounded source-context dispatch experiment

This specification is recorded before live execution. The experiment isolates the production
`sourceContextFor` optimization: fingerprinted starting files accompany a bounded worker task so the worker
can reuse those bytes. It does not install or measure the full start-task skill, Audit process, or
session-runner transport. Importing the runner, help, and offline tests make no model calls.

## Matched design

The default plan uses `query-encoding` and `retry` from `routing-fixtures.cjs`, two arms, and two repeats:
eight fresh task runs, each with at most two total attempts (one repair). `read` receives the original task;
`inline` receives the same task plus the actual production `sourceContextFor` result and `CONTEXT_GUIDANCE`.
Both arms use the same deterministic production task/model router and quality-triggered escalation.
Difficulty, initial files, allowed changes, grader, and repair allowance are fixed before execution.

The initial inline context must be eligible. Each repair refreshes fingerprints against its current candidate;
the production all-or-nothing fallback to ordinary file reads applies if the source no longer fits. Serialized
context, JSON framing, and guidance together may use at most 4,096 bytes. The whole task prompt, including
repair feedback, stays within 8,192 bytes. Required task text is never truncated. Feedback identifies failed
deterministic check names without exposing hidden oracle inputs, expected answers, or grader source.

Arm order alternates across cases, and case order reverses on repeat two. Every run starts in a fresh Git
fixture workspace with identical original source hashes. Preflight checks each actual arm prompt for unwanted
project harness injection and records the rendered input hash and byte count without retaining that context.
Global runtime context, shared caches, and prior exposure to public fixtures remain uncontrolled.

## Evidence and preregistered decision

The sample meets its criterion only when the complete matched plan has observed usage and compliant dispatch,
every inline task is accepted, at least one read task is accepted, inline preserves every accepted read-arm
case/repeat, and inline uses strictly fewer aggregate observed
input-plus-output tokens. All failed attempts and repairs count. Unknown usage is not zero and prevents more
launches. Cached input is already part of input; reasoning tokens are not added to output again.

Report eventual and first-pass acceptance, attempts, repair count, observed input/cache/output totals, tokens
per accepted task, prompt/context byte sizes and fingerprints, and deterministic runtime telemetry. Cost tools
can use each attempt's selected route; API price scenarios remain separate from total-token savings and do
not establish actual billing or served-model identity. A successful sample establishes no population quality
claim. Development, review agents, and prior experiments are outside this fresh suite's accounting.

Source hashes cover the runner, production context builder, routers, provider usage parser, telemetry,
shared executor, fixtures, and this specification. Any source drift stops launches and invalidates comparison.
Final patches and corresponding source hashes/grades are saved beside the report in its derived `-artifacts`
directory. They contain public-fixture candidates and support independent patch application and regrading;
raw runtime streams and final messages are not retained. Existing report/artifact paths cannot be overwritten.

## Run

```sh
node --test evals/token-efficiency/economic-context.test.cjs
node evals/token-efficiency/run-context-ab.js --run --out /absolute/new-context-report.json --cases query-encoding,retry --repeats 2 --max-tokens 500000
node evals/token-efficiency/economic-cost.cjs /absolute/new-context-report.json
```

The aggregate admission guard defaults to 500,000 observed tokens and is checked between bounded attempts.
It can overshoot by one attempt and is not a provider token cap. Each attempt has a three-minute timeout.
Changing cases, repeats, or the guard changes the reported plan; both arms always remain present. Do not
discard failures or select favorable subsets after observing results. An incomplete plan is inconclusive.
