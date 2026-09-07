---
title: Accessibility inspection with explicit evidence limits
source: https://www.w3.org/TR/WCAG22/
last_fetched: 2026-09-07
consumers: [design-reviewer]
owner: design-reviewer
source_type: standard
sources:
  - uri: https://www.w3.org/TR/WCAG22/
    version: WCAG 2.2 Recommendation, 2024-12-12
    locator: 2.1.1, 2.4.7, 3.3.2, 4.1.2
  - uri: https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
    locator: Keyboard navigation between components
  - uri: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
    version: WCAG 2.2
    locator: Success criterion and intent
  - uri: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
    version: WCAG 2.2
    locator: Success criterion and exceptions
last_verified: 2026-09-07
verified_by: design-agent-authoring-source-review
review_after: 2026-12-07
status: verified
evals: [design-reviewer.evidence-based-interface-review.v1, design-reviewer.no-render-no-certification.v1]
revalidate_on: [source-change, widget-change, eval-failure]
---

## 리뷰 훅 — Inspect semantics before asserting experience

- [ ] Identify a control's name, role, operation, visible label, and applicable keyboard path.
- [ ] Search for surrounding labels, shared handlers, and focus styles before claiming absence.
- [ ] Check whether custom pointer actions have a corresponding keyboard interaction.
- [ ] Tie a criterion to its actual applicability and exceptions; avoid blanket pixel rules.
- [ ] Keep computed contrast, focus behavior, and assistive-technology results unmeasured unless supplied.

## Source-backed checks

WCAG provides distinct requirements for keyboard operation, visible focus, input labels/instructions,
and programmatically available control information. A single attribute does not establish all of
them. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

APG's navigation guidance distinguishes ordinary tab stops and composite-widget navigation. A
pointer-only handler on an otherwise noninteractive element needs an evidenced keyboard route.
[Keyboard interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)

For applicable text, WCAG 2.2 AA's minimum contrast is 4.5:1, or 3:1 for qualifying large text;
exceptions must be checked. A screenshot estimate is not a measured ratio.
[Contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

Target Size (Minimum) uses 24 by 24 CSS pixels with spacing, equivalent-control, inline, user-agent,
and essential exceptions. Do not report every smaller target as a violation without examining these.
[Target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

## Local acceptance format

Specify the affected control and an observable operation, such as keyboard activation reaching the
same result as pointer activation. Name a browser/assistive-technology check as proposed when it
has not been performed. A correct-looking source pattern is a strength, not a certification.
