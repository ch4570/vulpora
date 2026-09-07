# Skill token efficiency

[한국어](README.ko.md) · English · [Evaluation index](../README.md)

Measure skill discovery, entry bodies, and complete selected reference loads separately. This audit uses
**tiktoken 0.14.0 with `o200k_base`**. Counts are exact for that encoding; they are neither provider billing nor
observed runtime context use. No model is called by this tool.

## Run the optional audit

Python 3.9+ is required. Install the pinned tokenizer in an isolated environment; Vulpora's installer and npm
package do not install it. The first tokenizer use can download its encoding data; subsequent runs use the cache.

```sh
python3 -m venv .vulpora/token-audit-venv
.vulpora/token-audit-venv/bin/python -m pip install -r evals/token-efficiency/requirements.txt
TIKTOKEN_CACHE_DIR=.vulpora/tokenizer-cache .vulpora/token-audit-venv/bin/python evals/token-efficiency/measure-skills.py --baseline evals/token-efficiency/baseline.json --check --output .vulpora/token-efficiency.json
```

The JSON includes all 62 skill IDs, separate body/frontmatter/discovery counts, source hashes, selected files,
before/after deltas, and optional budget checks. Missing assets, duplicate selected files, incompatible tokenizer
versions, and changed comparison scenarios fail instead of silently omitting evidence. `--check` returns 1 for an
exceeded source-token budget; malformed inputs return 2. Omitting the flag measures without imposing a budget.

[load-scenarios.json](load-scenarios.json) declares both load plans and per-scenario budgets. It is an explicit
source contract, not automatic proof that the host followed it. Any new task branch must include its required
references in the plan. A reference moved out of SKILL.md still counts whenever the selected task reads it.

## Recorded before/after

The [portable baseline](baseline.json) measures pre-optimization source with the public identifiers normalized
to Vulpora before counting. File hashes reflect those normalized bytes. The original development snapshot is
privately archived; the public repository includes the measured records, not that private Git history.
Each file is identified by a repository-relative path and SHA-256. Counts sum each selected file once; runtime
wrappers, repository evidence, tool results, output tokens, and repeat reads are excluded on both sides.
The source-controlled scenario plan records those limits explicitly.

Normalized all-skill discovery fell from **4,869 to 4,205 tokens**.
The serialization is `name: ID` plus normalized `description: TEXT`; host/plugin wrappers are excluded.

| Selected task | Before | After | Reduction |
|---|---:|---:|---:|
| `test-authoring-junit` | 9,647 | 4,067 | 57.84% |
| `test-authoring-jpa` | 10,351 | 4,771 | 53.91% |
| `test-authoring-agentic-change` | 11,614 | 6,034 | 48.05% |
| `schema-doc-standard` | 4,008 | 3,343 | 16.59% |
| `schema-doc-with-examples` | 4,008 | 4,064 | -1.40% |
| `e2e-author-spring` | 12,510 | 8,539 | 31.74% |
| `e2e-render-single` | 12,895 | 9,352 | 27.48% |
| `e2e-render-trend` | 12,895 | 9,844 | 23.66% |
| `e2e-runner-owned-suite` | 14,493 | 11,110 | 23.34% |
| `git-flow-branch-only` | 10,857 | 1,077 | 90.08% |
| `git-flow-publication` | 10,018 | 7,798 | 22.16% |

The example-heavy schema path grows slightly because it now reads an explanatory reference header and routing
pointer as well as the examples. That cost is reported rather than counted as a saving. Run the command above to
measure the current worktree; later independent edits can change these recorded values.

## What changed

- [Test authoring](../../skills/test-authoring/SKILL.md) keeps all TST/PST rules in its entry. Framework and subject
  evidence select the needed topic directly; rationale and the INDEX are conditional. The INDEX now has one route
  table instead of repeating the topic catalog.
- [Schema extraction](../../skills/schema-doc-extract/SKILL.md) and
  [E2E scenario authoring](../../skills/e2e-scenario-author/SKILL.md) retain their output/validation contracts while
  loading worked examples only when needed. E2E surface discovery remains an explicit selected reference.
- [E2E rendering](../../skills/e2e-report-renderer/SKILL.md) loads REN-18..21 only for trend/comparison. Common
  settled-input, masking, XSS, schema, and output gates remain in the entry. The full HTML template and shared
  report contract are included in both measured plans.
- [E2E execution](../../skills/e2e-runner/SKILL.md) still reads its complete RUN contract and keeps one lifecycle
  owner. It selects environment/HTTP/async/artifact topics directly, avoiding blanket rationale/index loading.
- [Git flow](../../skills/git-flow/SKILL.md) selects a branch-preparation contract before implementation and a full
  publication contract for existing work. The branch-only path preserves explicit/default target, dirty-tree,
  missing/diverged-base, fast-forward-only, and no-publication boundaries.
