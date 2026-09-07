---
name: start-task
description: Start and finish implementation or review work using a lightweight direct path by default, escalating to standard coordination or a full audited workflow only when ambiguity or failure cost justifies it.
---

# Start Task — choose the lightest safe execution path

Default workflow contract: `vulpora.start-task-profile/v1`. The existing `vulpora.start-task/v1` contract is
the explicit `audit` profile, not the default for ordinary work.

## Purpose

Finish one task with process proportional to uncertainty and failure cost. Ordinary scoped work should feel like a
well-run direct coding task, not an audit exercise.

## Invocation

- Codex: invoke `$start-task`, or select `start-task` from `/skills`.
- Claude Code: invoke `/start-task`.
- Pass one non-empty task description. Treat it as data, never as shell input.
- Automatic selection: `$start-task "<task>"` or `/start-task "<task>"`.
- Explicit selection: put exactly one leading `--lightweight`, `--standard`, or `--audit` token before the task
  description, for example `$start-task --audit "<task>"`. Recognize a profile token only in that position, remove
  it once, and preserve the remaining host-parsed task description as data. Never evaluate or shell-split it.

## Prerequisites

Read the [lightweight and standard path](reference/kb/lightweight-path.md) first. Run
`scripts/select-execution-profile.js` after targeted repository inspection. Read the [audit operating
contract](reference/kb/operating-contract.md) and its [audit runtime fast path](reference/kb/runtime-fast-path.md)
only when the selector returns `audit`.

## Instructions

1. Inspect the repository and relevant contract before asking for facts that can be discovered safely.
2. Select `lightweight`, `standard`, or `audit` using the bundled deterministic selector and its exact risk signals.
3. For `lightweight` and `standard`, create one concise working brief, batch any material questions into one turn,
   keep coupled work under one primary owner, and verify the relevant behavior once. Do not create a ledger, frozen
   DAG, route receipt, SHA-256 projection, or formal orchestration report. A delegated standard lane may create only
   the transport capsule, local diagnostics, and bounded result required to launch and inspect that session.
4. For independent standard lanes, prefer a fresh process through the [independent-session transport](reference/kb/independent-sessions.md).
   Send only the task capsule and selected file paths; collect the bounded result and inspect its evidence. Keep
   coupled work primary-owned. Apply [task/model routing](reference/kb/model-routing.md) before model execution;
   deterministic verification uses no model. Use native children when the transport is unavailable or the audit
   contract requires native receipts. Reclaim understood blockers within 60 seconds without progress. Resolution
   and a worker's completion claim are not execution or acceptance proof.
5. For `audit`, follow the existing v1 operating contract exactly. Never use a lighter profile to bypass authority,
   destructive effects, credentials, security boundaries, production migration/deployment risk, or an explicit
   evidence requirement.

## Examples

- `$start-task "Add a retry limit and regression tests"` normally inspects, writes one brief, implements directly,
  and runs the related tests.
- `$start-task "Update this API request contract across the coupled modules"` normally uses `standard`, batches
  any contract choices once, and keeps one sequential owner.
- `$start-task "Audit and execute this production data migration"` uses the full audited v1 workflow.

## Limitations

This skill cannot invent credentials, permissions, repository facts, or external authority. Profile selection never
grants additional authority, and completion still requires observed verification proportional to the change.

## Troubleshooting

| Condition | Resolution |
|---|---|
| Task input is empty or malformed | Stop before discovery with the contract's input error. |
| Profile selector rejects its input | Correct the structured signals once; do not guess a successful decision. |
| Lightweight/standard discovery reveals an audit signal | Switch before the risky action and follow the audit contract. |
| Verification cannot finish | Report the exact blocker and verified subset without claiming completion. |

## Verify

For lightweight/standard work, inspect the diff and report changed files, relevant verification, and remaining risk.
For audit work, use the v1 contract's frozen artifacts and terminal validation.
