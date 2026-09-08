---
title: Independent sessions with bounded task context
source: ../../SKILL.md
last_fetched: 2026-09-07
skills: [start-task]
---

# Independent sessions

Use a fresh Codex CLI session for an independently executable, independently verifiable standard-profile task
when that keeps discovery and tool output out of the primary conversation. Keep coupled changes with one owner.
Lightweight work and deterministic checks remain primary-owned. A separate session has its own model context;
it does not by itself establish a separate filesystem or stronger authority boundary.

This named transport is implemented by [`session-runner.js`](../../scripts/session-runner.js). It is distinct
from native subagents and from the disabled `codex-agent-runtime` compatibility entry. No parent transcript is
passed, no native child ID is invented, and no backend model identity is attested.

## Prepare, inspect, run, collect

Create a task JSON using [`session-task.schema.json`](../../scripts/session-task.schema.json):

```json
{
  "schema": "vulpora.session-task/v1",
  "id": "review-search-validation",
  "goal": "Review the search input validation and report concrete issues.",
  "runtime": "codex",
  "taskType": "review",
  "difficulty": "moderate",
  "risk": "low",
  "delegation": "auto",
  "cwd": "/absolute/project",
  "files": ["src/search.ts", "test/search.test.ts"],
  "acceptance": ["Each finding cites a file and explains an observable failure."],
  "constraints": ["Keep the existing API behavior; report recommendations without applying changes."],
  "mode": "read-only",
  "estimatedTokens": 4000,
  "remainingTokens": 12000,
  "maxRelativeUnits": 30
}
```

Paths in `files` are relative to the existing absolute `cwd`. A listed file may be absent when the task is to
create it; symlink traversal and paths escaping the workspace are rejected. The list identifies the task focus
and the files whose contents are fingerprinted. It is not an operating-system file access allowlist.

From the source checkout, use an existing parent directory for the new attempt:

```sh
./vulpora session budget-init --out /absolute/shared-budget.json --tokens 100000 --units 60
./vulpora models --runtime codex > /absolute/runtime-models.json
./vulpora session prepare --task /absolute/task.json --catalog /absolute/runtime-models.json \
  --budget /absolute/shared-budget.json --out /absolute/attempt-001
./vulpora session status --capsule /absolute/attempt-001/capsule.json
./vulpora session run --capsule /absolute/attempt-001/capsule.json
./vulpora session status --capsule /absolute/attempt-001/capsule.json
./vulpora session budget-status --budget /absolute/shared-budget.json
```

Reuse the same budget file across related attempts, including parallel sessions. Keep it outside the task's
`cwd` so budget updates do not invalidate workspace fingerprints. Model-backed preparation requires `--catalog`,
`--budget`, and `--out`; older capsules prepared without a budget must be prepared again.

Use `--policy /absolute/model-routing-policy.json` on `prepare` for an explicit operator policy. Preparation is
read-only with respect to the target workspace and starts no model turn. It creates an exclusive attempt
directory with a compact capsule, a preparation digest, and the output schema. It resolves the model from the
catalog and policy, fingerprints the executable and workspace, and reports the exact selected model and effort.
Inspect that result before execution. Calling `run` starts the model work.

Preparation validates the repository-owned output schema before creating an attempt directory. Execution
validates the frozen and installed schemas again before reserving budget or starting Codex. Missing property
types, incomplete object contracts, malformed array definitions, and invalid supported constraints fail locally
as `OUTPUT_SCHEMA_INVALID`; schema features outside the supported local subset fail as `OUTPUT_SCHEMA_UNSUPPORTED`.
These failures launch no model and create no reservation. Valid schemas retain their original raw-file digest
binding and canonical frozen representation. Local preflight cannot guarantee provider acceptance of every
otherwise valid request.

