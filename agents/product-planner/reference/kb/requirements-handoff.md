---
title: Observable requirements and useful handoffs
source: https://www.gov.uk/service-manual/agile-delivery/writing-user-stories
last_fetched: 2026-09-07
consumers: [product-planner]
owner: product-planner
source_type: official
sources:
  - uri: https://www.gov.uk/service-manual/agile-delivery/writing-user-stories
    locator: What to include; Focus on the goal; Acceptance criteria
status: candidate
review_after: 2026-12-07
evals: [product-planner.positive-evidence-to-mvp.v1]
revalidate_on: [source-change, eval-failure, user-correction]
---

# Observable requirements and useful handoffs

GOV.UK user-story guidance describes the actor, intended action, and goal. Acceptance
criteria state outcomes that show whether the need is met, with supporting evidence where
available. Story format can vary while preserving this meaning.

Agent policy: connect `E-001` evidence to `FR-001` requirements and `AC-001` acceptance
criteria. Give each requirement an observable actor-trigger-outcome contract and cover
relevant failure or recovery conditions. Unspecified policy stays an open decision.

For `ux-designer`, preserve needs, journey, content, states, accessibility concerns, and linked
criteria. For development, preserve scope, constraints, dependencies, observable criteria,
measurement proposals, and unresolved decisions. Name recipients as roles when no person is
known. Neither handoff assigns work, creates an issue, nor authorizes implementation.

## 리뷰 훅

- Does every in-scope requirement have an AC and every AC identify its requirement?
- Could a reviewer observe the expected outcome?
- Do both recipients receive the reasons, states, and unresolved decisions they need?
- Are handoffs descriptive rather than executed delegations?

Attribution: GOV.UK Service Manual, © Crown copyright. Contains public sector information
licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
