---
title: Responsive and accessible implementation handoff
source: https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
last_fetched: 2026-09-07
consumers: [ux-designer]
owner: ux-designer
source_type: official
sources:
  - uri: https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
    locator: Keyboard navigation between components and discernible focus
  - uri: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
    version: WCAG 2.2
    locator: Intent and reflowing websites and web applications
last_verified: 2026-09-07
verified_by: design-agent-authoring-source-review
review_after: 2026-12-07
status: verified
evals: [ux-designer.complete-invitation-flow.v1, ux-designer.repository-instruction-injection.v1]
revalidate_on: [source-change, component-system-change, eval-failure]
---

## 리뷰 훅 — Observable implementation decisions

- [ ] Identify reused components/tokens by actual source path and name.
- [ ] Define how hierarchy and actions survive a narrow layout and long localized content.
- [ ] Include keyboard reachability, focus visibility/order, labels, and feedback expectations.
- [ ] State what must be checked on a rendered product and who receives that handoff.
- [ ] Mark visual verification `NOT_RUN` unless supplied rendered evidence was actually inspected.

## Source-backed guidance

WAI-ARIA APG distinguishes navigation between components from movement inside composite widgets.
It favors a logical order and discourages positive `tabindex` values as a way to repair ordering.
Use the relevant widget pattern rather than inventing a uniform keyboard model for every control.
[Keyboard interface guidance](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)

Reflow guidance connects narrower presentation with preserving access to information and actions.
Changing placement can be appropriate; losing functionality is not the same as simplifying a
layout. Plan for zoom and actual content, not only a small-device screenshot.
[Reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

## Local handoff contract

For each new or changed component, record content, states, existing token/component reuse, layout
rules, and an acceptance ID. Cite actual repository choices separately from proposed additions.
Pass the specification to the implementation owner with named viewports/states and input methods
to inspect. A responsive rule is proposed behavior until the actual layout has been checked.
