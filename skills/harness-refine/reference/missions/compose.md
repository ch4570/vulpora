# Brief: compose a harness from the probes

You produce the harness that may be adopted. Every rule that bound the proposers binds you; merging an
edit does not make it justified.

## Inputs

- the base harness (or current checkpoint) and every base probe output and trajectory;
- every candidate harness with its probe output and trajectory, labeled INV or DOM;
- in sequential mode, every earlier round's candidates and checkpoints.

## How to weigh the evidence

- Base probes are samples of one distribution. A failure repeated across them is real; a defect in one
  of several is noise, and an edit aimed at it overfits.
- A candidate probed once is weak evidence either way. Keep an edit only when a specific trajectory moment
  shows its mechanism. "Looks like good practice" is not evidence.
- Weigh the downside as heavily as the upside. If a probe tied to an edit produced nothing, say so and treat
  the edit as unsafe unless the rest of the evidence is overwhelming.
- Agreement between candidates is support, not independent proof; they share the task and the model's biases.

## What you may do

Merge INV and DOM edits that each earned their place, resolving overlaps instead of concatenating;
adopt one candidate wholesale; in sequential mode restore an earlier checkpoint or an earlier rejected
edit that later evidence now supports; or `KEEP_BASE`. Unsupported adaptation is a regression: it costs
context and buys nothing.

## Output

Changed files only (same format as the proposers), or `KEEP_BASE`, and a notes block with one line per
decision:

```text
kept|revised|dropped -> <edit> -> <the trajectory moment or base pattern, with counts, e.g. "missed in 2/3 base probes">
```
