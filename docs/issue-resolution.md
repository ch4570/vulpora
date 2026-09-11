# Release work and issue status

## Public v1.1.0 update — 2026-09-11

Public issues #8–#12 are closed after their individual fixes and CI-verified merges:
[PR #15](https://github.com/ch4570/vulpora/pull/15),
[PR #16](https://github.com/ch4570/vulpora/pull/16),
[PR #17](https://github.com/ch4570/vulpora/pull/17),
[PR #18](https://github.com/ch4570/vulpora/pull/18), and
[PR #19](https://github.com/ch4570/vulpora/pull/19).
[Public issue #1](https://github.com/ch4570/vulpora/issues/1) remains open and operational promotion remains
blocked. The package release does not certify external runners, signing policy, immutable storage, or provider
budget enforcement. See [v1.1.0 release notes](releases/v1.1.0.md) for changes and verification limits.
GitHub publication is recorded in the release itself; npm registry publication remains deferred.

## Historical v1.0.0 snapshot

Snapshot: 2026-09-07. Vulpora v1.0.0 is the first public release. Earlier issue and PR numbers below
refer to the privately archived development repository; they are not issue numbers in the new public repository.
A local test result does not by itself prove remote closure or operational deployment.

| Development item | Result | Evidence boundary |
|---|---|---|
| PR #26: evaluation hardening | Merged before this release | Offline contracts and fixtures |
| PR #28: checkout action | Merged; pinned v7.0.1 | Official tag matches pinned SHA |
| PR #29: setup-node action | Merged; pinned v7.0.0 | Official tag matches pinned SHA |
| PR #30: development dependencies | Merged | Combined TypeScript 7 / Node types 26 build and typecheck |
| PR #31: production dependencies | Merged after resolving lockfile conflict with #30 | 36 MCP tests, build, typecheck, npm audit: 0 vulnerabilities; mocked drivers |
| Issue #22: no-op gates | Closed after implementation and regression verification | Missing/stale gates and uncovered behavioral selections fail explicitly |
| Issue #23: incident regressions | Closed after implementation and regression verification | Five synthetic incidents and healthy control; ten receipt checks |
| Issue #27: shell/awk portability | Closed; all three public CI matrix jobs passed | Ubuntu system/GNU Awk and macOS system jobs; missing tools are NOT_RUN |
| Issue #25: external evaluation trust | Private issue closed as migrated; [public follow-up #1 remains open](https://github.com/ch4570/vulpora/issues/1) | Offline crypto/budget checks are not trusted isolation, independent identity, immutable storage, or repeated live security acceptance |

## V1 implementation

- One Vulpora namespace across package, executable, skill IDs, schemas, configuration, state and plugin metadata.
- Bilingual README, full 62-skill handbooks, architecture guides, and an original fox banner.
- Conditional skill references and exact tokenizer measurements with source-token budgets.
- Task type/difficulty/risk model selection and independent Codex sessions with bounded capsules/results.
- Full behavioral skill entry loading and provider-usage provenance; unknown counts remain unknown.
- Explicit candidate verification and a fail-closed operational promotion boundary.

## Verification

The [token report](../evals/token-efficiency/README.md) distinguishes source-token savings from actual runtime
usage. Two live Codex fixtures passed independent file/test checks; their results do not establish general model
quality or lower total cost. Claude independent sessions and trusted automated evaluation promotion are not
available in v1. The MCP tests use fake database drivers, not live PostgreSQL/MySQL/SQL Server services.

The private repository's Actions jobs could not start because of account billing/spending limits. Those runs
are infrastructure blocks, not executed test failures. The public [Ubuntu/macOS evaluation matrix](https://github.com/ch4570/vulpora/actions/runs/34086808364) and
MCP Node 22/24 jobs passed. A 10-second browser deadline in the core job was increased to 30 seconds;
the release records the corrected core run and final package results.

## Private history and public source

The current source passes a hashed private-identifier check and a retired-name check. Old development history
contains private identifiers and local paths, so it is preserved privately. The public release starts from the
reviewed current source with a fresh history and a public-safe Git author. Old issue bodies, PR discussions,
reflogs, raw transcripts, local validation environments, and private audit artifacts are excluded.

See [release checks](public-release-checklist.md) and [remaining evaluation trust boundaries](eval-trust-boundaries.md).
