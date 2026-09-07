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

## Live independent-session measurements

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
