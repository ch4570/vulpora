---
title: Authorized source remediation and isolated verification
source: ../../SKILL.md
last_fetched: 2026-09-10
skills: [security-scan-workflow]
---

## Authority is mode-specific

AUDIT means read-only inspection and NOT_RUN test proposals. REMEDIATE authorizes scoped source
repairs and safe local checks because the user asked to fix/harden/remove risks. It does not
authorize production changes, live exploits, secret rotation, shared-service cleanup, disabling
security controls, new dependencies or publication. Keep the mandatory auditor read-only; its
tools and role contract do not change when the owner's mode changes.

## Fix the effect, preserve the function

1. Record initial finding IDs, source hashes, trust boundaries and intended legitimate behavior.
   Write a small ordered plan. Preserve unrelated edits and the original audit evidence.
2. Identify the root cause and equivalent reachable sinks, including failure/cleanup paths.
   Prefer existing ownership/authorization abstractions and bounded APIs to new layers.
3. Write a regression that reaches the sensitive boundary and fails for the vulnerable behavior.
   Pair it with a legitimate positive control. If a failing reproduction cannot safely be run,
   record why; do not mark NOT_RUN evidence as proof of a fixed behavior.
4. Apply the minimum sufficient repair. Binding values does not fix unbounded effects; replacing
   one global cleanup method with another does not establish ownership. Avoid returning success
   after suppressing an exception, silently disabling features, or weakening tests to get green.
5. Run permitted verification, inspect the resulting diff and re-audit the new snapshot with the
   exact independent reviewer. Revisit shared helpers/callers affected by the change.

Removing a dangerous default/fallback or rejecting unknown ownership can be the correct source
fix. Explain compatibility impact and how legitimate callers supply trusted bounded capabilities.
Do not delete synthetic vulnerable regression fixtures merely to make scans stop reporting them.
Do not rewrite user tests to reduce assertion strength or replace sink evidence with report words.

## Verification execution gate

Before every command, inspect the entry point, imports, package/build hooks, setup/teardown,
environment reads, endpoint selection and retry/cleanup effects. Record executable, arguments,
working directory, expected writes, time/output limits and why resources are owned. The command
name `test`, localhost, mocks in one test, or a declared test profile is not isolation proof.

Prefer dependency-free offline tests with in-memory adapters and an exact temporary directory.
The host must enforce the intended filesystem/network/process limits; do not claim a prompt or
a model's self-attestation is a sandbox. For untrusted test code without adequate enforcement,
do not execute it. State the gap and use static checks or a safe separately authored harness.
Never connect to a shared/unknown service, run migrations/flush/purge, start an app against
ambient configuration, or issue exploit traffic. Existing tool installation does not authorize
package lifecycle scripts. Inspect setup dependencies before using build wrappers.

Regression doubles should capture the real boundary contract: exact bound SQL/client/target,
zero sink calls on rejection, positive allowed calls, cancellation and cleanup ordering. They
prove only that contract, not engine permissions, DNS behavior, real service semantics or
production isolation. If engine proof is needed, report it separately as NOT_RUN until an
authorized ephemeral setup and enforced target isolation exist.

Test timeouts and result limits at the work/consumption boundary, not only after buffering.
Cover setup failure, budget exhaustion, cancelled queries and failed cleanup; do not return a
connection/resource with uncertain state to shared reuse. A smaller response is not proof of
bounded memory, transfer or database computation.

## Fixed versus proposed

Keep each initial finding as OPEN, MITIGATED, FIXED or NOT_APPLICABLE_WITH_EVIDENCE. FIXED needs
an actual changed control, current source evidence, passing relevant positive/negative checks
and independent post-fix review. MITIGATED retains the remaining abuse path and further work.
Mark runtime/engine checks separately; never erase an unverified assumption from the final report.
If a requested fix still lacks proof, return INCOMPLETE with the achieved changes and remaining
work instead of describing the whole remediation request as complete.

## 리뷰 훅

- [ ] The user requested fixes; AUDIT and auditor authority remain read-only.
- [ ] Initial failure and legitimate behavior are captured before changing the control.
- [ ] Commands/hooks/imports and actual target/resource ownership were checked before execution.
- [ ] No shared service, secret validation, dependency addition or live exploit was used.
- [ ] Regressions exercise the sink contract, and source/test changes do not mask the defect.
- [ ] Final independent review uses new hashes; residual findings and NOT_RUN proof remain visible.
