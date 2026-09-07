---
title: 스코어카드 포맷·심각도
source: Vulpora 내부 평가 규약 (외부 표준 아님)
last_fetched: 2026-06-24
skills: [agent-eval, agent-evaluator]
---

# 스코어카드 — 심각도·5차원 점수·템플릿

## 심각도
| 심각도 | 의미 | 조치 |
|---|---|---|
| CRITICAL | 보안 침해·데이터 손실·완전 미동작 | 차단 |
| HIGH | 기술 오류·과대주장發 오작동·재현된 보안 약점 | 머지 전 수정 |
| MEDIUM | 규약 위반·결정성 결함·절차 누락·미확인 가정 | 가능시 수정 |
| LOW | 스타일·문구·약한 출처·트리아지된 오탐 | 선택 |

## 5차원 0–10
D1 규약 · D2 기술 · D3 범용성 · D4 주장정합/결정성 · D5 보안. 각 점수에 **근거 한 줄** 필수.

## 결론 규칙
- 차단: CRITICAL ≥1 또는 D2/D5 ≤2
- 조건부 승인: HIGH만
- 승인: CRITICAL/HIGH 없음

## 템플릿
```
## 평가 대상 — <이름·경로>
기준: STANDARD.md · SkillEvaluator vX/tier/status · SkillSpector vX · 검증범위(정적/LLM/live, 코드 실행 여부)

## 종합
- D1 n/10(근거) · D2 n/10 · D3 n/10 · D4 n/10 · D5 n/10
- 결론: 승인 / 조건부 / 차단 — 한 줄 사유

## 결함 (심각도순)
### [SEV] 제목
- 근거: 파일:라인 인용 / finding id / 재현 명령
- 영향: ...
- 최소 수정안: ...

## SkillSpector 트리아지
| finding | 분류 | 근거 라인 | 실탐/오탐 | 사유 |

## SkillEvaluator 증거
- mode/exit/overall_status/report: ...
- scanner/provider/agent/sandbox completeness: ...

## 잘된 점
- ...

## 적용 우선순위
1. ... 2. ...
```

## 리뷰 훅
- [ ] 5차원 점수 각각에 근거가 붙었는가?
- [ ] 결함마다 근거·영향·최소수정안 3종?
- [ ] 결론이 규칙(차단/조건부/승인)과 일치?
- [ ] 검증 범위 고지 포함?
- [ ] SkillEvaluator를 실행했다면 tier·exit·overall status·prerequisite completeness가 분리 기록됐는가?