- Disproportionate discovery descriptions were shortened without changing skill IDs, inputs, or the operative
  body contracts. The catalog stays at 62 skills.

## Verification and limits

```sh
python3 -m unittest discover -s evals/token-efficiency -p 'test_*.py'
bash skills/test-authoring/tests/routing-contract.test.sh
bash skills/e2e-scenario-author/tests/contract.test.sh
bash install/test-qa-runner-contract.sh
bash install/test-claude-skill-port.sh
```

The nine measurement tests protect complete skill loading, path isolation, metadata/body separation, missing and
duplicate inputs, incompatible comparisons, reported regressions, and reference-inclusive budgets. Existing skill
checks passed, including catalog validation against Spring/NestJS fixtures, cleanup/coverage failure cases,
unchanged TST/PST definitions, and common report security gates. The skill-creator validator also passed for the
12 edited skill entries. Claude's live plugin validator was unavailable in this environment.

These checks establish source reduction and preserved deterministic contracts. They do not prove equal live task
quality, fewer actual input tokens, lower billing, or fewer orchestrator tokens. A live comparison must fix the
case, fixture, model, effort, and permissions; record actual loaded files and input/cache/output usage; and require
quality/safety non-regression. The existing behavioral promotion gate's identical-asset requirement is distinct
from an efficiency comparison where candidate skill bytes intentionally differ.

To capture a comparison point before your next edit:

```sh
TIKTOKEN_CACHE_DIR=.vulpora/tokenizer-cache .vulpora/token-audit-venv/bin/python evals/token-efficiency/measure-skills.py --output .vulpora/before-next-edit.json
```

After editing, pass that file as `--baseline`. The saved initial baseline is an archived measurement; recreating
its original source requires the private development snapshot. Current source counts can be reproduced from
this public checkout using the documented pinned tokenizer.

## Difficulty-based model routing

The [routing pilot protocol](ROUTING-EVAL.md) compares fresh Terra-only, Luna-only and production-routed
execution on matched fixtures. It measures actual launch configuration, quality checks and all-attempt usage
without a paid model classifier. This isolates entry routing; the fixed-model harness experiment below has a
different scope.

The [12-run results (Korean)](results/routing-evaluation-2026-09-07.md) found 4/4 acceptance in each arm.
Routing used 7.8% more tokens and a 25.6% lower Standard API base estimate than Terra-only. Luna-only used
5.9% fewer tokens and an 87.7% lower base estimate. Supplemental LRU test sensitivity was Luna 6/8,
Terra-only 7/8 and routed Terra 8/8 faults; this is not general quality superiority or observed billing savings.

## Repeated quality and economic evaluation

**Product target: unmet.** Higher final quality and lower tokens/actual cost than plain execution have not been
demonstrated. The completed fixed-model experiment measured overhead; it did not exercise model routing.
The calculator's separate `productGoal` assessment prevents confusing legacy savings with this stronger target.

The [2026-09-07 repeated results (Korean)](results/economic-evaluation-2026-09-07.md) record two improvement
iterations and 21 independent task sessions. In the final 18-run comparison, optimized versus legacy averaged
**46.7% fewer tokens and a 9.3% lower standard API base estimate**, with the fixed quality checks passing 6/6
in every arm. Optimized still used **45.6% more tokens and a 74.6% higher base estimate than plain Codex**.
Cache-write cost ranges overlap versus legacy, strict skill-loading evidence remains unverified, and additional
LRU mutations exposed weaker generated tests in some cases. These results do not justify default-on harness use
for the sampled tasks or establish billing savings and general quality equivalence.

The [fixed economic protocol](ECONOMIC-EVAL.md) compares plain Codex, a frozen full installation, and the
optimized supported `start-task` installation. It measures three tasks, bounded repairs, external correctness,
regression-test mutation checks, and all-attempt provider usage. Failed attempts remain in the cost numerator.
Run `npm run test:economics` for offline grader/accounting checks; live runs require explicit `--run`.
The [cost calculator](economic-cost.cjs) reports standard/Fast API-equivalent scenarios and unknown cache-write
ranges, never observed billing. Earlier source-string measurements below have a narrower scope.

## Live harness on/off pilot

On 2026-09-07, a fixed tiny implementation task ran twice per condition with requested
`gpt-5.6-terra/medium` (Codex CLI 0.153.4), in off/on then on/off order. Plain Codex averaged
**45,784 input + output tokens**; full project installation plus explicit `$start-task` invocation averaged
**121,152 tokens (+164.6%, 2.646×)**. All four results passed functional, regression, mutation, and file-scope checks.

This is an observational pilot: both treatment runs executed the lightweight selector, but complete skill-loading
evidence was unavailable, so the predeclared strict compliance gate remains **`comparable: false`**. Cache is
included in input; the token ratio is not a billing ratio. This task does not exercise independent-session routing.
See the [detailed report and limitations (Korean)](results/harness-ab-2026-09-07.md),
[observed usage JSON](results/harness-ab-2026-09-07.json), and [explicit live runner](run-harness-ab.js).
The runner is excluded from offline tests and requires `--run --out <new-report.json>` to call models.