`taskType` accepts `deterministic`, `lookup`, `documentation`, `implementation`, `review`, `testing`,
`architecture`, and `research`. Difficulty is `simple`, `moderate`, or `complex`; risk is `low` or `high`.
Defaults are `implementation`, `moderate`, `low`, `delegation: "auto"`, and `read-only`. Simple low-risk lookup,
documentation, implementation, review, or testing across one or two declared files returns `PRIMARY_OWNED`;
the primary completes that work. Set task-level `delegation: "independent-session"` to explicitly request a session.
Missing/empty scope, broader work, architecture, research, and high risk do not use the tiny-task shortcut.
A `deterministic` task always returns `NO_MODEL` and `PRIMARY_DETERMINISTIC_EXECUTION_REQUIRED`.
These two paths need only `prepare --task /absolute/task.json`: no catalog, budget, attempt directory, or model
execution is needed. Arbitrary shell commands are never executed from task JSON. Delegated simple low-risk
implementation and inspection use frugal/Luna; moderate and bounded complex work use standard/Terra with a
decomposition recommendation for complex work. Complex architecture/research and high risk use frontier.

Optional task `profile: "auto"|"frugal"|"standard"|"frontier"` pins a model tier for an explicit operator choice
or a parent-verified retry. It does not request delegation, bypass the high-risk floor, or increase the budget.
For automatic escalation, retain the original unpinned request, call `resolveTaskEscalation()` with independently
verified failure and settled usage/budget, then prepare a new task using its returned profile. The transport does
not retry automatically. See [model routing](model-routing.md) for the stop conditions and attempt cap.

## Shared budget

Preparation checks the shared budget without reserving it. Immediately before execution, the runner reserves
the task's token estimate and the selected route's relative units under an exclusive budget update. Parallel
attempts share those reservations. Observed input plus output tokens settle the reservation after execution;
cached input and reasoning counts are already included and are not added again. Relative units are policy
weights, not currency. Task-level estimates and limits remain additional per-attempt checks.

Missing or invalid runtime usage retains the reservation and blocks further launches. Observed usage beyond the
shared allowance is recorded and also blocks new launches. This is admission control and accounting, not a
provider billing or total-token hard cap. Do not replace the shared budget or supply manual usage to clear a block.

Budget errors and settlement failures remain explicit in the result. If settlement was busy after the result
was persisted, retry accounting from that result with:

```sh
./vulpora session reconcile --capsule /absolute/attempt-001/capsule.json
```

If an interrupted launcher left a reservation without a result, `reconcile` marks that bound reservation's usage
unavailable, retains its charge, and blocks new launches. A later genuine result can settle it. Reconciliation
starts no model work and cannot manufacture missing usage. Inspect `budget-status` before the next launch;
use the persisted result and actual workspace state to resolve execution uncertainty.

## What reaches the worker

The stdin capsule contains only task and attempt IDs, the goal, workspace, relevant files, acceptance criteria,
constraints, mode, and a small execution/result contract. It omits the primary transcript, unrelated task results,
full global plans, credentials, and runtime event history. Unknown task fields such as `parentTranscript` are
rejected. The CLI receives the selected model and effort as separate argv entries, with `shell: false`.

Optional `contextMode: "inline"` also supplies the complete starting contents of at most four scoped text files.
The serialized source bundle must fit 4,096 bytes and the complete prompt must still fit `maxPromptBytes`.
Larger, binary, or wider scopes fall back to ordinary targeted reads; no source is silently truncated. The default
`contextMode: "read"` keeps native reads. Missing files are marked absent. Source contents are data, and repository
instructions, acceptance criteria, relevant checks, and independent parent verification remain required.
The bundle is bound to the prepared workspace hashes; changes before launch still fail as `STALE_WORKSPACE`.
This opt-in can avoid an initial read round on small tasks, but sending more source upfront can also increase
tokens. Use the [matched context experiment](../../../../evals/token-efficiency/CONTEXT-EVAL.md) to measure it.

For a bounded edit with complete source, set `workerMode: "edit-proposal"` and `mode: "workspace-write"`.
This explicitly requests a session even for a tiny task. It accepts only low-risk implementation, testing, or
documentation work with at most four files, complete source within 4,096 bytes, and existing parent directories.
Nested `AGENTS.md` files make the mode ineligible because the worker cannot discover additional instructions.
Ineligible requests fail before launch; the runner does not silently change the requested mode or risk floor.
Model selection still follows the difficulty router: simple work can use Luna and moderate work can use Terra.

