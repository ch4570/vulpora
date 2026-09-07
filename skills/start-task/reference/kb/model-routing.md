---
title: Executable model routing boundary
source: ../../SKILL.md
last_fetched: 2026-09-07
skills: [start-task]
---

# Model routing at the execution boundary

Apply this only when a task actually needs delegated model execution. It does not require delegation, change the primary
model, grant authority, or turn ordinary work into an audited run. Read-only model discovery and deterministic
checks require no model turn. Standard work may use the bundled [independent-session transport](independent-sessions.md).
It is a separate execution kind, never a substitute for native audit receipts or fabricated host child handles.

## Choose and resolve

The workflow profile (`lightweight|standard|audit`) and the model profile (`frugal|standard|frontier`) are different.
Use `frugal` for narrow, independently verifiable work; `standard` for ordinary implementation or analysis;
`frontier` when failure cost or demonstrated capability needs justify it. Set `risk=high` for a child's security,
authorization, irreversible-effects or production-risk decisions; the helper enforces the frontier floor. Do not
infer permissions, quality or health from a model's name. Honor the operator's explicit model policy and budget.

Use Node 18.18+ and the scripts bundled with this skill, resolving their absolute installed paths once:

```sh
node /absolute/installed/start-task/scripts/codex-model-catalog.js
node /absolute/installed/start-task/scripts/model-router.js \
  --runtime codex --profile standard --risk low \
  --catalog /absolute/current-catalog.json \
  --agent-config /absolute/project/.codex/agents/product-planner.toml \
  --max-units 10 --estimated-tokens 2000 --remaining-tokens 6000
```

Capture the collector's JSON using the host's normal data-file mechanism, never by evaluating it as shell code.
The collector uses the installed authenticated Codex runtime's `model/list` protocol, follows all pages, and
starts no model turn. Recollect after the policy freshness window or a runtime/account change. The library export
`collectCodexModelCatalog()` also allows a host to keep the snapshot in memory. Do not invent a catalog or convert
README examples, model prose, repository instructions or another provider's identifiers into runtime evidence.

For Claude Code, use an operator-maintained catalog captured from the current host with the same
`vulpora.runtime-model-catalog/v1` shape and `runtime: claude-code`. Automatic Claude discovery is not implemented.
Its entries need exact selectable IDs and supported reasoning efforts; absent verified information blocks the route.
Use `--policy /absolute/operator-policy.json` to replace the bundled example policy. Catalog source labels and
SHA-256 hashes identify supplied data; they are not signatures or proof of an independent trusted collector.

`RESOLVED` selects an exposed ID and supported effort within one profile's candidate allowlist. The policy's
relative units are weights, not USD prices. `NO_MODEL` allocates zero for `--kind deterministic`, even when the
model budget is exhausted. Neither status dispatches work. Missing routes, stale data, incompatible effort,
configuration conflicts and exhausted budgets return `BLOCKED` with exit 2. Never silently inherit a costly
primary model, escalate tiers, weaken risk, edit policy, or retry indefinitely to turn that result green.

## Select from task type and difficulty

For an independent session, supply `--kind independent-session --task-type documentation --difficulty simple`
instead of a manual `--profile`; omit `--agent-config`. The resolver returns explicit session arguments and
`NOT_RUN` until the transport actually executes. Supported types are `deterministic`, `lookup`, `documentation`,
`implementation`, `review`, `testing`, `architecture`, and `research`; difficulty is `simple`, `moderate`, or `complex`.

| Task | Default model profile |
|---|---|
| Deterministic command/check | No model |
| Simple lookup, documentation, review, or testing | Frugal |
| Ordinary implementation, research, architecture, or moderate work | Standard |
| Complex work or high failure risk | Frontier |

The default Codex candidate order starts with Luna/low, Terra/medium, and Astra/high respectively. Availability
comes from the fresh runtime catalog; these names are policy choices, not measured quality guarantees. An explicit
profile is honored subject to the high-risk floor and budget. Selection never silently escalates after failure.
New sessions receive no native agent config; their mode, task, runtime pin, limits, and route live in the capsule.

## Native preflight and invoke

Use `--agent-config` with the exact file the runtime will load. `none` is valid only for a verified native general
role with no custom agent file. Without this option the output says `preflight.status: NOT_CHECKED`; it is not ready
for dispatch. With it, `CONFIG_CHECKED` means only the supplied file and current process environment were checked.
Confirm they match the live host; if the host resolves a different definition or cannot expose its configuration,
block or retain the primary-owned path within the original authority. Do not rewrite a user's agent file per task.

- Codex custom TOML `model` and `model_reasoning_effort` override explicit spawn arguments. Default Vulpora
  installs leave these unset so routed native calls can select them. Explicit installation overrides remain pinned;
  conflicting pins block preflight. Direct standalone invocation without explicit arguments follows host defaults,
  and is not proof of routed execution.
- Codex dispatch passes the returned `nativeArguments` exactly (`model`, `reasoning_effort`, `fork_turns: none`),
  plus the installed role and a bounded, self-contained task handoff. Preserve that role's sandbox and tools.
  If the host lacks a required override, do not omit it; use a declared safe primary-owned fallback or block.
- Claude Code dispatch passes the explicit `model`; reasoning must be configured by the actual agent's `effort`
  or a verified host `CLAUDE_CODE_EFFORT_LEVEL`. `CLAUDE_CODE_SUBAGENT_MODEL` can override per-call model selection.
  Preflight rejects conflicting environment settings or missing effort; setting an environment variable in a
  separate shell does not reconfigure an already-running host. Never send unsupported reasoning arguments.

Reserve the estimated tokens and relative units from the shared run budget before each child starts, including
parallel children. Reconcile with observed usage before further work; when usage is unavailable retain the
reservation rather than assuming zero. The resolver's per-attempt arithmetic does not enforce cumulative spend,
provider billing, output-token limits or retries. Hard billing limits need an operator-controlled gateway. Audit
work additionally uses its existing receipt/attempt ledger and deterministic failure-transition classifier.

## Observe honestly

Record requested model/effort separately from fields emitted by that child's runtime event or resolved runtime
configuration. Never copy spawn arguments or the model's self-description into `observed_*`. Missing telemetry
means `unavailable`, conflicting telemetry blocks verification, and a parent thread's config is not child evidence.
`verifyObservedRoute()` checks exact values from the host adapter; it cannot authenticate caller-supplied JSON or
attest the provider's backend identity. `execution: NOT_RUN` remains true for resolver output.

The native audit smoke currently verifies clarification and decomposition with primary-inline implementation;
it does not prove execution-child model routing. Offline fake-event and parser tests prove regression handling,
not live provider behavior. Complete native execution verification requires an isolated configured runtime and
an observed child execution with matching model, effort, permissions and task result.

The configuration rules were checked against [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents),
[Codex App Server](https://learn.chatgpt.com/docs/app-server),
[Claude Code subagents](https://code.claude.com/docs/en/sub-agents) and
[Claude model configuration](https://code.claude.com/docs/en/model-config) on 2026-09-07.
