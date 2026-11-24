---
title: Refuter lane brief
source: docs/review-panel-red-team-gate-design.md (3-(a), 3-(b)); arXiv 2608.09290, 2503.11926
last_fetched: 2026-11-23
skills: [review-veto-gate]
---

# Refuter lane brief

The refuter is the one model lane the gate adds, and only for a risky change. It runs after the review passes finished, so the
workflow's cap on active children still holds. Profile `frugal/low` (a small model), `fork_turns: none`, explicit model.

## Input (only this)

- the diff for the claimed location and the lines around it
- one claim: `path:line`, the cause sentence, and the contract source it cites
- the contract text itself (acceptance criterion, public contract, security rule)

Not given: the author's PR description or commit message, the author's own test claims, other lanes' output or reasoning,
other claims. An author's explanation such as "intentional for compatibility" is the kind of sentence that talks a judge out
of a real defect.

## Questions

1. Does the diff actually do what the claim says at that location?
2. Does the cited contract really require the opposite?
3. Is there something in the diff, not in a comment, that already prevents the failure?

## Output

`outcome: NOT_REFUTED | REFUTED` and a `basis` of one or two sentences pointing at diff lines or contract text. An outcome
without a basis does not count as standing. The refuter does not propose fixes and does not rate severity.

## 리뷰 훅

- [ ] The brief contained no author explanation and no other lane's output.
- [ ] The result names its basis.
- [ ] The lane was started with an explicit model and `fork_turns: none`.
