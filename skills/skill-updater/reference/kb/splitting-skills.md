---
title: 스킬 분리 vs 통합 판단
source: https://www.anthropic.com/engineering/agent-skills
last_fetched: 2026-06-24
skills: [skill-updater]
---

# KB: 스킬 분리(split) vs 통합(merge)

근거: Anthropic "Agent Skills" 엔지니어링 글(https://www.anthropic.com/engineering/agent-skills,
https://docs.anthropic.com/en/docs/claude-code/skills) + Diátaxis 문서 유형 분리(https://diataxis.fr/).

## 핵심 원칙: 단일 책임
- 한 스킬 = **하나의 명확한 책임**. 한 줄로 목적을 말할 수 없으면 너무 크다.
- "그리고/또는(and/or)"이 description에 여러 번 나오면 분리 신호다.

## 분리(SPLIT) 신호
| 신호 | 설명 |
|------|------|
| description 길이/접속사 과다 | 서로 다른 트리거가 한 스킬에 섞여 라우팅이 흐려짐. |
| 본문이 비대 | 단계가 두 개의 독립 작업으로 갈라짐(예: "생성"과 "검증"). |
| 트리거 충돌 | 한 스킬 안의 서로 다른 절차가 다른 사용자 의도에 대응. |
| 문서 유형 혼재(Diátaxis) | 튜토리얼+레퍼런스+하우투가 한 파일에 섞임. |

## 통합(MERGE) 신호
| 신호 | 설명 |
|------|------|
| description 중첩 | 두 스킬 설명이 거의 같음 → 모델이 **잘못 라우팅**. 합치거나 경계를 날카롭게. |
| 한쪽이 다른 쪽 없이는 무의미 | 항상 함께 호출되는 강결합 → 하나로. |
| 미세 스킬 난립 | 책임이 너무 잘게 쪼개져 탐색 비용↑, 응집도↓. |

## description-overlap이 라우팅을 망치는 이유
- 모델은 description으로 스킬을 고른다. 두 description이 겹치면 의도와 다른 스킬이 선택될 확률↑.
- 해결: (a) 트리거를 상호 배타적으로 다듬거나, (b) 하나로 통합.

## 규모/범위 휴리스틱
- 응집도(cohesion) 높고 결합도(coupling) 낮게. 한 스킬이 한 가지를 잘하게.
- 절차가 독립적으로 호출될 수 있으면(서로 다른 입력/트리거) 분리 후보.
- 항상 같은 입력으로 연쇄 실행되면 통합 후보.

## 리뷰 훅
- [ ] 이 스킬의 책임을 한 문장으로 말할 수 있는가.
- [ ] description에 "and/or"로 묶인 이질적 작업이 있는가(있으면 분리 검토).
- [ ] 다른 스킬과 description이 겹쳐 오라우팅 위험이 있는가(있으면 통합/경계 정리).
- [ ] 두 절차가 항상 함께/독립으로 호출되는가(강결합→통합, 독립→분리).
- [ ] 문서 유형(튜토리얼/레퍼런스/하우투)이 한 파일에 혼재하지 않는가.
