---
title: Start Task lightweight and standard path
source: ../../SKILL.md
last_fetched: 2026-09-01
skills: [start-task]
---

# Lightweight and standard execution

Use this path unless the profile selector returns `audit`. Its purpose is to finish ordinary repository work with
the same engineering discipline as a direct coding task, without manufacturing audit artifacts.

## Select the profile

Inspect the request and the smallest useful repository surface first. Build the exact structured input accepted by
`scripts/select-execution-profile.js` and use its decision. Do not infer risk from task size alone.

Set signals from explicit user text, higher policy, or observed repository/contract facts. Do not invent a risk
signal, but do not encode an unresolved possibility as confidently safe either: mark the corresponding scope,
acceptance, or verification field unresolved so the task enters `standard`, investigate it, and upgrade to `audit`
before any risky action if evidence confirms an audit signal.

- `lightweight`: scoped, reversible work with known acceptance and verification, normally owned by one agent.
- `standard`: ordinary work that has material unknowns, a public contract or shared schema, a broad scope, or two
  or more genuinely independent lanes. This is still not an audited run.
- `audit`: explicit audit requests and high-cost failure domains: destructive or irreversible effects, security or
  authorization boundaries, credential access, production migrations/backfills, coordinated production releases,
  hard-to-reverse external effects, or regulatory/audit evidence requirements.

An ordinary API contract change is `standard`, not `audit`, unless one of the audit signals is also present. A task
touching several coupled modules is one sequential lane, not artificial parallel work.

In `audit`, the ledger and DAG are mandatory, but routing receipts exist only for native execution attempts. A
wholly `leader-inline` audit DAG creates no artificial routing receipt.

## Shared rules

1. Inspect repository facts and applicable external contracts before asking about them.
2. Write one concise working brief containing goal, in-scope files or modules, resolved decisions, acceptance
   behavior, verification, and remaining risks. Keep it in session context; do not create a run directory, hash,
   projection, formal specification, or ledger for this path. A delegated standard lane may write the transport
   capsule, local diagnostics, and bounded result defined below; these do not create an audit workflow.
3. An implementation request already authorizes ordinary in-scope implementation. Do not ask for confirmation of
   the brief when safe defaults and repository evidence resolve the work.
4. Ask only for choices that materially branch the result or require new authority. In `standard`, collect all
   currently known material choices into one concise turn, with recommended defaults when useful. Do not serialize
   independent questions across multiple turns merely to preserve an interview ritual.
5. Use one primary execution owner for coupled changes. Delegate only work that is independently executable and
   verifiable. Include configuration, fixtures, and test resources required for the owned outcome in the same
   write scope; do not stop a child over an obvious omitted support file when the primary can safely reclaim it.
6. If a child stops making useful progress and the cause is understood, interrupt or reclaim the task at the next
   progress check, no later than 60 seconds without progress. Do not spend additional waits on a known one-line or
   primary-owned blocker.
7. Run the narrowest repository-native verification that proves the changed behavior. Child-local checks may be
   reused when their exact command and result are visible; run one final integration check for combined work, but
   do not force duplicate `--rerun` execution without evidence that cached or child results are insufficient.
8. Report the normal coding outcome: changed files, simplifications, verification evidence, remaining risks. Do
   not emit orchestration JSON, route receipts, or ledger-derived progress lines. Keep transport records local;
   summarize reviewed session results in the normal coding report.

## Lightweight path

Proceed directly after the brief. Keep planning to a short task list only when the edit has multiple dependent
steps. Stay primary-owned; do not create a DAG or execution child. If discovery reveals a standard or audit signal,
upgrade before the affected action.

## Standard path

Use a short implementation plan and one primary owner. For two or more disjoint lanes, prefer the bundled
[independent-session transport](independent-sessions.md). It starts a fresh Codex session with a bounded task,
explicit model/effort, selected paths, acceptance checks, and no parent transcript. Inspect the candidate's diff
and evidence before integrating it. Discard raw events after extracting usage and diagnostic digests; return only the compact result to the
orchestrator. Small or coupled work stays primary-owned; a new session's startup and rereads can cost more tokens.

Follow [task/model routing](model-routing.md) and reserve the shared budget before each attempt. Transport hashes
and lifecycle files prevent stale/duplicate starts; they are not audit DAGs or trusted backend attestations. The
current transport supports Codex only. If it is unavailable, keep the task primary-owned or use the verified native
routing path. Explicit audit work retains its native receipt contract; never fabricate native child IDs from a
process or session identifier. If an audit signal appears, switch before the risky action.

## Completion check

Before finishing, inspect the actual diff and confirm that the requested behavior works, relevant tests pass, no
known in-scope error remains, and pre-existing user changes were preserved.
