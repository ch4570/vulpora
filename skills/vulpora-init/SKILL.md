---
name: vulpora-init
description: Initialize or refresh repository-level Vulpora routing guidance in AGENTS.md from detected technology-stack evidence. Use immediately after installing Vulpora skills, when opening a repository for the first time, or after build dependencies and persistence/search infrastructure change; do not use for ordinary feature implementation.
---

# Vulpora Init

Initialize the repository before ordinary implementation work so later agents can route generic requests from
repository facts instead of requiring technology names in every prompt.

## Run

Resolve this installed skill's directory and execute its bundled updater against the repository root:

```bash
node <vulpora-init-skill-root>/scripts/update-routing-guidance.js --target <repository-root>
```

Codex users invoke `$vulpora-init`; Claude Code users invoke `/vulpora-init`. Run it once after installation and
again whenever build dependencies or the persistence/search stack changes.

The updater must:

- inspect build files, source extensions, runtime configuration, migrations, mappings, and query code without
  executing repository content;
- write only the `<!-- VULPORA:ROUTING:START -->` ... `<!-- VULPORA:ROUTING:END -->` block in root `AGENTS.md`;
- preserve all user-authored content outside that block and replace the block idempotently on later runs;
- route only from observed evidence and keep absent or unsupported stacks unclaimed;
- record evidence paths and conditional implementation, test, and review capabilities for each detected profile;
- treat specialist IDs as catalog recommendations: use them only when installed, otherwise recommend the matching
  `pack:<id>` and continue with repository-local guidance rather than claiming a missing capability ran.

Use `--dry-run` to inspect the generated block without writing. Use `--check` in CI to fail when the checked-in block
does not match current repository evidence. Refuse malformed/duplicate markers and symlinked `AGENTS.md` instead of
overwriting uncertain content.

## Verify

After the update, inspect `git diff -- AGENTS.md`. Confirm that manual instructions remain unchanged, evidence paths
exist, the required `code-authoring-router` belongs to the installed dependency closure, specialist references are
conditional recommendations, and a second `--check` invocation passes.
