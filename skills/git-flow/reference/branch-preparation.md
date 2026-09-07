# Work-start branch preparation

This is the new-task contract, selected before implementation. Use Korean user-facing messages.
Do not commit, push, open an MR, auto-stash, rebase, force-push, discard changes, or delete branches here.
A user interruption or any failed precondition ends this path with the observed partial state.

## 0.7 Work-start branch preparation (MUST run before implementation edits)

Choose the new-task path when the skill is routed before the first implementation edit. Choose the landing path
when the user is committing/pushing work that already exists on a non-protected branch. A new-task call ends after
branch preparation; a landing call uses the publication contract instead and does not switch branches.

Bind `$BASE_BRANCH` from an explicit user target branch;
otherwise bind it to `develop`. Bind `$MR_TARGET=$BASE_BRANCH`; the override applies to both branch creation
and the later MR target.

Before switching branches, inspect `git status --porcelain`. If the tree is dirty, preserve it and stop rather than
auto-stashing, resetting, or carrying changes onto another branch. Then fetch the exact base from origin. If a local
base exists, switch to it and fast-forward it with `git merge --ff-only origin/$BASE_BRANCH`; if it does not, create
the local tracking branch from `origin/$BASE_BRANCH`. Missing or diverged bases stop the flow without rebase/merge.

Derive `$WORK_BRANCH` from task intent and repository-local naming conventions. Prefer the repository's observed
prefix; otherwise use `feature/`, `fix/`, `refactor/`, or `chore/` according to the work type plus a short kebab-case
slug. Create it from the updated base with `git switch -c "$WORK_BRANCH" "$BASE_BRANCH"`. A protected branch may be
checked out only for this clean fast-forward step; implementation commits and pushes on it remain forbidden.

**Outputs:** `$BASE_BRANCH`, `$WORK_BRANCH`, `$MR_TARGET`.

---

Report the selected base, created work branch, fast-forward evidence, and any blocker, then return to
implementation. Never fabricate branch creation or continue after a dirty/missing/diverged base.

For a rationale question about the repository branching convention, read
[branching model](kb/branching-model.md); routine branch preparation does not require that topic.
