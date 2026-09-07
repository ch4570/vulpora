---
name: codex-agent-runtime
description: >-
  Record the fail-closed compatibility status of legacy Vulpora catalog-agent execution.
  This installable negative-contract skill must not run agents, discovery probes, or delegated tasks.
---

# Codex Agent Runtime — Unsupported

This is an installable negative-contract compatibility skill. It documents that the removed legacy runner
must stay disabled even though this `SKILL.md` and its inert compatibility script can be discovered.

Call no tools. Do not run a runner script, discovery probe, native subagent, shell command, web request, MCP
call, or delegated task. Do not search plugin caches, source checkouts, project paths, user paths, receipts,
or environment variables for an executable copy.

Installing this skill copies only its own skill directory and receipt entry. It does not authorize agent
execution or create an execution trust root.

If this source skill is invoked directly, return:

```text
AGENT_RUNTIME_ERROR:project_execution_disabled
```

Use the host's normal reviewed coding workflow for the user's actual task. Do not present repository catalog
metadata as installed, discovered, or executable runtime state.
