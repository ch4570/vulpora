---
name: retro
description: Work retrospective for this repository. Reviews a finished task/session, structures it as Keep/Problem/Try, and derives concrete harness-improvement proposals (rules, skills, agents, knowledge). Persists the retro log under .claude/retro/ and applies approved improvements only after user confirmation. Use after finishing a task or session, or when the user asks to reflect on recent work.
---

# /retro — work retrospective

Reflect on completed work in a structured form and derive **harness improvements**. The point is not a diary
— it is to turn recurring friction into permanent fixes (rules, skills, agents, knowledge), so the harness gets
better over time instead of repeating the same mistakes. This is the **Sensor** half of the harness trust loop;
its findings flow into [`learn`](../learn/SKILL.md) and [`harness-propose`](../harness-propose/SKILL.md).

> **Authority**: [`AGENTS.md`](../../../AGENTS.md) is binding. This skill never edits AGENTS.md, a skill, an
> agent, or knowledge **without explicit user approval** (§4) — consistent with the repo's commit/MR approval gate.

> **Reference loading (progressive disclosure):**
> Read [principles](reference/principles.md) first, then use the [KB index](reference/kb/INDEX.md).
> Load only topic files matching the current task; MUST NOT recursively load the entire KB.

## Preprocessing (MUST)

Before retrospecting, load current harness state:
- `AGENTS.md` and `CLAUDE.md` — repo rules and harness entry points.
- `.claude/knowledge/README.md` — existing knowledge index (avoid re-deriving what is already recorded).

## Procedure

### 1. Gather what happened

```bash
git log --oneline -20
git diff --stat HEAD~5 2>/dev/null || git diff --stat
```

Identify the recent work (commits, changed files, churn). **Ask the user** which task/scope to retrospect if it is ambiguous.

### 2. Structure the retrospective (Keep / Problem / Try)

- **Keep** — what worked: effective approaches, rules the agent followed well, tools/skills/agents that saved time.
- **Problem** — what hurt: where time was lost and why, what needed repeated correction, mistake patterns, compile/test failure patterns.
- **Try** — what to do differently next time: a better approach, a tool/agent that was available but unused.

### 3. Harness-improvement proposals

For each recurring mistake or friction, decide whether a **permanent** harness change would prevent it.
Classify each proposal by harness area:

| # | Harness area | Typical fix |
|---|---|---|
| 1 | Context engineering | Add domain/decision knowledge to `.claude/knowledge/`, or clarify `AGENTS.md`/`CLAUDE.md` |
| 2 | Skills | Add/refine a skill (e.g. the language/framework review skill, the test-authoring skill, E2E skills) |
| 3 | Sub-agents | Add/refine an agent under `.claude/agents/` |
| 4 | Guardrails | Add a normative MUST/MUST NOT rule to `AGENTS.md` or the relevant skill |
| 5 | Verification | Add a check to a skill's "done" criteria or the E2E catalog |

> If the repo has **no enforcement hooks**, guardrails live as prose rules in `AGENTS.md`/skills.
> In that case propose rule/skill changes, not hooks, unless the user explicitly wants to add hook infrastructure.

Render proposals as a table:

```markdown
| 대상 | 변경 | 이유 | 하네스 영역 |
|------|------|------|-----------|
| .claude/knowledge/ | <주제> 문서화 | 도메인 지식이 없어 반복 추적함 | 1 컨텍스트 |
| test-authoring SKILL.md | <체크> 추가 | 같은 테스트 실수 반복 | 2 스킬 |
```

### 4. Persist + apply (approval-gated)

1. Write the retrospective to `.claude/retro/<YYYY-MM-DD>-<slug>.md` (use the date from `git log`/`date`),
   and add a one-line link to the index in `.claude/retro/README.md`.
   > Retro logs live in `.claude/retro/` (working log), **not** in `.claude/knowledge/` (durable knowledge).
2. Present the harness-improvement table to the user. **Apply approved items only.**
   Durable insights → hand off to [`learn`](../learn/SKILL.md) (which writes to `.claude/knowledge/`); broad/trend-driven changes → [`harness-propose`](../harness-propose/SKILL.md).
3. **MUST NOT** modify `AGENTS.md`, any skill, any agent, or knowledge (beyond the retro log file itself) without explicit user approval.

## Output format

```markdown
## 작업 회고 (YYYY-MM-DD)

### 작업 요약
- 커밋 N개 / 변경 +A −B 라인 / 범위: <한 줄>

### Keep
- ...

### Problem
- ...

### Try
- ...

### 하네스 개선 제안
| 대상 | 변경 | 이유 | 하네스 영역 |
|------|------|------|-----------|
| ... | ... | ... | ... |

### 반영
- 회고 저장: .claude/retro/<file>.md
- [ ] 개선 항목 사용자 승인 대기
```
