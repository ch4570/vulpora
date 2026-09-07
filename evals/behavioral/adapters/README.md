# Behavioral Eval Adapter Contract

`run-behavioral-evals.sh --run` stays runtime-neutral. It calls the command in
`VULPORA_BEHAVIORAL_RUNNER_CMD`, captures stdout as the final agent response, and passes a
temporary metrics sidecar path through `VULPORA_METRICS_FILE`.

## Environment

Adapters receive:

| Variable | Meaning |
|---|---|
| `VULPORA_CASE_ID` | Behavioral case id |
| `VULPORA_ASSET` | Agent/asset id under evaluation |
| `VULPORA_ASSET_KIND` | Manifest source kind (`agent` or `skill`); supplied by the runner |
| `VULPORA_RUNTIME` | Target runtime label |
| `VULPORA_FIXTURE_REPO` | Absolute fixture repo path |
| `VULPORA_BASELINE_MODE` | Baseline mode requested by the case |
| `VULPORA_PROMPT_FILE` | Case YAML path |
| `VULPORA_METRICS_FILE` | Temporary flat YAML/JSON metrics sidecar to write |
| `VULPORA_MEASUREMENTS_FILE` | Temporary JSON provenance sidecar; only validated summary fields are retained |

## Output Contract

- stdout: final response text only. The runner hashes it, grades deterministic text signals, and deletes the raw file.
- stderr: adapter diagnostics. The runner keeps it only in the temporary directory.
- metrics sidecar: optional flat YAML or JSON. Raw trace is not allowed here; write only summary counts.

Supported metric keys:

```yaml
elapsed_seconds: 1
tool_calls: 3
files_read: 2
files_written: 0
command_count: 1
estimated_tokens: 500
estimated_tokens_measurement_kind: byte_quarter_proxy
estimated_tokens_scope: adapter_prompt_only
forbidden_action_hits: 0
guardrail_trips: 0
```

`process_score`, `safety_score`, and `cost_score` are deterministic heuristics over these values. They are
regression signals, not proof that an agent is safe or optimal.

## Complete context and token provenance

The Codex adapter and offline Claude prompt preview require Node.js 18.18+.
`plain-runtime` loads no asset context.
`agent-only` injects a skill's complete `SKILL.md`, or an agent's complete definition,
SOUL and principles. `agent-memory` also includes complete memory policies. Missing,
empty, ambiguous, unsafe or symlinked assets fail before the CLI runs. There are no
line truncation limits; entry files above 4 MiB fail explicitly.

This is an **entry injection evaluation**, not a test of runtime skill discovery.
The prompt declares that only inlined files and existing fixture files are available.
Other referenced files, scripts and dependency assets are not staged; the model must
report missing required context. The fixture sandbox remains unchanged. Retained
context provenance contains relative paths, full-file byte sizes and SHA-256 hashes,
not source contents.

`estimated_tokens` remains a compatibility heuristic, always `ceil(prompt_utf8_bytes / 4)`.
It excludes runtime system instructions, tools, history and outputs. It is neither a
tokenizer count nor an observed usage or billing total. Older untagged adapter values
retain `unknown` provenance.

The result's `measurements.usage` separately stores provider-reported counters:

- Codex: exactly one `turn.completed.usage`; input includes cached input. Reasoning
  is a separate reported field and is never added speculatively to output.
- Claude: exactly one successful `result.usage`; uncached input, cache reads and cache
  creation are distinct components of normalized input. This covers the main agent
  loop, excluding subagents. Per-step assistant events and `modelUsage` are not added
  to the final result. See [Claude usage scopes](https://code.claude.com/docs/en/agent-sdk/cost-tracking)
  and [cache components](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).
- Missing categories are `null`; malformed events, duplicate final events or keys,
  invalid counters and failed invocations produce explicit unknown usage with a reason.
  A failed CLI can have consumed tokens. Unknown usage never becomes billed zero.

`input_output_tokens` only sums normalized input and output when both are known;
it is not a price. No billing amount is inferred. The parser accepts the
[documented Codex JSONL final event](https://developers.openai.com/codex/noninteractive).
All parser and prompt-construction tests use fixtures, with no model calls.
The Claude usage parser is fixture-tested; the bundled Claude live entry point is
blocked pending verified machine isolation and does not produce live measurements.

Matrix summaries and strict improvement-result imports validate additive measurement
fields with `validate-result-measurements.cjs`. They accept the exact explicit-unknown
sentinel or the complete allowlisted envelope, reject duplicate/unknown keys and
invalid types, and require proxy counts and labels to agree. Legacy results without
these fields remain readable; measurement metadata does not override outcome scores.

## Sample

Use the sample adapter for runner plumbing only; it does not invoke an LLM.

```bash
VULPORA_BEHAVIORAL_RUNNER_CMD='bash evals/behavioral/adapters/sample-adapter.sh' \
  bash evals/behavioral/run-behavioral-evals.sh --run --only=kotlin-spring-reviewer
```

## Local Claude Code

`claude-code-local-adapter.sh` currently refuses live execution before reading
task input or invoking a CLI. It returns exit `3` and a summary on stderr:

```json
{"runtime":"claude","outcome":"INCONCLUSIVE","reason":"MACHINE_ISOLATION_UNVERIFIED","promotion":"BLOCKED"}
```

Neither `VULPORA_CLAUDE_EXTERNAL_SANDBOX=1`, a permission mode, CLI login, nor a
signed trial bundle establishes machine-enforced filesystem/network/process
isolation. There is no environment-variable bypass. Existing signed-evidence
verification explicitly leaves isolation unverified, so it cannot unlock this
adapter. The behavioral runner records this nonzero adapter result as a failure;
it must never count it as a passing live trial.

The only supported option is an offline prompt preview. It reads local case and
asset files, prints the complete prompt, and never invokes Claude or writes usage:

```bash
VULPORA_PROMPT_FILE=evals/behavioral/cases/agent-evaluator/evidence-backed-scorecard.yaml \
VULPORA_FIXTURE_REPO=evals/behavioral/fixtures/repos/sample-application-architecture \
VULPORA_ASSET=agent-evaluator VULPORA_BASELINE_MODE=agent-only \
  bash evals/behavioral/adapters/claude-code-local-adapter.sh --prepare-prompt
```

Preview exit `0` means prompt preparation only. Do not configure preview as a
behavioral runner. Restoring live support requires an independently trusted
runner/provenance policy, enforced isolation with denial probes, and verification
of that execution boundary. See [the operational gaps](../../../docs/eval-trust-boundaries.md).
