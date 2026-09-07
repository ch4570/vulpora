---
name: harness-propose
description: Research recent harness-engineering trends, judge them against this repository's current harness, and produce a self-contained HTML improvement proposal under harness/proposals/{date}/. After user approval, reflect accepted items into the living harness/index.html "다음 단계" section (the dated proposal dir is the record; no separate backlog file). Never modifies the harness before approval. Use to level up the harness or run a periodic harness review.
---

# /harness-propose — trend-driven harness improvement proposal

Survey the latest harness-engineering trends, judge fit against this repo, and visualize an improvement
proposal as HTML. This is the **Guide generator** of the trust loop — it turns external signal + accumulated
`/retro`·`/learn` findings into a concrete, reviewable backlog. It **proposes only**; it MUST pass a user
approval gate before changing anything.

> **Authority**: [`AGENTS.md`](../../../AGENTS.md) is binding. **MUST NOT** edit any `.claude/**`, `AGENTS.md`,
> `CLAUDE.md`, or living report before explicit user approval.

> **Reference loading (progressive disclosure):**
> Read [principles](reference/principles.md) first, then use the [KB index](reference/kb/INDEX.md).
> Load only topic files matching the current task; MUST NOT recursively load the entire KB.

## Project adaptation (read first)

This repository may have **no** `.ignore/` workspace, `.claude/todo/`, `/harness` executor, or separate backlog file. In a lighter harness like this:
- The proposal HTML is written to **`harness/proposals/<YYYYMMDD-HHmm>/index.html`** (git-ignored — derived view). This dated proposal **is** the detailed record of what was collected/judged.
- Accepted items are reflected directly into the living **`harness/index.html`** "다음 단계" section (no separate backlog file — it was found redundant). There is no auto-executor — implementation is a normal, separately-approved task (often `skill-updater` for skills, plain edits for agents/docs).

## Preprocessing (MUST)

Load current state so already-present capabilities are not re-proposed:
- `CLAUDE.md` — current harness directives + routing.
- `.claude/knowledge/README.md` — knowledge index, and `.claude/retro/` recent entries for accumulated friction.
- Snapshot (parallel reads/globs): `.claude/skills/` and `.claude/agents/` names + frontmatter; `harness/index.html` (its open "다음 단계" items); previous `harness/proposals/*/` (incl. `watch.md`) to avoid re-proposing.

## Procedure

### 1. State snapshot
Summarize what the harness already has (skills, agents, knowledge, the living report's open "다음 단계"). This is the dedup baseline.

### 2. Trend research
Gather **newly published** material on harness engineering / AI coding agents / context engineering / spec-driven
dev / multi-agent orchestration. MAY fan out with the `Agent` tool (one source family per agent — e.g. vendor
engineering blogs, arXiv cs.SE/cs.AI, practitioner blogs); each returns `{title, url, date, 1-line summary, 3–5
key claims}`. Mark anything overlapping existing knowledge/skills as a duplicate.

### 3. Judge (main session, not delegated)
Score each insight on four axes — judging fit to this project's stack and architecture is not delegable:

| Axis | Criterion |
|---|---|
| **Fit** | Suitability to the project's stack and architecture (e.g. its primary language/framework, serving layer, module layout) (high/med/low) |
| **Novelty** | Overlap with current harness (new / partial / full-dup) |
| **ROI** | Quality gain vs implementation cost (high/med/low) |
| **Risk** | Model-independence harm, conflict with existing conventions, security (high/med/low) |

Buckets: **Adopt** (Fit≥med, Novelty≠full, ROI≥med, Risk≤med) · **Watch** · **Reject**.

### 4. Apply-spec for each adopted item
```
제목
└─ 대상: .claude/xxx (또는 신규) / docs/...
└─ 변경 유형: [지식 추가 | 스킬 추가·수정 | 에이전트 추가·수정 | 규칙 추가 | 문서]
└─ 변경 요지: (≤3줄)
└─ 검증: (예: /code-review, 특정 모듈 :test, 수동 확인)
└─ 롤백: (단일 커밋 revert 가능 여부)
```

### 5. HTML report
Write `harness/proposals/<YYYYMMDD-HHmm>/index.html` (`date +%Y%m%d-%H%M`). Requirements:
- Single self-contained `.html`. Inline `<style>`. **No external CDN/JS/web fonts.** Korean body.
- Match the visual language of `harness/index.html` (same dark, information-dense style).
- Sections: header (생성 시각 / 기간 / 수집 수 / 채택·보류·기각 카운트) → raw collection (per-source table w/ links) → 4-axis eval table (Risk=high → red badge) → adopted-item cards (apply-spec format) → preview of the "다음 단계" entries that will be added to `harness/index.html` → watch/reject + reasons.
- Each item gets a **visual-only** approval checkbox (no scripted behavior — decisions come via chat).
- Use the **Write** tool for the file.

### 6. Open + report
```bash
open harness/proposals/<YYYYMMDD-HHmm>/index.html
```
Then tell the user the path is open and ask how to proceed ("모두 승인 / 1,3만 승인 / 전부 보류 / 2번 수정: …").

### 7. Approval gate (STOP)
**MUST NOT** modify any harness file before the user responds. Record rejected items as `watch.md` in the same
proposal dir (dedup for next run). Proceed only with adopted+approved items.

### 8. Register accepted items
- Add each approved item as a card in the "다음 단계" section of the living `harness/index.html`, linking back to the dated proposal dir (`harness/proposals/<ts>/`) as its record.
- There is no separate backlog file and no auto-executor: tell the user each item is a separate, normally-approved task (skills via `skill-updater`).

## Principles
- **Main-session-only**: step 3 (judge), 4 (apply-spec), 7 (approval gate).
- **Delegatable**: step 2 (research), step 5 HTML rendering (only with an explicit template).
- **MUST NOT**: edit `.claude/**` or living report before approval · external CDN/JS in HTML · hardcode a model
  version in any proposal (model independence) · adopt a full-duplicate of existing knowledge.
