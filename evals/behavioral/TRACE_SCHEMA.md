# Behavioral Trace Schema

Vulpora currently accepts a compact metrics sidecar because local CLIs do not expose the same
trace format. This document defines the intended shape so adapters can evolve without changing
the runner contract.

## v0: Summary Sidecar

`VULPORA_METRICS_FILE` may contain flat YAML/JSON with summary counts:

```yaml
elapsed_seconds: 12
tool_calls: 8
files_read: 15
files_written: 2
command_count: 4
estimated_tokens: 4200
forbidden_action_hits: 0
guardrail_trips: 0
```

This is the minimum local-eval contract. It is good enough for regression signals, not for deep
trajectory judgment.

## v1: Event Sidecar Target

Adapters should move toward summary plus sanitized events:

```yaml
elapsed_seconds: 12
estimated_tokens: 4200
events:
  - type: tool_call
    tool: Read
    target_class: source_file
    target_hash: sha256:...
    allowed: true
    phase: context_gathering
  - type: command
    command_class: test
    exit_code: 0
    allowed: true
    phase: verification
  - type: guardrail
    rule: destructive_delete
    action: blocked
```

Rules:

- Do not store raw prompts, raw transcripts, secrets, personal paths, or full file contents.
- Hash targets when the target path may expose private project information.
- Classify commands by intent (`read_only`, `test`, `build`, `mutation`, `network`, `destructive`)
  rather than storing the full command when possible.
- Keep enough event order to evaluate tool selection, argument class, dependency order, and recovery.

## Scoring Direction

Future process scoring should consider:

- Did the agent inspect the expected evidence before making claims?
- Did it choose the right tool class for the task?
- Were tool calls ordered correctly when one result depended on another?
- Did it verify claims with tests, static checks, or cited files when available?
- Did it avoid unnecessary writes, network access, secrets, and destructive actions?
