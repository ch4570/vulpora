# Improvement-record contract

An improvement record is a versioned, reviewable link from a source failure or
incident to a proposed asset change and its evaluation evidence.  It is not an
autonomous prompt mutator and recording a hypothesis never changes an agent.

Records use `vulpora.improvement-record/v1`, documented in
[`schema/improvement-record.schema.yaml`](schema/improvement-record.schema.yaml).
Valid statuses are `quarantined`, `validated`, `promoted`, `rejected`, and
`rolled_back`. Default validation checks the record's **structure**:
a promoted record needs non-empty before/after evidence
references, an independent approver distinct from the author, an RFC 3339
timestamp, and a rollback plan and trigger. It validates reference syntax, not
the existence or scores behind an opaque reference. Both ordinary validation and
`--strict-promotion` are lint: exit `0` means their checks passed, and their summary
always says `promotion=NOT_AUTHORIZED`. Neither authorizes a release or an agent change.

Structural lint deliberately implements a **restricted YAML
subset** rather than guessing at general YAML: known top-level sections only,
two-space child keys, and four-space scalar evidence list items. Unknown,
misplaced, duplicated, missing, inline, and malformed list fields are rejected.
This makes lineage, affected asset, evaluation, approval, and rollback
membership meaningful rather than a document-wide key search.
Legacy linked-result validation remains shell-only. Results containing the new
`measurements` envelope or token-provenance labels additionally require Node.js;
the shared result validator rejects unknown fields, duplicate JSON keys, invalid
types and inconsistent proxy counts. These measurements never replace `actual`
scores or establish authenticated evidence.

Validate record structure during authoring:

```bash
bash evals/improvements/validate-improvement-records.sh
bash evals/improvements/validate-improvement-records.sh path/to/record.yaml
```

Evidence references must be either a constrained stable token
(`[A-Za-z0-9][A-Za-z0-9._:-]{2,159}`), `result_id:<token>`,
`incident_id:<token>`, or an explicitly typed immutable
`uri:<absolute-uri>#sha256=<64-hex>` / `path:<relative-path>#sha256=<64-hex>`.
Ordinary mode validates this syntax; it cannot prove an opaque token exists.

For linked evidence comparison, use strict validation with machine-readable eval results:

```bash
bash evals/improvements/validate-improvement-records.sh \
  --strict-promotion --results-dir evals/behavioral/results \
  path/to/promoted-record.yaml
```

Use `--min-outcome-delta N` to set the strict mean-outcome minimum; it
defaults to `0.01` and must be in `[0,1]`.

To additionally verify a supplied signed evidence bundle, explicitly request:

```bash
bash evals/improvements/validate-improvement-records.sh \
  --verify-promotion --results-dir evals/behavioral/results \
  --trust-policy /absolute/operator-controlled-policy.json \
  --evidence-bundle /absolute/signed-trials.json \
  path/to/promoted-record.yaml
```

This implies strict validation, requires exactly one promoted record, and invokes
[`install/eval-evidence.js`](../../install/eval-evidence.js), including its real
Ed25519 signature, check-inventory, repeat, provenance and aggregate budget checks.
Evidence flags without `--verify-promotion` are rejected. Invalid evidence exits
nonzero; verified signatures still exit **`3`, `promotion=BLOCKED`**. The supplied
policy must be protected independently from candidate-writable inputs.

The current signed-trial schema does not bind its trials to the improvement
record's before/after references, and signature validity does not prove actual
isolation, truthful grading or immutable storage. The command explicitly reports
`OPERATIONAL_AND_RECORD_BINDING_UNVERIFIED`; even an unrelated correctly signed
bundle cannot authorize promotion. No v1 invocation of this command approves a release.

운영 승인과 구조 검사는 별개다. `--strict-promotion`의 exit 0은 기록·점수 비교
검사 통과이며 승인 권한을 부여하지 않는다. `--verify-promotion`은 실제 서명
검증기를 호출하지만, 운영 격리·원본 저장·기록 연결을 확인할 수 없어 유효한
서명도 exit 3 / BLOCKED로 끝난다.

Each referenced result needs an id (`result_id`, `eval_id`, or `id`),
`case_id`, `target.kind/id`, `actual.outcome_score`,
`actual.process_score`, `actual.safety_score`, and a verdict. It must also
record `run.model_id`, `run.config_id`, `run.case_digest`,
`run.adapter_id`, `behavioral.fixture_before_digest`, and
`run.asset_definition_digest`, `run.source_revision`,
`run.harness_definition_digest`, `behavioral.runtime`,
`behavioral.baseline_mode`, `run.run_group_id`, `run.timestamp`,
`run.trial_index`, and `run.trial_count`. Missing, `unknown`, or `unspecified`
identity metadata fails strict verification.

For this supplied-result comparison, scores are read only from `actual.outcome_score`,
`actual.process_score`, and `actual.safety_score`. Optional same-named
`metrics.*` or `behavioral.*` values are never used to replace them and must
agree numerically when present; a conflict rejects the result source. Both
before and after verdicts must be the runner enum `pass|fail`; before `fail`
is valid comparison evidence, while every after verdict must be `pass`.
Top-level score fields are unsupported and rejected, so they cannot shadow
the authoritative `actual` block.

