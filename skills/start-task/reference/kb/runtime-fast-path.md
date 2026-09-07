---
title: Start Task audit deterministic runtime fast path
source: Vulpora workflow contract
last_fetched: 2026-08-24
skills: [start-task]
---

# Audit deterministic runtime fast path

Use this path only after the profile selector chooses `audit` and the task is already actionable with no
non-bypassable blocker. It preserves every audit phase and evidence boundary while avoiding source-code discovery
and hand-built JSON. It is not the lightweight or standard path.
If clarification is required, return the validated question frame and stop; resume this path only after the user
answers or explicitly accepts reversible uncertainty.

## Runtime budget

- Treat a runtime-supplied overall deadline as binding. Reserve the final 120 seconds for ledger replay, report
  construction, terminal validation, and the final response.
- Do not spend the reserve reading contracts, schemas, examples, or script implementations. If execution reaches
  the reserve without verified results, close truthfully as `partial|failed` instead of starting new discovery.
- On the normal path, read this file once. Do not open validator source. A non-zero command may be repaired from its
  documented error code once; an unknown error blocks the transition instead of triggering broad source review.
- Check for `.git` before invoking Git. A fixture or unpacked source tree without `.git` is valid; do not put an
  unguarded `git rev-parse` in a compound discovery command and turn repository absence into a workflow failure.

## Trusted paths

Resolve the installed start-task directory once as `skill_root`. Runtime-native installations use:

- Codex: `.agents/skills/start-task`
- Claude Code: `.claude/skills/start-task`

Use only these bundled executables:

- `scripts/write-canonical-json.js` — canonical JSON, exclusive create, no trailing newline
- `scripts/initialize-run.js` — exact two-event ledger bootstrap for a fresh run
- `scripts/assess-clarity.js` — exact evidence signals, unknown-to-dimension caps, and derived 0–4 ratings
- `scripts/score-clarity.js` — deterministic dimension weights, awarded points, score, threshold, and gate status
- `scripts/materialize-approved-spec.js` — validate a ready child candidate and bind final projection/spec bytes
- `scripts/normalize-task-dag.js` — safe coverage/authority/clarity binding into one fresh DAG candidate
- `scripts/verify-and-freeze-run.js` — observed verification plus complete terminal checkpoint
- `scripts/append-execution-ledger.js` — one reported or filesystem-digest event
- `scripts/record-execution-command.js` — observed command start/finish evidence
- `scripts/freeze-run-control.js` — canonical phase/anchor validation plus frozen-checkpoint ledger event
- `scripts/validate-clarity-gate.js`
- `scripts/validate-task-dag.js`
- `scripts/validate-run-control.js`
- `scripts/validate-execution-ledger.js`
- `scripts/validate-terminal-response.js`

Do not run these scripts with `--help` and do not read their implementation on the normal path.

## Canonical artifacts

Create the run directory once, then send each JSON object to the canonical writer. The writer accepts only a fresh
relative path below `.vulpora/tasks/<run-id>/`, rejects symlink parents and existing files, writes mode `0600`,
re-reads the exact bytes, and returns their SHA-256.

Bootstrap with exactly two filesystem operations: `mkdir -p .vulpora/tasks`, then
`mkdir -m 700 .vulpora/tasks/<run-id>`. The second command must create a fresh directory and must not use `-p`.
Immediately initialize the ledger once with:

```text
node <skill-root>/scripts/initialize-run.js <ledger> <run-id> <runtime-instance-id> <runtime-configuration-id>
```

Relay its two progress lines. Do not manually append `phase_started` or `run_initialized` and do not probe the
append script first.

```text
node <skill-root>/scripts/write-canonical-json.js <relative-artifact-path>
```

Supply the JSON object on stdin. Use the returned `path` and `sha256`; never add or remove a newline with
`truncate`, `sed`, or an ad-hoc `node -e` serializer. This applies to clarity projections, clarified spec, task DAG,
routing receipts, and every run-control checkpoint.

For a ready `requirement-dialogue` candidate, pass its complete fenced JSON object unchanged on stdin to:

