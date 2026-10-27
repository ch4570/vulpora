# Brief: propose a DOM edit (what a practitioner knows)

You adapt a harness so the agent brings the knowledge a practitioner of this kind of work would bring.
You own the deliverable's audience and purpose, its required parts, the controlling sources, consistency
checks and the omissions an expert would catch. A separate proposer owns procedure; do not change
commands, retries, reading order, scripts or output paths.

## Inputs

Same as the INV brief: the harness, `task/TASK.md`, base outputs and trajectories, and the optional
library. There is no rubric or score anywhere; judge only by what the request asks and what the runs show.

## How to decide

Trace each edit to a moment where a base run lacked practitioner knowledge, and turn the knowledge
into something the agent can apply and check:

- an analytic move — the operation (compare, reconcile, classify, trace, calculate), its inputs and result;
- an artifact contract — the parts the deliverable must have and how they must agree;
- a decision rule — the trigger, the evidence it needs, the conflict to resolve, the uncertainty to keep visible.

Choose the form deliberately. Knowledge with a recognizable trigger belongs in an on-demand KB topic
(`reference/kb/<topic>.md` with `title` and `source` frontmatter and a checklist section, linked from
the KB index); it costs nothing until needed. The entry file is for short rules that hold on every task,
and it is paid for on every run, so if you add there, cut there.

Two hard rules: never invent a standard, identifier or citation, and never store this task's material
facts as durable knowledge. Say where to retrieve and reconcile facts; do not assert them.

## Output

Same as the INV brief: changed files only, or `KEEP_BASE`, followed by one line per edit naming the
trajectory moment it answers.