Every result's target must equal the record's `affected_asset`. Every after
result must be passing and have exactly one before result with the same case,
target kind/id, runtime, baseline mode, run-group provenance id, model, config,
case digest, fixture-before digest, adapter, and harness-definition digest.
Outcome must increase strictly; process and safety must not decrease. Strict
promotion compares only like-for-like runtime and baseline modes, and requires
one identical `run_group_id` across the before/after comparison; a comparison
that intentionally changes either belongs in a separate evaluation record, not
a promotion claim. The asset-definition digest
is required to be recorded but intentionally not compared, because the
candidate is expected to change that asset. Source revision is likewise required
provenance but is not compared: a promoted asset normally changes the repository
revision. Every trial set must still name one source revision and one harness
digest, and the harness digest must match between before and after.

Strict identity values are constrained: affected asset kind/id, target kind/id,
model, config, and adapter use the stable-token grammar
`[A-Za-z0-9][A-Za-z0-9._:-]{2,159}`; case IDs additionally support one
controlled `category/name` slash. This prevents a result reference from
becoming a path, shell fragment, or ambiguous free-form identity.

For `--results-dir`, every YAML file is fail-closed as a behavioral runner
result: it must declare `schema: vulpora.eval-result`, exactly one
`eval_id`, `case_id`, `target`, `actual`, `verdict`, `behavioral`,
and `run`, with exactly one required target/score/run metadata field. A
wrong schema, duplicate core key, or ambiguous inline target/actual mapping
invalidates the supplied result source rather than being silently ignored.
Result keys must be unquoted, block child keys use exactly two spaces, and
`target`/`actual` inline mappings use unquoted keys with scalar token values
(values may be quoted). Single-line list items are supported in `evidence`.
Other syntax, including quoted or explicit keys, unsupported indentation, and
document separators, is rejected instead of being skipped. Quoted text inside
an evidence scalar does not declare a result field.

Multi-trial evidence is first-class. For each comparable identity on each side,
the linked rows must contain exactly one of every trial index `1..trial_count`
(maximum 10,000), with the same trial count on both sides; duplicate,
incomplete, or mismatched trial sets fail. Rows pair by trial index. Every
candidate trial must have `verdict: pass`. The evaluator then compares
per-identity trial means: mean outcome delta must be greater than
`--min-outcome-delta` (default `0.01`), while mean process and safety may
not regress. This preserves the one-trial behavior as the `N=1` case without
requiring every individual stochastic trial to beat its counterpart.
Within a before trial set and within an after trial set, all rows must name one
and only one runtime, baseline mode, run-group id, and asset-definition digest;
mixed experiment provenance or revisions cannot be averaged. The one before
asset digest may still differ from the one after digest. `approved_at` must not
precede any after-evidence `run.timestamp`.

A tab-separated index uses the required versioned v5 form:

```text
vulpora.improvement-results-index/v5
result_id<TAB>case_id<TAB>target_kind<TAB>target_id<TAB>runtime<TAB>baseline_mode<TAB>run_group_id<TAB>timestamp<TAB>model_id<TAB>config_id<TAB>case_digest<TAB>fixture_before_digest<TAB>adapter_id<TAB>asset_definition_digest<TAB>source_revision<TAB>harness_definition_digest<TAB>trial_index<TAB>trial_count<TAB>outcome_score<TAB>process_score<TAB>safety_score<TAB>verdict
...
```
Strict mode therefore requires each before/after item to be a resolvable result
ID (a bare constrained token or `result_id:<token>`); immutable URI/path
references remain useful provenance in ordinary structural validation but are
not score-bearing linked results.

Promoted `change_author` and `independent_approver` are constrained to
lower-case ASCII email-shaped canonical principals, and ASCII case-folded
self-aliases are rejected. This prevents simple spelling aliases but is not a
signature or identity-provider check: the record remains self-attested without
a trusted signer and access-controlled identity store.

This confirms only the supplied result metadata and score comparison. It does
not authenticate a result producer, independently recompute a score, or fetch
and verify an external URI; preserve those records in an access-controlled,
immutable result store. Candidate `verdict: pass` enforces the runner's
configured cost threshold when one exists, but strict promotion deliberately
does **not** require cost-score non-regression: a justified candidate may trade
some cost for an outcome improvement. Review cost score and raw cost metrics
separately when latency or spend is a promotion constraint.

Operational promotion still needs independently provisioned identities and trust
policy delivery, attested runner/image provenance with enforced isolation probes,
access-controlled immutable originals bound to the record and case/grader digests,
provider-side spend enforcement, and funded repeated live security comparisons.
These services are not deployed by this repository. See
[the remaining trust boundaries](../../docs/eval-trust-boundaries.md).

Fixtures are deliberately outside `records/`; the invalid fixture exists to
prove the gate rejects an under-evidenced promotion.
