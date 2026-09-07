---
title: Machine-validatable QA test plan and execution handoff contract
contractVersion: 1
consumers: [qa-test-designer]
---

# QA Test Plan Contract — version 1

The QA designer writes its human-readable report and a sibling `*.qa-plan.json` file. The JSON file is the
machine-validatable source of truth for case identity, requirement/risk traceability, P0 grounding, synthetic test
data, and execution-handoff lifecycle ownership. Validate it before publishing the design:

```shell
node "${CLAUDE_PLUGIN_ROOT}/agents/qa/scripts/validate-test-plan.js" <plan.qa-plan.json>
```

The validator uses only Node.js built-ins. A non-zero exit means the plan is incomplete and must not be handed to
an executor. Every diagnostic starts with a stable `QAP-*` rule ID.

## Root shape

```json
{
  "schemaVersion": "vulpora.qa-test-plan/v1",
  "title": "Order creation",
  "target": "docs/requirements/order.md",
  "requirements": [],
  "risks": [],
  "testCases": [],
  "traceability": [],
  "handoffs": []
}
```

`requirements` and `risks` contain unique objects with `id`, `description`, `priority`, and `sourceRef`.
Requirement IDs start with `REQ-`; risk IDs start with `RISK-`. `sourceRef` points to the requirement, code, diff,
or approved risk statement that grounds the item.

## Test case shape

Each `testCases` entry contains:

- `id`: stable `TC-{AREA}-{NNN}` identifier, unique in the plan.
- `requirementIds` and `riskIds`: non-empty arrays of declared IDs. A case is never orphaned from either axis.
- `preconditions`, `steps`, and `expected`: non-empty string arrays. Expected results are observable assertions.
- `input`: `{ "classification": "synthetic", "values": { ... } }`. Production, copied, or unknown data is
  rejected even when it happens not to match a known PII pattern.
- `priority`: `P0`, `P1`, or `P2`; `type`: a non-empty design-technique label; `level`: `unit`, `integration`, or
  `e2e`.
- `grounding`: `{ "sourceId": "REQ-...|RISK-...", "evidence": "path:line or section" }` entries. For P0,
  every linked requirement and risk must have a grounding entry.

## Bidirectional traceability and P0 gate

`traceability` contains exactly one row per declared requirement and risk:

```json
{"sourceId":"REQ-ORDER-1","testCaseIds":["TC-ORDER-001"],"status":"covered","rationale":null}
```

Rows must agree with links declared by the cases. A non-P0 source may use `accepted-gap` with an empty case list and
a non-empty rationale. A P0 requirement or risk must be covered by at least one P0 case; P0 gaps fail validation.

## Execution handoff lifecycle

Each `handoffs` entry contains `scenarioId`, `executor`, `testCaseIds`, `priority`, `syntheticData`, `seed`,
`cleanup`, `absenceProbe`, and `expected`. `executor` is `e2e-test-runner` or `playwright-e2e`.

- `syntheticData`: classification must be `synthetic`, with a non-empty `seedRef`.
- `seed`: non-empty `owner` and repeatable `method`.
- `cleanup`: non-empty `owner` and cleanup `method`.
- `absenceProbe`: non-empty probe `method` and observable `expected` result proving cleanup.
- `locatorEvidence`: additionally required for `playwright-e2e`.
- Every `level: e2e` test case appears in at least one handoff, handoff case IDs are unique, and a handoff never
  lowers a P0 case to a lower priority.

Lifecycle fields are required even for read-only flows: use an explicit no-op method and an absence probe that
demonstrates no fixture residue. This keeps executor handoff behavior uniform and auditable.

## Sensitive-data gate

The validator rejects non-synthetic classifications, email/phone/resident-registration-number shapes, and populated
credential-like fields such as password, secret, token, cookie, or authorization. Use symbolic synthetic fixture
references; never copy operational data into a QA plan.
