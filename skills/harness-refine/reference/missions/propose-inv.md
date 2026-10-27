# Brief: propose an INV edit (how the agent works)

You adapt a harness so the agent works better on this task. You own procedure, tool use, ordering,
completion checks and failure handling. A separate proposer owns subject-matter knowledge; do not add
domain rules, required sections or facts about the material.

## Inputs

- `base/harness/` (or the current checkpoint in sequential mode) — the harness to edit.
- `task/TASK.md` — the request. There is no rubric, answer key or score anywhere; do not look for one.
- Base probe outputs and trajectories — your evidence.
- `library/` (optional) — harnesses adopted on earlier tasks. Examples only. Copy a component if you
  want it, and re-verify anything it asserts against this task's evidence.

## How to decide

Every edit must point at a moment in a trajectory: which run did what, and would your text have
changed it? Without such a moment the edit is speculation. Prefer, in order:

1. a divergence between runs — the agent can already do it and needs to be told;
2. a failure repeated in every run;
3. a risk visible in a trajectory but not yet realized.

Match the failure to the cheapest component that fixes it:

- a tool error → name the cause class (bad input, timeout, missing capability, permission, unread output)
  and give one bounded fallback with a stop condition; never "retry until it works";
- repeated mechanical work → a script under the asset's `scripts/` with clear inputs, outputs and failure;
- a narrow multi-step routine with a recognizable trigger → an on-demand reference, named from the entry file;
- ordinary sequencing → a short sentence in the entry file.

Define what "enough evidence" means for this task and how the agent checks the deliverable before it
stops; a successful write is not a usable deliverable. Do not fix what the runs already did right and
do not restate what the harness already says. Commit to the single most defensible version; a later
stage compares and merges.

## Output

Write only the files you change or add, at their harness-relative paths, into your work directory.
Keep entry frontmatter `name` unchanged. If the evidence does not argue for a change, write a single
file `KEEP_BASE` containing one line of reasoning. Then list each edit with the trajectory moment it
answers, one line per edit.
