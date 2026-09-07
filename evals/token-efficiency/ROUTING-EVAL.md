# Difficulty-based routing pilot

This experiment measures the production deterministic task/model router at task entry. It selects the first
primary Codex model before launch, with no LLM classification call. It does not install or measure the full
`start-task` skill workflow, native audit orchestration, or independent-session capsule transport.

## Fixed design

The four fixtures and classifications are frozen in `routing-fixtures.cjs` before paid execution:

| Task | Declared difficulty | Routed first attempt |
|---|---|---|
| Finite positive-number predicate | Simple, low risk | Luna / low |
| Query pairs and URL encoding | Simple, low risk | Luna / low |
| Stateful LRU cache | Moderate, low risk | Terra / medium |
| Async retry and client forwarding | Complex bounded implementation, low risk | Terra / medium |

Three arms receive identical tasks and initial files: Terra/medium fixed (`baseline`), Luna/low fixed (`luna`),
and the production router (`routed`). Each task gets at most two attempts. Fixed arms repair using the same
model; routed work can advance one tier after an independent quality failure. The same bounded feedback names
failed gates without revealing hidden test inputs. Environment errors, missing usage and exhausted budgets stop
further launches. Success ends the task without another attempt.

The first pilot uses one repeat: 12 tasks, at most 24 model sessions, and an aggregate 1,200,000-token admission
guard. Each attempt has a three-minute timeout. The guard checks observed input plus output between attempts;
it can overshoot by one attempt and is not a provider billing cap. The runner rotates arm order by task; this
small synthetic sample is not randomized or representative of a production task population.

## Evidence and acceptance

External behavior checks, candidate tests, a regression mutation check and changed-file restrictions determine
acceptance. The new query grader has a separate reference implementation and offline positive/negative controls.
All failed attempts and repairs remain in usage and cost totals. Cached input is a subset of input and reasoning
is not added again. Missing usage is unknown, never zero. Prices are selected independently for every recorded
Luna, Terra or frontier attempt; unknown or conflicting model identities remain unpriced.

The report retains source/policy/catalog hashes, original task hashes, before/after file hashes, selected route,
requested launch configuration, deterministic grade and provider usage. Consistent route and launch evidence
establish that the requested routing configuration was exercised; it cannot attest provider backend identity.
Source drift invalidates comparison. All workspaces start without project Vulpora skills or agents; global
runtime discovery context may still be present. Shared caches and prior exposure to three historical fixtures
remain uncontrolled. No prior paid result is reused as a fresh observation.

A passing sample supports only that sample's acceptance result. It does not establish that Luna always has lower
quality, that routing has superior final quality, or that an API price calculation equals actual account charges.
Report observed input/cache/output totals separately from Standard/Fast API estimates and cache-write bounds.
Development conversation, review agents and earlier experiments are outside this fresh suite's accounting.

## Run and inspect

```sh
npm run test:economics
node evals/token-efficiency/run-routing-ab.js --run --out /absolute/new-report.json --repeats 1 --max-tokens 1200000
node evals/token-efficiency/economic-cost.cjs /absolute/new-report.json
```

An existing report path cannot be overwritten. CLI import, help, fixture validation and tests make no model
calls. Optional `--cases` and `--arms` change the design and must be reported; do not discard failing runs or
choose a winning subset after inspecting outcomes. General quality claims need additional representative,
held-out tasks and uncertainty estimates. High-risk/frontier policy and three-tier escalation have offline
coverage; a live pilot that never needs escalation cannot establish recovery quality.
