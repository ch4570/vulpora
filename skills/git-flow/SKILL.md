---
name: git-flow
description: Prepare a safe work branch or commit, push, and open a GitLab merge request when the user asks to start, land, or publish implementation work.
---

# git-flow — Work Branch and Commit/Push/MR Skill

## Purpose

Prepare an updated child branch before implementation, or land an existing non-protected work branch through explicit staging, Korean commit messages, push, and one GitLab merge request.

## Prerequisites

Select the requested path before any Git mutation:

- Before implementation, read [branch preparation](reference/branch-preparation.md). This path ends after the
  child branch is ready; it does not load commit, transport, or MR recipes.
- To land existing work, read the complete [commit/push/MR contract](reference/kb/operating-contract.md).
  Keep the current branch; do not run branch preparation over existing changes.

Read [principles](reference/principles.md) only for rationale, and [the KB index](reference/kb/INDEX.md) only to
find a needed transport or policy topic. They are not unconditional first reads. Both paths preserve Korean
user-facing messages, explicit target/default `develop`, existing user changes, and the stop conditions below.

## Instructions

1. Bind the explicit target branch, otherwise `develop`; require a clean, non-diverged base before creating a child branch.
2. For existing work, stop on protected branches, unsafe staged files, missing authority, dirty base preparation, or unresolvable transport.
3. Stage explicit in-scope paths, create coherent Korean commits, check divergence before each push, and create or reuse exactly one MR targeting the bound base.
4. Preserve the contract's transport order, secret guard, stop conditions, MR fields, and post-creation verification. Never force-push, rebase, merge, or auto-stash.

## Examples

- New task: fast-forward `develop`, create a task-derived child branch, then return to implementation without landing an empty commit.
- Existing work: inspect the diff, stage only the coherent change set, push after the divergence check, and create or reuse the MR.

## Limitations

Code review, CI polling, MR merge, branch deletion, force-push recovery, and rebase are outside this skill. The detailed command recipes and MR template remain in the operating contract to keep normal skill loading small.

## Troubleshooting

| Condition | Resolution |
|---|---|
| Dirty or diverged base | Preserve it and stop; do not stash, reset, or merge around it. |
| No authenticated GitLab transport | Give the contract's recovery guidance and stop unless an approved fallback is available. |
| Existing MR | Reuse it and verify its canonical IID and URL. |

## Verify

Report the branch, transport, MR IID/URL, staged scope, verification evidence, and any remaining risk.
