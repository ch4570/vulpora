# SkillSpector 보안 스캔 리포트 — vulpora 자산

> **Historical snapshot:** 이 리포트는 2026-06-24 당시 29개 skill, 6개 agent 정의,
> 5개 bundle을 대상으로 한 정적 스캔 기록이다. 2026-07-15 현재 inventory(34개 skill,
> 16개 agent, 15개 bundle)와 MCP·installer·runtime data flow 전체의 안전 판정으로 사용하지
> 않는다. 현재 범위와 수동 보안 감사는
> [Agent Lifecycle 성숙도와 Feedback Loop](../agent-lifecycle-assessment-and-feedback-loop.md)를 본다.

- **도구**: [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) v2.3.5
- **모드**: 정적 분석만 (`--no-llm`) — AST·YARA·OSV.dev. LLM 의미분석 미실행(키 불필요).
- **일자**: 2026-06-24
- **대상**: `skills/` 29종(`--recursive`) + `agents/` 정의·번들
- **기록**: [`skillspector-skills.md`](skillspector-skills.md). 원본 scanner JSON은 비공개 개발 이력에 보존하며 공개 저장소와 npm/source release archive에는 포함하지 않습니다.

> ⚠️ **정적 스캔의 한계(중요)**: `--no-llm` 은 문자열/패턴 매칭이라 **금지·체크리스트·정식 API 문맥을 구분하지 못한다.** 아래 HIGH 다수가 그 오탐이다. 점수를 액면 그대로 받지 말고 **근거 라인을 의도 기준으로 트리아지**해야 한다. 이 트리아지가 곧 `agent-evaluator` 의 보안 차원 절차다.

## 요약

| 대상 | 결과 |
|---|---|
| **신규 `schema-doc-extract` 스킬** | **0/100 LOW · findings 0 — 클린 ✅** |
| **신규 `schema-doc/` 에이전트 번들** | **0/100 LOW · findings 0 — 클린 ✅** |
| 스킬 29종 중 24종 | 0/100 LOW (클린) |
| 에이전트 번들 5종(dba·code-review·refactor·opensearch·schema-doc) | 모두 0/100 LOW |
| 에이전트 정의 `.md` 6종 | 각 1건 HIGH "Agent Snooping" — **공통 관행, 저위험**(아래 A) |
| `git-flow` 스킬 | 54/100 HIGH, 12건 — **전량 오탐**(아래 B) |
| `skill-updater` 스킬 | 30/100 MED, 4건 — 메타스킬 특성상 예상됨(아래 C) |
| `knowledge-audit`·`e2e-scenario-author`·`response` | 5~21점 저위험 단건 |

## A. 에이전트 정의 — HIGH "Agent Snooping :: Agent Config Directory Access"

- **트리거**: `grep -ril "<keyword>" .claude/knowledge/` (프로젝트 고유 지식 로딩 관행). `postgres-dba`·`opensearch-expert`·`kotlin-spring-reviewer`·`code-refactor-agent`·**`schema-cartographer`** 전부 동일.
- **판정**: **저위험 / 대체로 오탐.** 자격증명(`settings.json`·`.claude.json`)이 아니라 **문서화된 지식 하위 디렉터리(`.claude/knowledge/`)** 로 스코프된 읽기다. 다만 SkillSpector의 지적에도 일리는 있다 — `.claude/` 광역 grep은 원칙적으로 민감 파일을 지나칠 수 있다.
- **권고(선택)**: 경로를 `.claude/knowledge/` 로 **명시 고정**(이미 그러함)했음을 유지하고, 자격증명 디렉터리는 절대 읽지 않는다는 문구를 SOUL/금기에 1줄 추가하면 트리아지가 깔끔해진다. 레포 전역 관행이므로 일괄 결정 사안.

## B. `git-flow` 54 HIGH — 전량 오탐 (확인됨)

근거 라인을 직접 확인한 결과:

| SkillSpector 분류 | 실제 라인 | 판정 |
|---|---|---|
| HIGH Tool Misuse `--no-verify`/`--force`/`--amend` | `- [ ] No `--amend`, `--no-verify`, `--force*` used without explicit user request` (금지 체크리스트) | **오탐** — 사용이 아니라 **금지** 문장 |
| HIGH Tool Misuse `--allow-empty` | `Do not invent recovery via --allow-empty unless user explicitly approves` | **오탐** — 금지 문맥 |
| MED Data Exfiltration `curl -X POST` | GitLab MR 생성용 **정식 REST API** 호출(`PRIVATE-TOKEN` 헤더) | **오탐** — 문서화된 API |
| HIGH YARA Match | 위 `--force*` 문자열 | **오탐** |

→ git-workflow 스킬이 위험 플래그를 **명시적으로 금지**하는 문장을, 정적 매처가 "사용"으로 오인. LLM 모드면 해소될 전형적 케이스.

## C. `skill-updater` 30 MED — 메타스킬 특성

- "Agent Snooping" / "Prompt Injection" 4건. 이 스킬의 **본래 기능이 다른 스킬을 읽고 갱신**하는 것이라 지시문 읽기/조작 서술이 불가피.
- **판정**: 기능상 예상되는 신호. 단, 자기수정 스킬은 본질적 위험이 있으므로 **승격/실행 게이트와 사람 승인**을 권고(메모리 정책의 self-modification 정책과 연계).

## 결론

- **이번 세션에서 만든 자산(`schema-cartographer` 번들 + `schema-doc-extract`)은 SkillSpector 정적 기준 클린**(정의 .md의 공통 `.claude/knowledge/` 관행 1건 제외, 저위험).
- 당시 **스캔한 범위에서는** 실제 악성 패턴을 확인하지 못했다. HIGH의 대부분은
  **정적 스캔이 금지/정식-API 문맥을 못 읽는 오탐**이었다. 이 판정을 현재 레포 전체나
  runtime security compliance로 확대하지 않는다.
- 교훈: **SkillSpector 점수는 단독 판정 근거가 아니라 트리아지 입력**이다. `agent-evaluator` 는 이 도구를 호출하되 각 finding을 근거 라인 기준으로 의도 판정한다.
