# Agent-Evaluator Knowledge Base — 색인 (INDEX)

> 에이전트와 외부 프롬프트 패키지를 평가할 때 쓰는 인용 가능한 KB. 각 파일은 frontmatter에 `source`·`last_fetched`·`consumers`를 담고 `## 리뷰 훅` 체크리스트를 가진다.
> **사용법**: 평가 차원에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 지적 시 `source` 를 근거로 인용한다.

## 평가 차원 → 읽을 KB

| 차원 | KB | 다룸 |
|---|---|---|
| 전체 실행 절차 | [eval-workflow](eval-workflow.md) | 구조·프론트매터·범용성·등록 여부를 실제 명령으로 검증 |
| D1 규약 정합 / D3 범용성 | [standard-conformance](standard-conformance.md) | STANDARD 디렉터리·프론트매터·`리뷰 훅`·금지 토큰·`model` 하드코딩·tools 적정성 체크 |
| D5 보안 | [skillspector-usage](skillspector-usage.md) | 설치·실행·출력 해석·**오탐 트리아지 패턴**(금지문맥/정식API/.claude 읽기) |
| D5 보안 실측 | [skillspector-triage](skillspector-triage.md) | SkillSpector 명령과 finding별 의도 트리아지 절차 |
| Skill tier·live lift | [skillevaluator-usage](skillevaluator-usage.md) | SkillEvaluator Tier 1/2/3 선택, prerequisite, incomplete 판정 |
| 점수·심각도·리포트 | [evaluation-rubric](evaluation-rubric.md) | 5차원 0–10 루브릭, 심각도 표·캘리브레이션, 스코어카드 포맷 |
| 리포트 포맷 | [scorecard-format](scorecard-format.md) | 심각도·결론 규칙과 재사용 가능한 스코어카드 템플릿 |
| D2 기술 / D4 주장정합 | [adversarial-method](adversarial-method.md) | 주장 반증 절차, 예시 렌더/실행, 과대주장·결정성 점검, 병렬 회의주의 |

## 원칙 문서와의 관계
- 상위 판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **체크리스트·도구 사용법·세부 규칙**.
- 충돌 시 KB(STANDARD/공식 문서)가 우선, principles는 통찰을 보탠다.

## 갱신
- SkillEvaluator/SkillSpector 버전 업 시 pinned release, 명령, report schema, scanner 계약을 재확인한다.
- TODO(차기): 런타임별(OpenCode/Codex) 규약 차이, MCP 서버 평가 KB.
