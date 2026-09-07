---
title: Interaction states and recoverable feedback
source: https://design-system.service.gov.uk/components/error-summary/
last_fetched: 2026-09-07
consumers: [ux-designer]
owner: ux-designer
source_type: official
sources:
  - uri: https://design-system.service.gov.uk/components/error-summary/
    locator: How it works
  - uri: https://design-system.service.gov.uk/patterns/check-answers/
    locator: Let users go back and change their answers
  - uri: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
    version: WCAG 2.2
    locator: Intent and definition of status message
last_verified: 2026-09-07
verified_by: design-agent-authoring-source-review
review_after: 2026-12-07
status: verified
evals: [ux-designer.complete-invitation-flow.v1]
revalidate_on: [source-change, interaction-state-change, eval-failure]
---

## 리뷰 훅 — Recovery is a specified transition

- [ ] Give each applicable state a trigger, message, allowed action, and exit condition.
- [ ] Distinguish no data, no matching results, unavailable data, and insufficient permission.
- [ ] Preserve valid input on recoverable failure; identify what retry can and cannot guarantee.
- [ ] Specify how errors connect to inputs and how the user reaches the correction.
- [ ] Separate progress/status feedback from a context change needing focus management.

## Source-backed guidance

GOV.UK's error-summary pattern links a summary to affected inputs and keeps summary and inline
messages consistent. Its focus behavior is a concrete pattern for a form, not a universal requirement
to move focus after every error. [Error summary](https://design-system.service.gov.uk/components/error-summary/)

The check-answers pattern preserves previous answers when users return to change them and gives
change links sufficient context. Reuse that recovery principle when a multi-step task needs it;
do not add a review screen to every simple form. [Check answers](https://design-system.service.gov.uk/patterns/check-answers/)

WCAG's status-message guidance addresses messages such as progress or action results without a
context change. These need programmatic exposure so assistive technology can notify the user without
moving focus to the message. Not every newly inserted element is a status message.
[Status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)

## Local state contract

Use `state ID / trigger / user-visible feedback / retained input / action / focus-or-announcement /
acceptance`. Derive states from requirements and API evidence. Never promise that hiding a control
enforces authorization or that disabling a button makes a backend operation idempotent.