```text
node <skill-root>/scripts/materialize-approved-spec.js <run-id>
```

The preferred input is `vulpora.clarified-task-spec-candidate/v2`. For compatibility, the helper also accepts a
complete child-produced `vulpora.clarified-task-spec/v2` proposal, ignores its proposed path/hash, and rebuilds
those bindings locally. It validates the normative clarity projection, exclusively creates final
`clarity-projection.json` and `clarified-spec.yaml`, and returns the spec id
and both hashes. Legacy sentence-only acceptance criteria are deterministically assigned `AC-001`, `AC-002`, ...;
use exactly the returned/frozen IDs in the DAG. Do not hand-build a substitute spec or discard a ready candidate. These bytes are prepared while
still in `clarify`; their ledger freeze evidence is appended in `approve` after the implementation-intent commit.

Append ledger input as one JSON object on stdin:

```text
node <skill-root>/scripts/append-execution-ledger.js .vulpora/tasks/<run-id>/execution-ledger.jsonl
```

Never invoke the append script without that complete stdin object. A helper or validator non-zero exit blocks the
phase; do not replace its missing success event with a manual claim or manually append a run-control freeze.

Relay its returned `progress_line`. Filesystem evidence uses the relative file path as `source_ref`; the writer
computes the digest, and therefore every `source_type: filesystem_digest` event must use `status: passed`.
Runtime commands must go through the recorder:

```text
node <skill-root>/scripts/record-execution-command.js <ledger> <run-id> <phase> <timeout-seconds> <label> -- <argv...>
```

Validate each round projection during `clarify` with `--stdin-file <round-path>` but without a command contract.
Only after freezing `clarity-projection.json` and recording `spec_committed`, validate that final path during
`approve` with both `--stdin-file <final-path>` and `--contract clarity-gate`. Do not assemble a run-control
validator command manually. After canonical-writing the next checkpoint, freeze it with:

```text
node <skill-root>/scripts/freeze-run-control.js <ledger> <run-id> <next-checkpoint>
```

The helper reads the checkpoint phase, current ledger anchor and previous frozen state, records the trusted
validator invocation, and appends the passed `run_control_state_frozen` event. Relay its progress lines.

## Clarification scoring and fallback

Run `score-clarity.js` on the initial six-dimension evidence-signal assessment before broad repository discovery.
The scorer calls `assess-clarity.js` and rejects caller-supplied ratings, points, or totals. If the score is
below 85, perform only the targeted lookup needed for the weakest dimension and ask one validated question. After
the user answers, merge the decision and recompute the score after every user answer. Continue one question per
turn while the score remains below 85 or a non-bypassable blocker remains. At or above 85, proceed without another
question when no non-bypassable blocker remains. Every below-threshold frame tells the user that they can confirm the current task specification,
record the remaining reversible uncertainty, and start implementation.

```bash
node <skill-root>/scripts/score-clarity.js < <assessment-input.json> > <clarity-projection-candidate.json>
```

Open one persistent clarification-child session without a skill-owned turn count or wall-clock cap. Resume it with
the latest ambiguity ledger after each user answer. A host-reported spawn failure, disconnect, terminal timeout, or
malformed result gets no wait-count retry. Pair any dispatched child lifecycle events, interrupt a live failed child
when supported, and apply the canonical requirement-dialogue contract leader-inline. Record exact paired
`clarification_fallback_started` and `clarification_fallback_finished` events around that primary-only work. The
fallback must pass the same score, clarity, question, materialization, and authority checks. Only a missing
canonical bundle, calculator, writer, or validator is a hard dependency failure.

For each round, append `clarification_round_started` with the immutable input digest. Append a
`clarification_heartbeat` only for host-observed output or progress, and append `clarification_host_yielded` whenever
the host yields scheduling control without a terminal result. Two successive host yields with no intervening
heartbeat or terminal output require `clarification_round_stalled:...:no_progress_at_yield` and the audited fallback.
Host disconnect or terminal timeout stalls the round immediately with the matching reason. This is a progress-based
watchdog, not a skill-owned elapsed-time or question-count cap. A completed round records its output digest, score,
and one of `needs_input|ready|escalated|invalid_result`; only `needs_input` may open the next numbered round.

