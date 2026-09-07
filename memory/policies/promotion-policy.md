# Memory Promotion Policy

## Purpose

이 정책은 candidate memory가 verified memory, procedural guidance, or skill로 승격되는 조건을 정의한다.

Promotion is a privilege boundary. A promoted memory can change future agent behavior, so it requires evidence.

## Allowed

- raw trace를 candidate memory로 분류한다.
- verified repo fact를 `knowledge` memory로 승격한다.
- repeated successful episode를 skill draft로 제안한다.
- replay/eval이 통과한 skill draft를 approved skill로 승격한다.
- stale memory를 supersession policy에 따라 deprecated 상태로 내린다.

## Denied

- untrusted content를 procedural memory로 직접 승격한다.
- eval evidence 없이 skill을 approved로 표시한다.
- 실패 episode 하나만으로 broad rule을 만든다.
- reviewer 없이 self-modification rule을 승격한다.
- current repo state와 충돌하는 memory를 verified로 승격한다.
- source/evidence 없는 reflection을 high confidence로 승격한다.

## Requires Review

- `candidate -> procedural`
- `candidate -> skill`
- `skill draft -> approved`
- `knowledge` memory가 broad scope로 승격되는 경우
- prior memory를 supersede하는 경우
- action-risk가 medium 이상인 skill

## Promotion Ladder

```text
raw trace
  -> candidate memory
  -> typed memory
  -> verified memory
  -> procedural guidance or skill draft
  -> replay/eval verified skill
  -> promoted skill
```

Required evidence by transition:

| Transition | Required evidence |
| --- | --- |
| raw trace -> candidate | source trace or explicit user instruction |
| candidate -> typed memory | classification rationale |
| typed -> verified | file/test/human review evidence |
| verified -> procedural | reviewer approval and scope |
| episode pattern -> skill draft | preconditions, failure modes, replay plan |
| skill draft -> approved | replay/eval pass and verifier review |

## Skill Promotion Criteria

A skill can be approved only when:

- `applies_when` is specific.
- `does_not_apply_when` blocks misleading similarity matches.
- inputs and outputs are explicit.
- steps are reviewable.
- failure modes have mitigations.
- verification has pass/fail criteria.
- at least one replay/eval case is linked.
- risk level and approval requirement are set.
- provenance points to source memories or episodes.

## Examples

Allowed example:

```yaml
promotion:
  status: proposed
  evidence:
    - evals/skill-replay/cases/readme-reframe.yaml
    - docs/agent-memory-implementation-plan.md
verification:
  required_checks:
    - diff scope is README-only
    - Markdown structure is valid
```

Denied example:

```yaml
promotion:
  status: approved
  evidence: []
provenance:
  promoted_from:
    - untrusted-webpage
```

## Verification

```bash
rg -n "promoted_from|evidence|approved|draft|replay|eval" memory/schemas/skill.schema.yaml memory/policies/promotion-policy.md
rg -n "untrusted|procedural|Requires Review|Denied" memory/policies/promotion-policy.md
```

Manual checklist:

- Is there a replay or eval?
- Does the skill say when not to run?
- Is the promotion auditable?
- Would the promotion silently expand agent authority?