The proposal worker runs in a read-only CLI sandbox with shell execution and web search disabled. It returns
complete replacement file contents using [`session-edit-proposal.schema.json`](../../scripts/session-edit-proposal.schema.json).
The coordinator requires observed provider usage, unchanged workspace fingerprints, matching original hashes,
declared paths, no tool events, and a valid bounded proposal before applying it. Existing modes are preserved;
creation cannot overwrite an unexpected file. Multi-file application has best-effort rollback and requires an
exclusive, stable workspace. Independent verification remains the parent's responsibility.

Forbidden tool items stop the proposal worker at `item.started`, `item.updated`, or `item.completed`, whichever
is observed first. The runner terminates its owned process and refuses to apply the proposal. A started event
does not prove that a tool caused no earlier side effects; inspect actual workspace state after failures.
Missing usage still retains the reservation and blocks more launches. A locally prevented launch and a launched
attempt with unknown usage are different accounting outcomes; the latter is never cleared as a zero-token run.

Set `limits.maxResultBytes` to the needed bound, up to the proposal mode's 16,384-byte maximum, to accommodate
replacement contents. The raw proposal stays in the bounded attempt artifact; the result envelope contains a
compact candidate with `verification: NOT_VERIFIED`. It never reports tests as passed simply because edits applied.
The default `workerMode: "agent"` keeps the existing tool-driven behavior. Use the
[production transport comparison](../../../../evals/token-efficiency/PROPOSAL-EVAL.md) to assess the tradeoff.

The runner uses `codex exec --ephemeral --json --output-schema --output-last-message`, so each attempt begins
fresh and leaves no resumable Codex session transcript through this mode. It disables native multiagent features
and sets a session-depth marker to prevent accidental calls back into this transport. These controls do not
constitute an adversarial process-isolation guarantee.

User configuration, authentication, and execpolicy rules remain available to the installed CLI. The runner does
not read authentication files, use `--ignore-user-config`, use `--ignore-rules`, or bypass approvals and sandboxing.
It explicitly selects the requested `read-only` or `workspace-write` CLI sandbox and `approval_policy="never"`.
Use `workspace-write` only when writing is authorized. Existing repository instructions still apply and may add
context; the explicit capsule size is not the entire runtime input size.

The CLI's `--sandbox` mode can supersede a custom permission profile. This transport does not calculate the
intersection with an unknown parent permission profile or enforce the exact `files` list at the OS level. Use it
only when the selected mode respects the calling session's authority. If a narrower required boundary cannot be
preserved, keep the work in the original runtime or use an approved environment that enforces that boundary.

## Compact candidate results

The worker must return [`session-candidate.schema.json`](../../scripts/session-candidate.schema.json):

```json
{
  "schema": "vulpora.session-candidate/v1",
  "task_id": "review-search-validation",
  "attempt_id": "<the prepared attempt UUID>",
  "status": "candidate",
  "summary": "The review found one missing validation condition.",
  "changed_files": [],
  "evidence": ["src/search.ts:42 accepts a negative limit."],
  "risks": [],
  "blocker": null
}
```

Worker statuses are `candidate`, `blocked`, or `failed`. A worker cannot mark a parent-verified completion.
The transport checks the schema, task/attempt binding, declared changed paths, result size, and workspace
fingerprints before saving `result.json` and printing one result envelope. The envelope always reports
`verification: NOT_VERIFIED`; the primary must inspect actual artifacts/diffs and relevant checks before accepting
the result. Worker-provided verification claims remain candidate evidence.

`run` prints the full result once. Repeated `status` calls return a compact summary with artifact references;
use `status --capsule /absolute/attempt-001/capsule.json --detail` when the full persisted result is needed.