## One-pass phase sequence

1. `clarify`: initialize the ledger, calculate the initial score, open or resume the persistent
   `requirement-dialogue` session or use the audited leader-inline fallback, validate its projection, and either stop
   for one user answer or materialize
   its ready candidate. Create and freeze `run-control-0001` as
   `clarify -> approve` with the returned spec id/hash before finishing `clarify` or starting `approve`.
2. `approve`: record implementation intent, final projection freeze, observed clarity validation and spec artifact
   digest; then freeze `approve -> split`.
3. `split`: dispatch `task-splitter` once; canonical-write, validate, and freeze its DAG.
4. `execute`: use the DAG execution kind. For `leader-inline`, implement directly without an execution child.
5. `integrate`: inspect the actual bounded diff and record the decision.
6. `verify`: call `verify-and-freeze-run.js` with the exact acceptance command. It records the command, binds every
   task/AC to its observed reference, and freezes the complete `verify -> terminal` checkpoint.
7. `terminal`: freeze the final run-control checkpoint, replay the ledger, construct the report, validate, return.

Complete-profile event names are exact: `integration_recorded`, `verification_recorded`, and `terminal_recorded`.
Do not substitute `integration_decision`, `integration_completed`, `verification_completed`, or another synonym.
Every phase has exactly one `phase_started` first and one `phase_finished` last. In terminal, append
`terminal_recorded` and `terminal/phase_finished`, then replay the final ledger head/count before returning the report.

For every clarity dimension, the assessment has exactly the four named boolean signals defined by
`assess-clarity.js`; extra or missing signals and direct numeric ratings are invalid. Its `evidence` is at least 12
non-whitespace characters after one exact provenance prefix:
`user:`, `repository:`, `policy:`, or `assumption:`. The `goal` evidence must start with `user:`. The
`authority_risk` evidence must start with `user:` or `policy:`. An `assumption:` source may not claim a rating above
2. Use direct task text for goal evidence and inspected repository facts for scope, acceptance, constraints, and
verification; do not invent another prefix such as `task:` or `runtime:`.

At each transition, finish all work events for the current phase, canonical-write the next
`run-control-NNNN.json`, then call `freeze-run-control.js` once. Only after that helper passes may you append the
current `phase_finished` and next `phase_started` events. This keeps the recorder's checkpoint phase monotonic in
the ledger. Do not separately invoke `validate-run-control.js`, reconstruct its phase/anchor arguments, probe
script behavior, or rewrite a checkpoint after failure.

Every run-control file has exactly these fields; it is not the larger session-state object from `SKILL.md`:

```json
{
  "schema": "vulpora.start-task-run-control/v1",
  "run_id": "<run-id>",
  "current_phase": "clarify",
  "next_phase": "approve",
  "spec": {"id": "<spec-id>", "revision": 1, "sha256": "<frozen-spec-sha256>"},
  "next_spec": {"id": "<spec-id>", "revision": 1, "sha256": "<frozen-spec-sha256>"},
  "question": {"requested": false, "reason": null, "blocker_signature": null, "asked_signatures": []},
  "tasks": [],
  "acceptance_criteria": [],
  "acceptance_evidence": [],
  "terminal_status": null,
  "successor": null
}
```

Use `spec: null` and `next_spec: null` only while remaining in `clarify` without an approved spec. Introduce the
frozen DAG task/AC inventory in the `split -> execute` checkpoint, then update only task status and append observed
AC evidence. Set `terminal_status` only when `next_phase` is `terminal`. Do not add `workflow`, `phase`, scoring,
ledger, path, or summary fields to this file.

Each task projection has exactly three fields. For `split -> execute`, copy IDs and criterion IDs from the validated
DAG and use `not_run`, never `pending`:

```json
{"id":"T-001","status":"not_run","acceptance_criterion_ids":["AC-001"]}
```

