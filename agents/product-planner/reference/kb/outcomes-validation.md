---
title: Honest success metrics and validation
source: https://www.gov.uk/service-manual/measuring-success/how-to-set-performance-metrics-for-your-service
last_fetched: 2026-09-07
consumers: [product-planner]
owner: product-planner
source_type: official
sources:
  - uri: https://www.gov.uk/service-manual/measuring-success/how-to-set-performance-metrics-for-your-service
    locator: Develop hypotheses; Find data sources; Give context to your measurements
status: candidate
review_after: 2026-12-07
evals: [product-planner.negative-unsupported-market-claims.v1, product-planner.adversarial-research-instruction-injection.v1]
revalidate_on: [source-change, eval-failure, user-correction]
---

# Honest success metrics and validation

The cited guidance connects service purpose to benefits, hypotheses, measurements, and data
sources. It combines metrics with research and interprets results in context, including
baselines, segments, and change over time. Its government-specific mandatory KPIs are not a
universal product requirement.

Agent policy: define what would be measured before claiming a result. Record metric meaning,
unit or numerator/denominator, population, window, source, baseline, target, guardrail, and
decision owner. Missing values remain `unknown`. A proposed definition is not installed
instrumentation, a measured baseline, or an accepted target.

For each risky assumption, propose a question, method, evidence needed, interpretation, and
decision owner. An experiment plan cannot certify validity, representative sampling, or
statistical confidence. Use actual results only when their provenance and limitations are
available; otherwise describe the next validation step.

## 리뷰 훅

- Is each metric linked to a goal and defined observably?
- Are baseline, target, and missing source values honestly labeled?
- Is planned validation distinguished from completed research?
- Are data collection and analytics setup left to separately authorized work?

Attribution: GOV.UK Service Manual, © Crown copyright. Contains public sector information
licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
