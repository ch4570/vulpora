# Review Veto Gate — Principles

These are the judgment rules behind the gate. Facts and thresholds are in `kb/`.

## 1. Agreement is not independent evidence

Measured panels of language-model judges behave like far fewer independent voters than their number, and models from
different vendors are not reliably less alike than models of one family. Showing reviewers each other's answers made
them agree more, not judge better. So the gate counts distinct lanes by what they could see and do, never by how many
said the same thing, and it never asks one model to arbitrate another.

Sources: Nine Judges, Two Effective Votes (arXiv 2605.29800); Agreement Overstates Evidence (arXiv 2609.22512);
Talk Isn't Always Cheap (arXiv 2509.05396); Minority Sentinel (arXiv 2606.29270).

## 2. A reproduction beats an opinion

What has helped is changing the information source: running something, giving the judge tools, or letting a refuter
see only the claim and the diff. A failing test is the same fact whoever reads it. Findings that stay "inferred" become
reproduction tasks instead of staying opinions.

Sources: Agent-as-a-Judge (arXiv 2410.10934); OpenCodeReview (arXiv 2608.09290); Beyond the Verdict (arXiv 2610.18760);
SWT-Bench (arXiv 2406.12952).

## 3. Independence is measured, not assumed

Two lanes that miss the same planted defects are one lane for counting purposes. The calibration set measures this and
demotes a tier automatically when false vetoes, wrong targets, or misses cross a threshold. A tier that was demoted
comes back only when a person confirms it.

## 4. "Found nothing" is not safety

The gate can surface signals. It cannot approve. A clean bundle says only that no claim met the conditions.

## 5. Observation first

This version changes no verdict. A signal that has not been calibrated and watched for real changes does not get
authority over a merge. The owner decided that agreement may later carry a veto, behind the safeguards in
[consensus-veto-conditions](kb/consensus-veto-conditions.md) and [calibration](kb/calibration.md); until then every
output records what would have happened.

## 6. Nothing here may create a new incident

Reproduction needs an application and its data stores. It runs only against run-owned endpoints with an isolation record.
The gate's own scripts never execute a build, a test, or a connection.
