---
title: Calibration of the review gate
source: docs/review-panel-red-team-gate-design.md (3-(e), 3-(h) device 2); arXiv 2510.11822, 2609.22512
last_fetched: 2026-11-23
skills: [review-veto-gate]
---

# Calibration of the review gate

The gate is measured with planted defects, not trusted. `evals/calibration/seeded-defects/` holds set v0: a small generic
service (`base/`) and unified diffs (`patches/`) listed in `manifest.json`. v0 has 6 seeded and 6 control changes, well below
the sample thresholds, so every tier scores `unmeasured`. That is the expected state, and the report must say it.

## Sets

- **Seeded**: a change with a planted defect (removed lock, dropped version column, split transaction, weaker isolation,
  removed permission check, changed rounding).
- **Control**: a same-size change with no defect, some in the same risk tier (a kept lock with a hint, a kept transaction
  with a log line), to measure false vetoes.
- Keep part of the set hidden from reviewer prompts and examples, rotate defect types, and add real incidents only after a
  person reviewed them. A hidden set belongs to its owner, outside this repository.

## Metrics per tier (`score-calibration.js`)

| Metric | Demote when | Note |
|---|---|---|
| false veto rate | control cases meeting the conditions > 5% | needs 40 controls |
| veto precision | candidates that point at the planted defect < 80% | |
| miss rate | seeded cases that were not candidates > 70% | high means lanes miss the same things |
| operational release rate | last 20 vetoes a person released as false positives > 30% | judged only with 10+ vetoes |
| sample | fewer than 20 seeded or 40 control cases | state `unmeasured` |
| age and versions | older than 90 days, or model/prompt/lane/skill versions changed | state `expired` |

Thresholds are starting values. Tune them from measurement, not from taste. Pairs of lanes also get a common-miss share; a
high share means they are not independent lanes.

## States

`valid`, `unmeasured`, `expired`, `demoted`. Demotion is automatic at the next evaluation. Restoration is not: a demoted tier
stays demoted until a person confirms (`--human-confirmed-restore`) and the metrics pass. The status file says
`appliesToVerdict: false` in this version.

## 리뷰 훅

- [ ] A tier with too few samples is reported `unmeasured`, not `valid`.
- [ ] A demoted tier was not restored by score alone.
- [ ] The report shows the sample counts next to any recall-like number.
- [ ] Seeded defects were not copied into reviewer prompts or examples.