## Live independent-session measurements

The updated runner's accounting smoke on 2026-09-07 requested `gpt-5.6-luna/low` with Codex CLI 0.153.4.
One explicitly delegated read-only settings task reported 23,297 input tokens (11,008 cached) and 409 output
tokens. The shared budget charged exactly **23,706 tokens**, released the 60,000-token reservation, and retained
56,294 of the 80,000-token allowance. Reported reasoning tokens (40) were not added again. The parent verified
both values against the unchanged source. Full result/status output measured 1,996/1,552 UTF-8 bytes. This verifies
live transport and accounting, not a matched before/after cost comparison or backend model attestation. Under
default `delegation: auto`, this one-file simple task now returns `PRIMARY_OWNED` without starting a worker.

Two bounded fixtures ran on 2026-09-07 with Codex CLI 0.153.4. These are **requested model/effort settings**;
the transport does not attest the provider's backend identity. Both returned candidates, which the parent then
independently verified: exact settings values with an unchanged file, and a one-file implementation fix whose
previously failing test passed without changing the test file.

| Fixture | Requested model / effort | Capsule bytes | Parent result bytes | Cumulative input tokens | Cached input subset | Output tokens |
|---|---|---:|---:|---:|---:|---:|
| Read-only settings review | `gpt-5.6-luna` / `low` | 1,454 | 1,595 | 23,314 | 11,008 | 331 |
| Tiny implementation fix | `gpt-5.6-terra` / `medium` | 1,613 | 1,678 | 56,037 | 39,168 | 617 |

The reported input accumulates the worker's model interactions, including runtime instructions and repeated
context; it is not the capsule's token count or the parent's context size. Usage came from the final top-level
`turn.completed` event. Cached input is already included in input. Reported reasoning tokens were 25 and 54,
respectively, and are retained separately without adding them again. No parent transcript was supplied, and raw
runtime events were discarded. These fixtures establish transport behavior, not total-token or billing savings.

**Handle tiny inspections and edits directly.** Prefer independent sessions for substantial, separable work whose
discovery and tool output would otherwise occupy the primary conversation. Budget for worker input/output plus
the parent's integration and verification; a small returned JSON does not imply a cheap worker session.
Preparation token estimates are routing gates, not hard runtime token caps. Measure actual usage before increasing
parallelism. See the [session contract](../../skills/start-task/reference/kb/independent-sessions.md) for limits.

## Offline session I/O comparison

Measure the current compact prompt and completed-status responses without calling a model:

```sh
node evals/token-efficiency/measure-session-io.js
```

This uses fixed synthetic fixtures and an embedded prior prompt as its comparison baseline. It reports serialized
UTF-8 bytes for the complete prompt, its instructions, added limit fields, and concise, verbose, and failed status
responses. These are byte measurements, not token counts or observed billing savings. Runtime instructions,
tool output, and parent verification are excluded. Tool-history caps limit retained output; they provide no
measurement of total model input or cost. Run the command for current figures rather than reusing a frozen count.

Tiny tasks now default to primary ownership. Delegated simple implementation uses Luna; moderate and bounded
complex implementation use Terra with a decomposition recommendation for complex work. Complex architecture
and research or high-risk work use frontier. Model-backed sessions share reservation accounting. Unknown usage retains its charge and
blocks further launches. For an interrupted launcher without a result, explicitly run `session reconcile` to mark
the bound reservation's usage unavailable; orphaned processes are not detected or reclaimed automatically.
These changes address the overhead observed above; their individual runtime savings have not been isolated in
a matched paid comparison. The harness on/off pilot above measures a different scope.
`npm run test:routing` checks the routing, budget, and I/O contracts offline.

For exact source-string token counts, reuse the optional virtual environment and pinned requirements above:

```sh
TIKTOKEN_CACHE_DIR=.vulpora/tokenizer-cache .vulpora/token-audit-venv/bin/python evals/token-efficiency/measure-session-tokens.py
```

The fixed fixtures measured with **tiktoken 0.14.0 / `o200k_base`** produced:

| Serialized fixture | Before | After | Reduction |
|---|---:|---:|---:|
| Prompt | 238 | 228 | 4.20% |
| Concise candidate status | 387 | 257 | 33.59% |
| Verbose candidate status | 2,325 | 607 | 73.89% |
| Failed status with unavailable usage | 366 | 276 | 24.59% |

These are exact counts for those strings and that encoding, excluding runtime context, tool output, and parent
verification. The audit calls no model and establishes no runtime-token or billing savings. The dependency stays
in the optional audit environment; Vulpora's root dependencies and installer are unchanged. The byte-only command
above remains available without Python or a tokenizer.
