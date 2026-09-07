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
./vulpora models --runtime codex > /absolute/runtime-models.json
./vulpora session prepare --task /absolute/task.json --catalog /absolute/runtime-models.json --out /absolute/attempt-001
./vulpora session status --capsule /absolute/attempt-001/capsule.json
./vulpora session run --capsule /absolute/attempt-001/capsule.json
./vulpora session status --capsule /absolute/attempt-001/capsule.json
```

Use `--policy /absolute/model-routing-policy.json` on `prepare` for an explicit operator policy. Preparation is
read-only with respect to the target workspace and starts no model turn. It creates an exclusive attempt
directory with a compact capsule, a preparation digest, and the output schema. It resolves the model from the
catalog and policy, fingerprints the executable and workspace, and reports the exact selected model and effort.
Inspect that result before execution. Calling `run` starts the model work.

`taskType` accepts `deterministic`, `lookup`, `documentation`, `implementation`, `review`, `testing`,
`architecture`, and `research`. Difficulty is `simple`, `moderate`, or `complex`; risk is `low` or `high`.
Defaults are `implementation`, `moderate`, `low`, and `read-only`. The task router maps those observations to
the existing model policy. A `deterministic` task returns `NO_MODEL` and
`PRIMARY_DETERMINISTIC_EXECUTION_REQUIRED`; arbitrary shell commands are never executed from task JSON.

## What reaches the worker

The stdin capsule contains only task and attempt IDs, the goal, workspace, relevant files, acceptance criteria,
constraints, mode, and a small execution/result contract. It omits the primary transcript, unrelated task results,
full global plans, credentials, and runtime event history. Unknown task fields such as `parentTranscript` are
rejected. The CLI receives the selected model and effort as separate argv entries, with `shell: false`.

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

Runtime usage is separate from the worker's answer. Exactly one top-level Codex `turn.completed` usage event
can supply observed input, cached-input, and output counts. Cached input is part of input; reasoning counts, when
reported, are preserved separately and are not added again. Missing, malformed, or duplicated usage is
`unavailable`, never zero. Model/tool prose cannot supply usage observations. The requested model/effort are
recorded as requested settings, and `backendIdentity: NOT_ATTESTED` remains explicit.

Raw runtime stdout/stderr are consumed with bounded buffers and discarded. Their byte count and digests are
retained alongside elapsed time, exit information, and observed usage. Only the bounded candidate and transport
records remain on disk. Keep secrets and unrelated source out of task and result artifacts.

## Limits, interruption, and stale work

Optional task `limits` override these defaults:

| Limit | Default | Maximum |
|---|---:|---:|
| `timeoutMs` | 300,000 | 3,600,000 |
| `maxPromptBytes` | 16,384 | 65,536 |
| `maxResultBytes` | 16,384 | 65,536 |
| `maxOutputBytes` | 4,194,304 | 16,777,216 |

These byte/time limits are enforced by the transport. Token estimates and relative policy units are checked
before dispatch; they do not impose a provider billing or total-token hard cap. A fresh session can reduce the
primary's context while increasing total tokens through repeated repository discovery. Measure both before
claiming savings.

An exclusive `launch.json` prevents the same prepared attempt from starting twice. The runner rejects a changed
executable, edited capsule/schema, expired route, or changed workspace before dispatch. A Git workspace snapshot
includes HEAD and working-tree state as well as the listed files; concurrent edits can make a prepared attempt
stale. Use a stable task workspace and prepare a new attempt from current evidence after reconciliation.

Timeout, cancellation, output overflow, missing/mismatched output, and other execution failures report unknown
mutation state. The runner attempts to stop its owned process group, but does not attest cleanup of every
possible descendant. A process exit alone is not proof that the workspace is unchanged.

`status` reports `STARTED_OUTCOME_UNKNOWN` when a launch exists without a final result. It does not infer that
the process is still running, and does not restart it. Reconcile the actual process and workspace before creating
a new attempt. No automatic retry, `resume --last`, session forking, or implicit model escalation is performed.
Use the existing routing-attempt classifier when deciding whether evidence justifies a retry or capability change.

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

Offline regression coverage is in [`install/test-session-runner.sh`](../../../../install/test-session-runner.sh).
Those fake-runtime tests verify transport behavior, not a live model's task quality or sandbox enforcement.
