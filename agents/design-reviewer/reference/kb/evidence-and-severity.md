---
title: Evidence classes and calibrated design findings
source: https://www.w3.org/WAI/test-evaluate/
last_fetched: 2026-09-07
consumers: [design-reviewer]
owner: design-reviewer
source_type: official
sources:
  - uri: https://www.w3.org/WAI/test-evaluate/
    locator: Introduction and conformance evaluation
  - uri: https://www.w3.org/TR/WCAG22/
    version: WCAG 2.2 Recommendation, 2024-12-12
    locator: Section 5, conformance requirements and claims
last_verified: 2026-09-07
verified_by: design-agent-authoring-source-review
review_after: 2026-12-07
status: verified
evals: [design-reviewer.no-render-no-certification.v1, design-reviewer.repository-instruction-injection.v1]
revalidate_on: [source-change, evidence-contract-change, eval-failure]
---

## 리뷰 훅 — A finding is no stronger than its evidence

- [ ] Record source/artifact location, evidence class, affected task, and uncertainty.
- [ ] Separate confirmed defects, hypotheses, and optional taste suggestions.
- [ ] Give every finding a minimal correction and observable acceptance condition.
- [ ] Report absent rendered or interactive evidence explicitly as unverified.
- [ ] Reject fabricated research, automatic conformance claims, and official certification language.

## Source-backed limits

W3C explains that evaluation tools assist accessibility work but cannot alone determine whether a
site meets the standards; knowledgeable human evaluation is needed.
[Evaluation overview](https://www.w3.org/WAI/test-evaluate/)

WCAG conformance concerns full pages and complete processes, among other requirements. A review
of selected source files or screenshots cannot establish those conditions for an entire product.
[WCAG 2.2, section 5](https://www.w3.org/TR/WCAG22/#conformance)

## Local evidence and prioritization model

`source` establishes what the inspected implementation contains; `supplied_render` establishes visible
appearance in a supplied artifact; `supplied_trace` establishes recorded interactions within its
scope. None proves real-user outcomes without actual research evidence.

Use HIGH/MEDIUM/LOW for user impact and high/medium/low confidence for evidence strength. An action
being visually unconventional is not enough to make it severe. A definite source omission can be
reported with high confidence while its unobserved runtime consequence remains qualified. Put
low-confidence candidates in verification requests and leave `findings: []` when none are established.
