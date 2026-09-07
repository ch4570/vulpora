---
title: Product-system consistency and responsive evidence
source: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
last_fetched: 2026-09-07
consumers: [design-reviewer]
owner: design-reviewer
source_type: official
sources:
  - uri: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
    version: WCAG 2.2
    locator: Success criterion and two-dimensional layout exceptions
  - uri: https://www.gov.uk/service-manual/design/making-prototypes
    locator: Types of prototype and using code prototypes
last_verified: 2026-09-07
verified_by: design-agent-authoring-source-review
review_after: 2026-12-07
status: verified
evals: [design-reviewer.evidence-based-interface-review.v1, design-reviewer.no-render-no-certification.v1]
revalidate_on: [source-change, layout-system-change, eval-failure]
---

## 리뷰 훅 — Fit the task at the inspected viewport

- [ ] Record artifact identity, known viewport/state, and visible region for screenshot findings.
- [ ] Compare hierarchy, actions, typography, spacing, icons, and colors to actual product primitives.
- [ ] Inspect fixed widths, wrapping, clipping, ordering, and long/localized content constraints.
- [ ] Distinguish a deliberate dense layout from a demonstrated loss of information or functionality.
- [ ] Recommend a minimal token/component correction before a new visual system.

## Source-backed limits

Reflow covers vertically scrolling content at a width equivalent to 320 CSS pixels and horizontally
scrolling content at a height equivalent to 256 CSS pixels. Parts that require two-dimensional
layout for meaning or use have exceptions; this does not exempt unrelated page content.
[Reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

Prototype guidance distinguishes quick visual exploration from realistic interactive investigation.
A still image can show arrangement but cannot demonstrate navigation, recovery, or focus behavior.
[Prototype guidance](https://www.gov.uk/service-manual/design/making-prototypes)

## Local review model

Use repository tokens/components as the comparison baseline and cite their locations. For each
visual inconsistency, state the task consequence rather than relying on adjectives such as modern
or clean. A source-level width constraint is evidence of that constraint, while actual clipping
and the affected states still need rendering evidence. Preserve product-specific density and tone
unless the scoped request or demonstrated usability problem justifies changing them.
