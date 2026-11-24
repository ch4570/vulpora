---
title: Consensus-veto conditions and lane counting
source: docs/review-panel-red-team-gate-design.md (3-(h), 12-1); arXiv 2605.29800, 2609.22512, 2608.09290
last_fetched: 2026-11-23
skills: [review-veto-gate]
---

# Consensus-veto conditions and lane counting

In this version the conditions are evaluated in `shadow` or `signal` mode only. A group that meets all of them is a
**candidate**: the output records `wouldBeVerdictFloor: CHANGES_REQUIRED` and changes nothing.

## Grouping

Findings join one group when they share `cause_key` (a short kebab slug of the cause class, such as `lost-update`),
the same file, and either the same symbol or lines within 5 of each other. A finding without `cause_key` joins no group.

## Conditions (all required)

| ID | Condition | Checked from |
|---|---|---|
| CV-1 | The diff touches a risk category (concurrency/transaction/lock/idempotency, authorization, destructive data or migration, money, public API) and has 1..800 production lines. Docs-only, test-only, generated-only changes do not qualify; over 800 lines gives `SPLIT_OR_HUMAN_REVIEW` | the diff, by path and keyword rules |
| CV-2 | At least three distinct counted lanes reported the group. Same lane name repeated = one. Style lanes and `ROUTE_UNAVAILABLE` lanes are not counted | ledger lanes |
| CV-3 | One counted lane is a refuter that gave a basis and did not refute | refutations |
| CV-4 | Counted lanes have different evidence bundle hashes and `fork_turns: none` | ledger lanes |
| CV-5 | Every finding has `path:line`, a cause sentence, severity HIGH or above, and a contract source of kind spec, acceptance, public-contract, or security-rule | findings |
| CV-6 | The reproduction record is honest: `REPRODUCED` goes to the reproduction path instead; an executable kind of defect that ran and was `NOT_REPRODUCED` disqualifies; `NOT_ATTEMPTED` disqualifies; `NOT_RUN` needs `not-executable-kind`, `no-isolated-environment`, or `budget-cap` | findings |
| CV-7 | Every touched risk tier has calibration state `valid` | calibration status |
| CV-8 | The script computed the above; a sentence saying so is not evidence | this script |

## Lane kinds

Counted: full-context correctness review (`java-reviewer`, `kotlin-spring-review`), area review (`security-auditor`,
`architecture-reviewer`, `application-architect`, `domain-driven-design-reviewer`), the refuter, a narrow-input re-review
(diff and contract only), a spec test lane. Not counted: style and design-fit lanes. If calibration shows two lanes miss
the same planted defects, treat them as one.

## Buckets in the report

reproduced (belongs to the reproduction path), consensus-veto candidates (shadow), refuted, not reproduced, signals. A single
reporting lane in a risk tier is kept as a reproduction-task candidate; it is never merged into someone else's claim and no
other model arbitrates it.

## 리뷰 훅

- [ ] Lanes were counted by name, not by run, and style lanes were left out.
- [ ] A refuter result without a basis was not treated as standing.
- [ ] No condition was satisfied by a sentence in a model's text instead of a script result.
- [ ] The report says the verdict is unchanged and shows calibration state per tier.
