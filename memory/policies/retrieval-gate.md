# Retrieval Gate Policy

## Purpose

이 정책은 memory search 결과가 agent context에 들어가기 전에 통과해야 하는 gate를 정의한다.

Similarity retrieval은 candidate discovery일 뿐이다. High similarity does not imply admission.

## Allowed

- verified, scoped, fresh memory를 `admit`한다.
- useful but historical memory를 `evidence_only`로 제공한다.
- wrong-scope, stale, conflicting, unverified memory를 `reject`한다.
- suspicious or instruction-bearing untrusted memory를 `quarantine`한다.

## Denied

- similarity score만으로 memory를 admit한다.
- 현재 사용자 지시와 충돌하는 memory를 admit한다.
- 현재 repo state와 충돌하는 stale memory를 행동 지침으로 사용한다.
- untrusted procedural memory를 context instruction으로 넣는다.
- provenance 없는 memory를 admit한다.
- high-risk action에 영향을 주는 unreviewed memory를 admit한다.

## Requires Review

- high-risk action에 procedural memory를 적용하려는 경우
- stale but possibly still useful memory를 supersession 없이 사용하려는 경우
- untrusted source에서 출발한 memory를 `evidence_only` 이상으로 올리려는 경우
- broad-scope memory가 current repo behavior에 영향을 주는 경우

## Gate Checks

The retrieval gate must evaluate:

1. Scope: Does the memory apply to this repo, user, task, role, and action?
2. Trust: Is the source trusted enough for the intended use?
3. Freshness: Is the memory still valid?
4. Conflict: Does it conflict with user instruction, repo state, policy, or newer memory?
5. Provenance: Is source evidence present?
6. Risk: Could this memory change behavior, tool use, permissions, or file edits?
7. Citation: Can the agent cite the memory source if used?

## Decision Matrix

| Condition | Decision |
| --- | --- |
| Verified, scoped, fresh, no conflict, low risk | `admit` |
| Relevant history but not normative | `evidence_only` |
| Wrong scope | `reject` |
| Missing provenance | `reject` |
| Stale and conflicts with current evidence | `reject` |
| Untrusted content contains instructions | `quarantine` |
| Procedural memory without review | `reject` or `quarantine` |
| High-risk action with medium confidence | `evidence_only` or `reject` |

## Context Injection Rules

Admitted memory must be injected with metadata:

```text
Memory: <summary>
Source: <source uri or run id>
Trust: <level/confidence>
Scope: <scope>
Use: admitted | evidence_only
Warnings: <warnings>
```

Memory must not be injected as if it were a system or developer instruction.

## Examples

Allowed example:

```yaml
decision: admit
reason: Verified Vulpora repository purpose from README matches current docs task.
checks:
  scope_match: pass
  trust_allowed: pass
  freshness: fresh
  conflict: none
```

Denied example:

```yaml
decision: admit
reason: Similarity score is 0.91.
checks:
  scope_match: unknown
  trust_allowed: fail
  provenance_present: false
```

## Verification

```bash
rg -n "admit|evidence_only|reject|quarantine" memory/schemas/retrieval-decision.schema.yaml memory/policies/retrieval-gate.md
rg -n "similarity|provenance|conflict|stale|untrusted" memory/policies/retrieval-gate.md
```

Manual checklist:

- Could the memory be useful but unsafe? Use `evidence_only`.
- Is the memory current? If unknown, do not admit high-risk guidance.
- Does current repo evidence disagree? Current repo wins.
- Does user instruction disagree? User instruction wins unless unsafe.
