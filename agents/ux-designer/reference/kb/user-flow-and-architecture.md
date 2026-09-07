---
title: Evidence-based user flows and information architecture
source: https://www.gov.uk/service-manual/user-research/start-by-learning-user-needs
last_fetched: 2026-09-07
consumers: [ux-designer]
owner: ux-designer
source_type: official
sources:
  - uri: https://www.gov.uk/service-manual/user-research/start-by-learning-user-needs
    locator: Researching users, validating user needs, and linking needs to stories
  - uri: https://www.gov.uk/service-manual/design/making-prototypes
    locator: Types of prototype and using code prototypes
last_verified: 2026-09-07
verified_by: design-agent-authoring-source-review
review_after: 2026-12-07
status: verified
evals: [ux-designer.complete-invitation-flow.v1, ux-designer.unsupported-research-claims.v1]
revalidate_on: [source-change, task-model-change, eval-failure]
---

## 리뷰 훅 — From user outcome to a bounded flow

- [ ] Identify the actor, trigger, desired outcome, and actual evidence for each.
- [ ] Label unsupported audience or behavior claims as assumptions.
- [ ] Connect each proposed screen to a task step and name its entry/exit conditions.
- [ ] Account for back, cancel, correction, and return visits where the task requires them.
- [ ] Name the question a prototype or research task would answer; do not invent its result.

## Source-backed guidance

GOV.UK's user-needs guidance separates a person's problem from a proposed feature and treats
non-user suggestions as assumptions requiring research. It links specific stories to the needs
they serve. Apply that distinction to the input: a stakeholder's request for a dashboard is not
evidence that a dashboard solves the user's task. [User-needs guidance](https://www.gov.uk/service-manual/user-research/start-by-learning-user-needs)

Prototype fidelity should fit the question. Sketches can explore an arrangement, while interactive
prototypes can investigate realistic transitions. A prototype's successful demonstration does not
establish production readiness. [Prototype guidance](https://www.gov.uk/service-manual/design/making-prototypes)

## Local design artifact

Use `actor → entry → decision → action → feedback → completion/recovery`. For each node record
the supporting input or a labeled assumption, the content required, and the next permitted step.
This notation is the agent's handoff convention, not a prescribed government service architecture.
