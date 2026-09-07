# agent-eval Knowledge Base — 색인 (INDEX)

> 평가 워크플로 실행에 쓰는 KB. 각 파일은 frontmatter(`title`/`source`/`last_fetched`/`skills`) + `## 리뷰 훅`.

## 작업 단계 → 읽을 KB
| 단계 | KB | 다룸 |
|---|---|---|
| D1/D3 정합 실측 | [eval-workflow](eval-workflow.md) | ls/grep 명령으로 구조·프론트매터·금지토큰·tools 검사 |
| D5 보안 | [skillspector-triage](skillspector-triage.md) | skillspector 실행 + 오탐/실탐 트리아지 표 |
| tier 선택·실행 | [skillevaluator-usage](skillevaluator-usage.md) | SkillEvaluator Tier 1/2/3, 호환 정책, incomplete 증거 계약 |
| 출력 | [scorecard-format](scorecard-format.md) | 심각도 표·5차원 점수·스코어카드 템플릿 |

## 관계
- 판단 기준은 `../principles.md`. KB는 명령·체크리스트·템플릿.
- 더 깊은 판단 헌법은 에이전트 번들 `agents/agent-eval/reference/`(principles + kb 4종)에 있다.

## 갱신
- SkillEvaluator/SkillSpector 버전 변경 시 pinned release, 명령, report schema, scanner 계약을 재확인한다.
- TODO: MCP 평가 절차.
