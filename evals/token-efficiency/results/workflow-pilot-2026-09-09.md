# Explicit workflow pilot — 2026-09-09

Status: **INCONCLUSIVE / environment-blocked**. No global default changed.

The [preregistered protocol](../WORKFLOW-EVAL.md) prepared nine isolated runs: three representative tasks
under baseline, concise and installed conditions. The first baseline invocation exited before emitting any
runtime events. The usage guard stopped the suite immediately. The other eight runs were not launched.

| Evidence | Observed result |
|---|---|
| Original result | [workflow-pilot-2026-09-09.json](workflow-pilot-2026-09-09.json) |
| Attempt artifact | [first baseline patch](workflow-pilot-2026-09-09-artifacts/01-workflow-catalog-repair-baseline-attempt-1.patch), empty; no task source changed |
| Planned / started / accepted tasks | 9 / 1 / 0 |
| Runtime | Codex CLI 0.153.4; exit 1 in 34 ms; stdout 0 bytes, stderr 168 bytes |
| Usage events / usage status | No events / unknown (`missing_final_usage`) |
| All-attempt tokens / cost ranges / cost per accepted task | Unknown / unknown / undefined |
| Quality | Original smoke tests pass; independent oracle and regression-mutation gate fail |
| Comparative quality, token savings, billed savings, investment payback | Not measured |

A subsequent **empty-stdin configuration diagnostic**, without a task prompt, reproduced:

```text
Error loading config.toml:
config.toml:12:1: unknown configuration field `network_access`
```

This explains why discovery (`codex debug prompt-input`, without strict configuration) succeeded but the
existing strict execution path failed at startup. It is an environment/configuration failure, not evidence
that baseline task quality is lower or that an installed workflow is cheaper. The absence of events does
not justify relabeling the original invocation's unknown billing as zero.

The global configuration was not changed by this experiment. Removing or bypassing host policy is not an
evaluation workaround. Any approved environment correction must be followed by a **new** result path; retain
this failed attempt and its unknown cost in the improvement/evaluation ledger. Do not overwrite it or include
it as a successful repeat. Preparation/installation wall-clock overhead and supervising development costs
were not instrumented and remain outside the recorded task-runtime latency, not free.

## Completion boundary

Implemented and verified offline: path-selection guide; fixed tasks, order and limits; held-out acceptance
and mutation checks; deduplicated invocation accounting; failed-repair and zero-success denominators;
unknown-usage stop; conservative cost ranges and payback gates; per-attempt artifacts.

**Still unverified:** a completed live matched comparison, live child accounting, semantic/human review quality,
current actual pricing, billing and total investment payback. The pilot does not satisfy adoption criteria,
and the historical edit-proposal 83.6% result is not a general savings claim.
