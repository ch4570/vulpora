# Contributing

Thank you for helping improve Vulpora. Contributions can include capability
packs, runtime portability work, safety controls, tests, documentation, and bug
fixes. Small, focused changes are the easiest to review and maintain.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Security reports follow a separate, private process described in
[SECURITY.md](SECURITY.md).

## Before opening a change

1. Search existing issues and pull requests for related work.
2. Open an issue before undertaking a broad architectural change, changing a
   public contract, or adding a dependency. This lets maintainers confirm the
   scope before substantial work begins.
3. Keep secrets, private repository names, internal hostnames, personal paths,
   and proprietary examples out of commits, fixtures, logs, and screenshots.

For a small bug fix or documentation correction, a pull request can be the first
point of discussion.

## Development environment

The portable core targets macOS and Linux and expects Bash, Git, Node.js with
npm, and standard Unix utilities. Use a currently supported Node.js LTS release.
Python 3.11 or newer adds a second TOML parser when available, but is not a
required dependency; the repository includes a dependency-free contract
validator for older hosts.

The complete offline test suite also requires `ripgrep`, Python 3, and Poppler
(`pdfinfo` and `pdftocairo` or `pdftoppm`). Actual PDF integration requires a local
Chromium-family browser; Linux CI selects the installed stable Chrome binary
with its existing OS sandbox profile. CI installs these test-only prerequisites
explicitly. They are not dependencies of the portable installer itself.

Network-denial fixtures require an enforced network sandbox. macOS uses
`sandbox-exec`; Linux uses a network namespace. The GitHub-hosted Linux workflow
provides a CI-only namespace launcher that creates a fresh namespace and drops
back to the runner UID before executing fixture commands. It does not change
AppArmor policy, disable a browser sandbox, or treat an unavailable sandbox as
a successful denial test. Do not add `.github/ci-bin` to your local PATH.
Offline interruption and configuration-drift tests use explicitly marked
synthetic faults; they neither require a Codex/Claude login nor invoke a model.
Live runtime authentication and post-execution drift gates remain separate.

The root package has no install-time dependencies or environment-mutating npm
lifecycle. Do not run a global root-package installation just to contribute.
The optional NL-to-SQL MCP server has its own locked dependency tree:

```sh
cd mcp/nl-sql
npm ci --ignore-scripts
```

## Repository model

- `agents/` contains canonical agent definitions and their knowledge bundles.
- `skills/` contains portable skill sources. Avoid runtime-specific trigger
  language in shared skill metadata.
- `install/manifest.txt` is the source of truth for installable assets and their
  dependency graph.
- `install/packs.txt` groups explicit agent and skill roots into capability
  packs; transitive dependencies still come from the manifest.
- `install/` contains runtime installation, receipt, validation, and integration
  scripts.
- `evals/` contains structural and behavioral evaluation cases.
- `mcp/nl-sql/` is an independently built TypeScript MCP server.

Follow [STANDARD.md](STANDARD.md) when adding or changing an agent, skill,
knowledge bundle, or evaluation. Keep examples product-neutral and make trust,
permission, side-effect, and failure boundaries explicit.

## Making a change

- Start from the repository's default branch and work on a focused branch.
- Preserve compatibility unless the issue explicitly proposes a breaking
  change. Call out receipt, manifest, schema, CLI, and runtime migration effects.
- Add a regression test for a bug fix and contract/evaluation coverage for new
  behavior.
- Update nearby documentation when commands, configuration, or user-visible
  behavior changes.
- Do not edit generated runtime copies as if they were canonical sources. Change
  the source asset and its rendering or installation logic.
- Avoid new dependencies when a small, auditable standard-library solution is
  practical. Explain the maintenance and security tradeoff for any dependency.

## Validation

Run the checks relevant to your change. These commands do not install the root
package globally:

```sh
bash install/check-manifest.sh
bash evals/run-evals.sh
bash evals/behavioral/run-behavioral-evals.sh --validate
npm test
```

For changes to `mcp/nl-sql`:

```sh
cd mcp/nl-sql
npm ci --ignore-scripts
npm test --if-present
npm run typecheck
npm run build
npm audit --audit-level=high
```

Run targeted contract tests next to the changed asset while iterating. The
normal source gate can run against an in-progress worktree:

```sh
npm run check
```

This gate excludes the live runtime scripts and
`install/test-start-task-matrix.sh`; those can launch authenticated Codex or
Claude sessions and must only be run explicitly in an isolated test environment.

Before publishing from a committed, clean worktree, run `npm run check:release`.
That stricter gate compares the npm tarball to Git `HEAD` and rejects staged,
unstaged, or untracked package inputs. CI repeats the release gate on Linux and
macOS.

## Pull requests

A pull request should:

- explain the problem and the chosen scope;
- link the related issue when one exists;
- list the verification commands and their results;
- identify compatibility, security, privacy, and migration effects;
- avoid unrelated formatting or generated-file churn; and
- remain reviewable as one coherent change.

Maintainers may ask for a smaller split when a change combines independent
concerns. Reviews focus on behavior, safety, portability, tests, and long-term
maintenance rather than author seniority.

Contributions are provided under the license in [LICENSE](LICENSE). Do not submit
material you do not have the right to license, including copied prompts,
proprietary documentation, or incompatible code.

## Getting help

Use [SUPPORT.md](SUPPORT.md) to choose the right support channel. Project roles
and decision-making are described in [GOVERNANCE.md](GOVERNANCE.md).
