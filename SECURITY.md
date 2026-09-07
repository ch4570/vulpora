# Security Policy

Vulpora installs executable agent and skill definitions, manages local
receipts, and includes an optional database-facing MCP server. Treat findings
that cross these trust boundaries as security-sensitive.

## Supported versions

Security fixes are made on the default branch and released in the newest
supported release line. The latest published release receives security updates;
older releases may be asked to upgrade. The default branch is development code
and is not a stable release.

## Report a vulnerability privately

Do not open a public issue, discussion, or pull request for a suspected
vulnerability. In this repository on GitHub:

1. Open the **Security** tab.
2. Select **Advisories**.
3. Select **Report a vulnerability**.
4. Include the affected version or commit, impact, prerequisites, minimal
   reproduction, and any suggested mitigation.

Remove credentials, private data, and proprietary repository content from the
report. If the private reporting button is unavailable, open a public issue that
only asks maintainers to enable private vulnerability reporting; do not include
vulnerability details.

## What to report

Examples include:

- installation or uninstall behavior that writes outside the selected scope or
  removes files not owned by a valid receipt;
- path traversal, symlink, archive, or unsafe temporary-file handling;
- command or argument injection across runtime adapters and shell boundaries;
- credential disclosure through prompts, logs, errors, package contents, or MCP
  responses;
- bypasses of database read-only, schema allowlist, statement, or result-size
  controls in `mcp/nl-sql`;
- prompt or tool-result injection that produces an unauthorized side effect
  despite a documented enforcement boundary; and
- dependency or release-package compromise with a concrete impact path.

Reports about general model quality, expected prompt variability, unsupported
versions, or findings with no plausible security impact belong in the regular
issue tracker. Denial-of-service reports should demonstrate an impact beyond
ordinary local resource exhaustion.

## Response and disclosure

Maintainers aim to acknowledge a report within five business days, provide an
initial assessment within ten business days, and send periodic updates while a
fix is in progress. These are targets, not a service-level guarantee.

Please allow time for coordinated remediation and release before publishing
details. Maintainers will credit reporters who request attribution and will ask
before naming anyone in an advisory. Duplicate reports are handled in the order
they were received.

## Safe-harbor intent

The project considers good-faith research to be work that avoids privacy
violations, data destruction, service disruption, persistence, and access beyond
what is necessary to demonstrate the issue. Stop testing and report immediately
if you encounter secrets or personal data. This statement does not authorize
testing systems, accounts, or data that project maintainers do not own.
