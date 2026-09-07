---
name: knowledge-audit
description: Audit the autonomous knowledge lane (.claude/knowledge/auto/) — verify each machine-written candidate against current code, then promote true/reusable ones to the curated knowledge base or discard stale/duplicate/wrong ones. This is the curation half of the autonomous learning loop — it replaces the human approval gate that the Stop auto-learn hook bypasses. Use periodically (or when the auto lane has accumulated candidates) to keep the KB from rotting.
---

# /knowledge-audit — curate the autonomous knowledge lane

The `Stop` hook (`.claude/hooks/auto-learn.sh`) writes candidate knowledge to
`.claude/knowledge/auto/` **without human approval**. That speed has a cost: machine-written
inferences can be wrong, stale, or duplicated. This skill is the **quality gate that runs after the
fact** — it verifies each candidate against the live codebase and either promotes it to the curated
KB or removes it. Without periodic auditing the auto lane rots and poisons every agent that reads it.

> **Authority**: [`AGENTS.md`](../../../AGENTS.md) is binding. **This audit is normally run
> autonomously** by the `Stop` hook (`.claude/hooks/auto-learn.sh` → `auto-audit-prompt.md`)
> when the auto lane crosses `AUTO_AUDIT_THRESHOLD`. That unattended pass **defaults to observe-only**
> (prune + mark `PROMOTE-CANDIDATE`; no curated writes unless its operating mode enables promotion).
> This skill is the **on-demand manual variant that actively promotes**: it prunes **and** promotes
> without human approval — the approval gate is replaced
> by a **code-verification gate**: only candidates whose referenced files/symbols are proven to exist
> (via grep/Glob) may be promoted to the curated KB. Edits to `AGENTS.md`/skills/agents remain
> out of scope. Safety = code proof + git history + easy rollback (`rm auto/*.md` / `git revert`),
> not human sign-off.

> **Reference loading (progressive disclosure):**
> Read [principles](reference/principles.md) first, then use the [KB index](reference/kb/INDEX.md).
> Load only topic files matching the current task; MUST NOT recursively load the entire KB.

## Preprocessing (MUST)

- Read `.claude/knowledge/auto/README.md` (lane contract + provenance format).
- Read `.claude/knowledge/README.md` (curated index — avoid promoting duplicates).

## Procedure

### 1. Inventory the auto lane

```bash
ls .claude/knowledge/auto/*.md 2>/dev/null | grep -v README
```

If empty → report "auto 레인 비어있음" and stop.

### 2. Verify each candidate against current code

For each `auto/*.md`, judge it on three axes:

| 판정 | 조건 | 조치 |
|---|---|---|
| **승급(promote)** | 참이고, 코드와 일치하고(파일/심볼 **실증**), 정본에 없고, 재사용 가치 있음 | `.claude/knowledge/<topic>.md`에 직접 정본화(`> 출처: auto 레인 자동 승급(코드 검증) · 기록: 날짜`) + README 인덱스 추가 + `auto/` 원본 삭제 (승인 불필요, 실증된 것만) |
| **폐기(discard)** | 코드와 어긋남(참조 파일/심볼 부재) · 정본/AGENTS.md/스킬과 중복 · 사소함 · 틀림 | `auto/`에서 삭제 (자율, 승인 불필요) |
| **보류(keep)** | 아직 검증 불가(맥락 부족) | 그대로 둠, 다음 audit에서 재판정 |

검증은 **실증 우선**: 후보가 언급하는 파일/심볼/플래그를 `grep`/`Glob`으로 현존 확인하고,
`evidence` 헤더가 실제 근거인지 본다. 확신 없으면 폐기하지 말고 보류한다.

### 3. Apply

- **폐기**: `auto/*.md` 삭제 + `auto/README.md` 인덱스에서 해당 줄 제거 (자율).
- **승급(자율, 실증 게이트)**: 코드로 현존을 **실증한** 후보만 `.claude/knowledge/<topic>.md`에
  직접 정본화(`> 출처: auto 레인 자동 승급(코드 검증) · 기록: 날짜`) + README 인덱스 추가 + 원본 삭제.
  "맞을 것 같다"는 승급 금지 — grep으로 확인한 것만. 한 패스 승급 ≤ 3건.
- `AGENTS.md`·스킬·에이전트는 건드리지 않는다(쓰기는 `.claude/knowledge/` 안으로만).

## Output format

```markdown
## auto 레인 감사 (YYYY-MM-DD)

| 후보 | 판정 | 근거(코드 대조) |
|------|------|----------------|
| auto/<topic>.md | 승급/폐기/보류 | <파일/심볼 현존 여부 등> |

### 반영
- 폐기 N건 (auto 레인에서 삭제 완료)
- 승급 M건 (코드 실증 후 정본 KB로 승급 + auto 레인에서 삭제 완료)
- 보류 K건
```
