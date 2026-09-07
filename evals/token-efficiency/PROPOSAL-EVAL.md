# Edit proposal versus tool-driven agent

Preregistered before live execution: query-encoding (Luna/low) and retry (Terra/medium), two fresh arms and
two counterbalanced repeats. Eight fresh task runs; at most two attempts each. All paid failures and repairs
count. Both arms run through the actual production `session.prepare/run` and the same shared budget.

The `agent` arm edits files and runs tools in its workspace. The `proposal` arm receives complete bounded
source and returns a structured edit proposal from a read-only worker with shell tools disabled. Production
code validates file ownership, starting hashes and proposal bounds before deterministic application. Both
arms then receive identical independent tests, behavior oracles, mutation checks, scope and Git HEAD checks.
The original requirements and fixtures are the same. Schemas, tool access and who applies/tests changes are
intentional treatment differences. Proposal success is not inferred from the worker's completion claims.

Both arms use 8,192-byte explicit prompt and 16,384-byte result limits, 2,000-token native tool output limits,
180-second attempt deadlines, the same production difficulty routing and parent-verified escalation policy.
Repairs see named failed checks and the current candidate, never hidden expected answers. Every inline source
must fit production eligibility rules; unavailable context stops that run without launching a substitute mode.

The sample criterion requires a complete comparable plan, every proposal task accepted, at least one agent
task accepted, no paired acceptance regression, and strictly fewer total observed input-plus-output tokens.
Unknown provider usage blocks more dispatch. The 500,000-token admission guard is checked between attempts
and can overshoot once. Report all attempts and both arms, including failures. Neither cached input nor
reasoning is counted twice. API cost scenarios are calculated separately and are not actual billing.

This tests the real session transport and deterministic coordinator, not a full installed start-task/Audit
workflow or the entire development conversation. Cache isolation and general quality superiority remain
unestablished. Prior experiments and this suite's spend must be reported separately and together when
discussing the cost of finding this improvement. Original source hashes and all final fixture patches are
retained; independently reconstruct and regrade every accepted artifact before reporting success.

```sh
node evals/token-efficiency/run-proposal-ab.js --run --out /absolute/new-proposal-report.json --cases query-encoding,retry --repeats 2 --max-tokens 500000
node evals/token-efficiency/economic-cost.cjs /absolute/new-proposal-report.json
```

## Pilot history and confirmation

`proposal-ab-2026-09-07.json` is an interrupted pilot preserved with its source at commit `4d62ea9`.
Its agent control passed using 54,500 observed tokens; the first proposal invocation reported a runtime error
without provider usage. The original reservation remains unresolved. That invocation is not zero-cost and
the incomplete pilot cannot establish savings. The schema's constant discriminator lacked an explicit type;
the original stream did not retain enough detail to prove the provider's exact rejection reason.

After correcting the schema and adding bounded error categories, run a new complete plan as
`proposal-confirmation-2026-09-07.json` with the same cases, routes, order, repeats and criteria above.
This is a new experiment after a code correction, with no reused observations or cleared old reservation.
Keep the interrupted pilot and its unknown-usage invocation in the experiment-wide spend record.