Allowed statuses are `not_run|candidate|verified|failed|cancelled|blocked`. Preserve the exact task and AC inventory
after split. Use `candidate` for successfully implemented results through integrate, and `verified` only after
fresh observed verification passes. Each acceptance evidence item has exactly
`acceptance_criterion_id`, `task_id`, `verification_outcome`, and the recorder-observed `observed_ref`; do not place
descriptions, paths, summaries, `pending`, or DAG task bodies in a run-control projection.

On the ready path, do not hand-build the final checkpoint. After `verify/phase_started`, run:

```text
node <skill-root>/scripts/verify-and-freeze-run.js <ledger> <run-id> <timeout> <label> \
  .vulpora/tasks/<run-id>/run-control-0006.json -- <acceptance-command...>
```

Only after it passes may you append `verify/phase_finished` and `terminal/phase_started`. Relay all returned progress
lines and reuse its exact `observed_ref` in the terminal report.

For `clarify -> approve`, both `spec` and `next_spec` must already contain the same approved spec id, revision, and
canonical SHA-256 returned by `materialize-approved-spec.js`; neither may be null. After that checkpoint passes,
append `clarify/phase_finished`, `approve/phase_started`, then exactly one `approve/spec_committed` with
`source_type: user_decision` and the current `task-input-sha256:<digest>` or `answer-sha256:<digest>`. A failed
checkpoint is immutable evidence: do not create the next checkpoint number or continue the phase. Close the run
truthfully because checkpoint indices cannot be skipped or overwritten.

Ledger child lifecycle event names are exactly `child_dispatched` and `child_finished`, paired with
`source_ref: child:<agent-id>:<native-child-id>`. Do not invent `child_result`, `child_completed`, or another alias.
The DAG parallelism object uses `higher_policy_limit: null` and `fixed_cap: null` when no smaller host policy exists;
the word `unbounded` is explanatory prose, never the JSON value.

Never write unvalidated child output directly to the frozen `task-dag.yaml`. Canonical-write it first as
`task-dag.candidate-00.json` and run `validate-task-dag.js` against the frozen spec. If it fails only because
coverage is not bidirectional, frozen forbidden authority was dropped, or the normative clarity gate drifted, call `normalize-task-dag.js <candidate>
<spec> <fresh-candidate-01>` once, then validate that fresh output. Do not hand-edit or semantically redesign the
DAG during normalization. Each task `outputs[]` is an exact member of that task's
`write_scope[]`; use `outputs: []` for a read-only/deterministic task. After one candidate passes, send those exact
bytes through the canonical writer once to `task-dag.yaml`, re-read the hash, and append the frozen artifact event.
Never overwrite, delete, or reuse a failed candidate or an existing final path.

Every coverage entry's `task_ids` must equal the exact set of tasks whose `acceptance_criterion_ids` contains that
criterion; do not add a task only on the coverage side or invent IDs absent from the frozen spec.
Every task's `authority.forbidden` must contain every exact string in frozen `spec.authority.forbidden`; the
normalizer may only add those restrictions, never remove or weaken task restrictions.
The entire DAG `clarity_gate` object, including explicit null skip provenance fields, must equal the frozen spec's
normative gate. The normalizer copies that object exactly and never recalculates its score or risk decision.
For compatibility it may also flatten a legacy `spec` + `task_graph` + object-coverage envelope only when every
task is `leader-inline`; native-subagent legacy envelopes remain unsupported rather than guessing route semantics.

## Terminal report

Build the report from the frozen spec/DAG hashes, native child results, routing receipts, recorder results, final
run-control state, and validated ledger anchor. Start from
`reference/kb/orchestration-report.valid.json`; replace its example values and remove example-only execution
children when the DAG uses `leader-inline`. Do not read the 20 KB schema on the normal path.

When the host supplies an output schema, return the report object directly and put the Korean summary in
`korean_summary`. Otherwise return a concise Korean summary plus exactly one fenced JSON object and validate the
complete envelope through `validate-terminal-response.js`. After entering the 120-second reserve, contract
discovery commands such as `find`, `rg`, `sed`, `--help`, and ad-hoc `node -e` are forbidden; only report assembly
and bundled validation remain.
