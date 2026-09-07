---
name: agent-eval
description: Evaluate a new or changed agent or skill before merge with NVIDIA SkillEvaluator evidence and adversarial review.
---

# agent-eval — Agent/Skill Adversarial Evaluation Workflow

## Purpose

Read the target asset **trying to break it**, bind every judgment to evidence (file:line · SkillSpector finding · reproduction), and produce severity-ranked defects plus a 0–10 scorecard. This is the execution engine of the `agent-evaluator` agent.

> **Grounding docs**: [`reference/principles.md`](reference/principles.md), [`reference/kb/INDEX.md`](reference/kb/INDEX.md).
> Don't trust scores at face value — SkillEvaluator and SkillSpector results are **triage input**.

## When to use

- Gate a new/changed agent or skill before install/merge.
- "Evaluate / review / security-check this agent (skill)."
- Quality + security check after `install/check-manifest.sh` passes.

## Prerequisites and scope

- `tier1` requires an installed, pinned `skillevaluator` CLI; use the wrapper help for its exact installation command.
- `security`, `tier2`, and `tier3` require the scanners, providers, credentials, datasets, and sandbox described in [`kb/skillevaluator-usage.md`](reference/kb/skillevaluator-usage.md). Missing prerequisites are incomplete evidence, never a pass.
- Keep reports outside the target repository. Do not run `validate --full` or `--autopilot`, because they can create target-local evaluation data.

## Instructions

### Identify the target

- Agent: `agents/<name>.md` + sibling bundle (`agents/<bundle>/SOUL.md`, `reference/`). Confirm the bundle stem via the relative path in the definition body.
- Skill: `skills/<name>/SKILL.md` + `reference/`.
- Comparison baseline: `STANDARD.md` + exemplar assets (`agents/postgres-dba.md`, `skills/flyway`).

### Evaluate and triage

1. **Load**: Read all the target's files + STANDARD + exemplar assets.
2. **D1/D3 conformance measurement**: Using the [`kb/eval-workflow.md`](reference/kb/eval-workflow.md) commands, check the directory, frontmatter, `## Review hooks`, hardcoded `model`, tools, and forbidden tokens via `ls`/`grep`.
3. **Select an evaluation tier**: Read [`kb/skillevaluator-usage.md`](reference/kb/skillevaluator-usage.md). Default to keyless `tier1`; use `security`, `tier2`, or `tier3` only when their scanners, providers, credentials, datasets, and sandbox evidence exist.
4. **Run SkillEvaluator**: Resolve `AGENT_EVAL_SKILL_ROOT` to the directory containing this loaded `SKILL.md`, then run `bash "$AGENT_EVAL_SKILL_ROOT/scripts/run-skillevaluator.sh" [--mode <mode>] <skill-path>`. Keep reports outside the target repository and preserve exit `0/1/2/3` plus `overall_status`.
5. **D5 security scan**: For agents or when the selected mode lacks complete security evidence, follow [`kb/skillspector-triage.md`](reference/kb/skillspector-triage.md). Never call a missing scanner or incomplete result green.
6. **Triage (required)**: Open the `location` line of every HIGH/CRITICAL finding and **judge intent**. Forbidding-context / legitimate-API / config-read = separate as false positives, keep only true positives.
7. **D2/D4 adversarial verification**: Extract claims → actually render/run examples → construct counterexamples → (if code) build/smoke · attempt bypass → confirm the determinism tie-breaker.
8. **Severity and scoring**: Apply [`kb/scorecard-format.md`](reference/kb/scorecard-format.md) calibration and score all 5 dimensions with evidence.
9. **Scorecard output**: Defects (evidence → impact → minimal fix) + tier/status + triage table + what was done well + conclusion + **verification-scope disclosure**.

## Available scripts

| Script | Purpose | Arguments |
|---|---|---|
| `scripts/run-skillevaluator.sh` | Run one selected tier for a skill, or keyless Tier 1/security across a source catalog, without adding a project dependency or retaining reports in the repository. | `[--catalog] [--mode tier1\|security\|tier2\|tier3] [--output-dir <directory>] <skill-directory\|skills-directory>` |

Use the runtime's shell or `run_script` capability to invoke this wrapper. Preserve its exit status and record the printed report directory.

## Examples

```bash
# Keyless deterministic Tier 1 evidence
bash skills/agent-eval/scripts/run-skillevaluator.sh skills/flyway

# Evaluate every source skill in a catalog with the same keyless Tier 1 gate
bash skills/agent-eval/scripts/run-skillevaluator.sh --catalog skills

# Explicit Tier 3 only after doctor, dataset, provider, and sandbox are ready
bash skills/agent-eval/scripts/run-skillevaluator.sh --mode tier3 --agents codex --env-mode docker skills/flyway
```

## Output (scorecard-format.md)
```
## Evaluation target — <name·path> (baseline: STANDARD.md, SkillEvaluator vX/tier/status, SkillSpector vX, static/LLM/live)
## Overall: D1 n · D2 n · D3 n · D4 n · D5 n /10 → approve/conditional/block + reason
## Defects (by severity): [SEV] title — evidence → impact → minimal fix
## SkillSpector triage: | finding | classification | evidence line | true/false positive | reason |
## What was done well / application priority / verification-scope disclosure
```

## Verify (completion criteria)
- [ ] Actually ran SkillSpector and triaged every HIGH/CRITICAL.
- [ ] For a skill, ran the selected SkillEvaluator tier and recorded exit code, overall status, report path, and prerequisite completeness.
- [ ] In D2/D4 actually rendered/ran the examples and attempted counterexamples (if 0 defects, showed the "failed to disprove").
- [ ] Each of the 5 dimension scores has evidence, and severity follows the calibration rule.
- [ ] Disclosed the verification scope — static/LLM, whether executed, etc.

## Limitations

Tier 1 is a deterministic, keyless quality gate; it does not prove live agent lift. Tier 2 and Tier 3 are optional evidence paths and must remain non-pass when their provider, runtime, dataset, scanner, or sandbox prerequisites are absent.

## Troubleshooting

| Error or condition | Cause | Resolution |
|---|---|---|
| `skillevaluator 실행 파일이 없습니다` | The pinned CLI is not installed or not on `PATH`. | Run the wrapper's `--help` installation command, then retry. |
| Version rejected | The installed CLI is not the audited pinned release. | Install the exact revision in `--help`; do not relax the version guard. |
| `incomplete` result or Tier 3 doctor failure | A required scanner, provider, credential, dataset, agent runtime, or sandbox is unavailable. | Record non-pass scope, fix the missing prerequisite, then rerun the same tier. |

## Related
[[skill-updater]] · [[knowledge-audit]] · `agent-evaluator` · `STANDARD.md` · [SkillEvaluator](https://github.com/NVIDIA/SkillEvaluator) · [SkillSpector](https://github.com/NVIDIA/SkillSpector)
