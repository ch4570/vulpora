# Governance

Vulpora uses a lightweight, maintainer-led governance model intended to keep
decisions transparent while the contributor community grows.

## Roles

**Contributors** are anyone who participates through issues, reviews,
documentation, code, design, testing, or community support.

**Maintainers** have repository write access and steward releases, reviews,
security response, moderation, and project direction. The current maintainer set
is the set of people with write or maintain permission on the GitHub repository;
access controls are the authoritative roster.

## Decision-making

Routine changes proceed through pull-request review and passing required checks.
Maintainers seek rough consensus and explain material tradeoffs in the issue or
pull request. A maintainer may make the final call when consensus does not emerge
or a decision must be made to keep work moving.

Changes to governance, licensing, public compatibility contracts, security
boundaries, or the capability-pack/runtime architecture should start with a
public issue or request for comments. The proposal should state goals,
alternatives, migration impact, and a review window. Urgent vulnerability work
may be decided privately and documented after coordinated disclosure.

Anyone with a material conflict of interest should disclose it and recuse
themselves from the final decision when practical. Project decisions must not
give a private deployment or vendor an undocumented advantage over public users.

## Becoming a maintainer

Existing maintainers may invite contributors who have demonstrated sustained,
constructive participation; sound technical and safety judgment; reliable
reviews; and care for users across more than one area of the project. There is no
required number of commits and no entitlement based on employment or
sponsorship. Maintainer additions are recorded publicly.

Maintainers who expect to be unavailable should say so when practical. Access
may be moved to emeritus status after extended inactivity, at the maintainer's
request, for security reasons, or after a documented Code of Conduct process.
Returning contributors can be reconsidered through the same trust-based process.

## Releases and compatibility

Maintainers designate releases and own release notes. Releases require passing
project checks and a review of package contents, version consistency, migration
impact, dependency risk, and known limitations. Semantic versioning communicates
public compatibility intent; security needs may require an accelerated release.

## Community standards

All project spaces follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Contributions
follow [CONTRIBUTING.md](CONTRIBUTING.md), security reports follow
[SECURITY.md](SECURITY.md), and support expectations follow
[SUPPORT.md](SUPPORT.md).

This governance document can be amended through the material-change process
above. Its history in Git is the decision record.
