---
title: Evidence and reconciliation for security scans
source: ../../SKILL.md
last_fetched: 2026-09-10
skills: [security-scan-workflow]
---

## Report contract

Use one human-readable report and this summary shape (YAML or equivalent structured table).
The entrypoint owns verdict policy; this topic defines how to retain the supporting evidence.

```yaml
schema: vulpora.security-scan/v2
mode: AUDIT | REMEDIATE
status: COMPLETE | INCOMPLETE
verdict: BLOCK | CHANGES_REQUIRED | WARNING | NO_FINDINGS_WITH_LIMITS | FIXED_WITH_LIMITS | INCOMPLETE
scope:
  target: repository-relative scope
  baseline: revision or none
  snapshot: revision plus scoped content fingerprints
  initial_snapshot: revision plus initial fingerprints when remediating
  context_files: []
  exclusions: []
passes:
  security-auditor:
    execution_status: COMPLETED | FAILED | NOT_RUN
    review_status: complete | partial | invalid_scope | bundle_unavailable | not_run
    execution: native handle or none
  browser-and-destructive-data: {status: COMPLETE | PARTIAL | NOT_RUN, execution: owner}
  final-security-auditor: # REMEDIATE only; record separately, never overwrite the initial pass
    execution_status: COMPLETED | FAILED | NOT_RUN
    review_status: complete | partial | invalid_scope | bundle_unavailable | not_run
    execution: native handle or none
coverage:
  - category: one of every category in the SKILL.md coverage matrix
    status: REVIEWED | NOT_APPLICABLE | UNKNOWN
    evidence: [relative/path:line]
    reason: concrete coverage, exclusion or missing proof
findings: []
changes: [] # finding IDs, changed paths, control/rationale and current fingerprints
unresolved_candidates: []
safe_controls: []
dissent: []
gaps: []
verification:
  - status: PASSED | FAILED | NOT_RUN
    command: exact redacted command or proposed check
    scope: inspected paths and actual isolation boundary
    result: observed outcome and evidence location, or reason not run
```

Expand every finding with stable ID, category, severity, confidence, location, root cause,
trace, evidence, impact, assumptions/contrary evidence, recommendation, proposed verification
and contributing pass. Preserve initial severity/evidence and add disposition OPEN, MITIGATED,
FIXED or NOT_APPLICABLE_WITH_EVIDENCE. FIXED requires actual control changes, positive/negative
regression evidence and final independent review; proposals remain OPEN. For shared effects add
`resource_class`, target binding and blast
radius. Locations identify source code; redact path segments too if they embed sensitive data.

## Confidence and partial results

- `high`: reachable source/trigger, effective sink/control and material deployment assumptions
  are evidenced. Secret validity need not be tested: report the exposure mechanism and leave
  whether a literal is a working credential unverified.
- `medium`: plausible traced defect with an identified deployment/control assumption outstanding.
- `low`: pattern or partial trace only; retain as a candidate with a bounded follow-up.

Severity describes supported impact, independently of confidence. For example, a confirmed
shared-table wipe can warrant HIGH or CRITICAL depending on proven reach and breadth; an
unresolved Redis binding cannot establish production-wide loss. Downgrading requires contrary
evidence, not reviewer majority. Preserve distinct injection, CSRF and deletion root causes.

Retain the auditor's redacted handoff with its original verdict; the workflow's verdict is a
separate integration policy. Unavailable audit output is never synthesized. Failed passes and
unknown category coverage make the workflow `INCOMPLETE` even when serious findings are known.
List those known findings so incomplete status cannot hide them. Missing required remediation
verification also makes the result INCOMPLETE. Pending candidates prohibit
`NO_FINDINGS_WITH_LIMITS`.
An execution can finish successfully with `review_status: partial`; preserve both facts and keep
the workflow incomplete. Record actual loaded bundle provenance and any verified source-content
match without claiming that a source adapter label proves runtime support or authorization.

## 리뷰 훅

- [ ] Every category in the entrypoint matrix has an evidence-backed coverage disposition.
- [ ] No finding reproduces secret bytes, raw logs, or credential-bearing URLs.
- [ ] Every HIGH/CRITICAL has an effect trace, concrete impact and counterevidence check.
- [ ] Auditor execution is observed; original judgments and dissent are preserved.
- [ ] Fingerprints still match; partial failures and pending candidates cannot become clean scans.
- [ ] Proposed tests are labeled NOT_RUN; code review is not proof of live exploitability or safety.
- [ ] Remediation keeps initial and final snapshots, changes, test outcomes and separate auditor passes.
- [ ] FIXED is supported by code and fault-detecting checks; remaining mitigation work stays open.