Runtime usage is separate from the worker's answer. Exactly one top-level Codex `turn.completed` usage event
can supply observed input, cached-input, and output counts. Cached input is part of input; reasoning counts, when
reported, are preserved separately and are not added again. Missing, malformed, or duplicated usage is
`unavailable`, never zero. Model/tool prose cannot supply usage observations. The requested model/effort are
recorded as requested settings, and `backendIdentity: NOT_ATTESTED` remains explicit.

Raw runtime stdout/stderr are consumed with bounded buffers and discarded. Their byte count and digests are
retained alongside elapsed time, exit information, and observed usage. Only the bounded candidate and transport
records remain on disk. Keep secrets and unrelated source out of task and result artifacts.

Detailed results also retain bounded `runtime.telemetry`: completed command/file/message counts, UTF-8 byte
proxies, and capped fingerprints of repeated commands. Unknown event names are combined into `other`.
Command text, tool output, and message bodies are not retained by telemetry. These diagnostics do not count
underlying model requests or attribute billed tokens to individual tools. Duplicate commands can be legitimate
verification after an edit; their presence alone does not establish waste. `promptBytes` and `sourceContextBytes`
measure explicit serialization only. Compact status previews omit these diagnostic details.

## Limits, interruption, and stale work

Optional task `limits` override these defaults:

| Limit | Default | Maximum |
|---|---:|---:|
| `timeoutMs` | 300,000 | 3,600,000 |
| `maxPromptBytes` | 8,192 | 65,536 |
| `maxResultBytes` | 4,096 | 65,536 |
| `maxOutputBytes` | 4,194,304 | 16,777,216 |
| `toolOutputTokens` | 2,000 | 12,000 |

The transport enforces byte/time limits and passes `toolOutputTokens` as Codex's `tool_output_token_limit`.
That setting bounds individual tool outputs retained in history; it is not a billing limit.
See the [official Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).
A fresh session can reduce the primary's context while increasing total tokens through repeated repository
discovery. Measure both before claiming savings.

An exclusive `launch.json` prevents the same prepared attempt from starting twice. The runner rejects a changed
executable, edited capsule/schema, expired route, or changed workspace before dispatch. A Git workspace snapshot
includes HEAD and working-tree state as well as the listed files; concurrent edits can make a prepared attempt
stale. Use a stable task workspace and prepare a new attempt from current evidence after reconciliation.

Timeout, cancellation, output overflow, missing/mismatched output, and other execution failures report unknown
mutation state. The runner attempts to stop its owned process group, but does not attest cleanup of every
possible descendant. A process exit alone is not proof that the workspace is unchanged.

`status` includes the current shared budget for pending attempts and reports `STARTED_OUTCOME_UNKNOWN` when a
launch exists without a final result. It cannot infer whether the process is alive and does not restart it.
Reconcile the actual process and workspace before creating a new attempt. Stale processes and budget locks are
not reclaimed automatically. No automatic retry, `resume --last`, session forking, or implicit model escalation is performed.
Use `resolveTaskEscalation()` when deciding whether independently verified evidence justifies a capability change.

## Standard and audit boundaries

Standard work may use these small transport records without creating a frozen spec, DAG, orchestration ledger,
or formal audit report. Collect compact results and perform the necessary primary verification once. The parent
keeps its existing user communication and task ownership responsibilities.

The existing audit DAG and evidence validators recognize native subagents, deterministic work, and leader-inline
execution. They do not yet validate independent-session provenance. Keep audit execution on that verified native
path. Do not label this process a native child, forge a native spawn ID, or count its result as an audit routing
receipt. Audit adoption requires a versioned execution/evidence extension and corresponding validators.

Codex is the implemented transport. Claude Code tasks fail explicitly with `UNSUPPORTED_SESSION_RUNTIME`;
there is no unverified fallback to another provider. The legacy disabled runtime skill remains disabled.

Run `npm run test:routing` for offline routing, catalog, agent compatibility, evidence, session budget, I/O, and
transport coverage, including [`install/test-session-runner.sh`](../../../../install/test-session-runner.sh).
Those fake-runtime tests verify transport behavior, not a live model's task quality or sandbox enforcement.
