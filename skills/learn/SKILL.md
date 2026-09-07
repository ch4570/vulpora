---
name: learn
description: Extract reusable, non-obvious insights from the current conversation/work and persist them as team-shared knowledge under .claude/knowledge/ (rule changes are proposed against AGENTS.md or the relevant skill instead). Applies changes only after user approval. Use when a durable lesson, gotcha, domain flow, or decision rationale emerged that future sessions should not have to rediscover.
---

# /learn — persist reusable insight

Turn one-off discoveries into **durable knowledge** so the next session — or another developer — does not
re-derive them. This is a **Guide** half of the harness trust loop (it informs future work). Pairs with
[`retro`](../retro/SKILL.md) (which surfaces what is worth learning) and [`harness-propose`](../harness-propose/SKILL.md).

> **Authority**: [`AGENTS.md`](../../../AGENTS.md) is binding. This skill **MUST NOT** modify any file without
> explicit user approval. Knowledge augments context; it does not override rules.

> **Reference loading (progressive disclosure):**
> Read [principles](reference/principles.md) first, then use the [KB index](reference/kb/INDEX.md).
> Load only topic files matching the current task; MUST NOT recursively load the entire KB.

## Preprocessing (MUST)

- Read `CLAUDE.md` to understand the current rule/skill structure.
- Read `.claude/knowledge/README.md` to learn the existing knowledge layout (and avoid duplicates).

## Procedure

### 1. Mine the conversation

Find **non-obvious** insights from the current work:
- a newly discovered coding/test pattern or rule;
- a bug's root cause and its fix;
- a project-specific gotcha (e.g. an intentional decision that looks like a bug);
- the *why* behind an architecture/decision.

Skip the obvious — anything already in `AGENTS.md`, a skill, git history, or `.claude/knowledge/`.

### 2. Check existing docs

Confirm whether a home already exists: `AGENTS.md`, the relevant skill `SKILL.md`, or a `.claude/knowledge/*.md`.

### 3. Classify the target

| Insight kind | Target | Note |
|---|---|---|
| Domain flow / decision rationale / gotcha | `.claude/knowledge/<topic>.md` | canonical team store |
| Language/framework coding rule | propose edit to the language/framework review skill (e.g. a `<lang>-<framework>-review` skill) `SKILL.md` (or `AGENTS.md`) | rule, not knowledge |
| Test pattern/rule | propose edit to the test-authoring skill `SKILL.md` | rule, not knowledge |
| E2E contract change | route via the E2E scenario skill | catalog is generated |

> If the repo has **no `.claude/docs/`**, durable team knowledge lives in `.claude/knowledge/`; rule-shaped
> insights belong in `AGENTS.md` or the owning skill (changing a skill follows `skill-updater`).
> Personal cross-session reminders MAY also go to the auto-memory, but `.claude/knowledge/` is the team SSOT.

### 4. User approval (MUST)

Show the extracted insight(s) and the proposed target(s). Apply **only** what the user approves.
**MUST NOT** edit any file before approval.

### 5. Apply

- Knowledge: create/update `.claude/knowledge/<topic>.md` with the header
  `# <제목>` / `> 출처: <근거> · 기록: YYYY-MM-DD`, then add a one-line link to `.claude/knowledge/README.md`.
- Rule/skill target: make the edit (a skill edit MUST follow `skill-updater` — sync the KO file in the same change).
- Never duplicate existing content — update in place instead.

## Output format

```markdown
## 학습 인사이트

1. <insight 한 줄> → 대상: .claude/knowledge/<topic>.md (신규/갱신)
2. <insight 한 줄> → 대상: kotlin-spring-review SKILL.md (규칙 추가 제안)

[ ] 사용자 승인 대기
```
