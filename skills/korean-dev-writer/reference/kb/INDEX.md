---
title: Korean Dev Writer knowledge router
source: User-provided Korean developer writing requirements
last_reviewed: 2026-08-19
skills: [korean-dev-writer]
---

# KB 라우터

| 작업 신호 | 읽을 문서 | 판단할 내용 |
|---|---|---|
| 직역투, AI식 문장, 불필요한 명사화 | [anti-translationese](anti-translationese.md) | 패턴별 교정과 허용 예외 |
| 코드 주석, 함수·클래스 주석 | [code-comments](code-comments.md) | 주석의 존재 가치와 길이 |
| 코드 동작, 구현, 장애, 아키텍처 설명 | [technical-explanations](technical-explanations.md) | 결론 우선 설명 순서와 세부 수준 |
| README, API 문서, 운영·트러블슈팅 문서, PR | [readme-and-docs](readme-and-docs.md) | 문서 구조, 정보 밀도와 어미 |
| 코드 리뷰 코멘트 | [code-review-comments](code-review-comments.md) | 문제·영향·수정 방향, 비공격적 표현 |
| 영문/한글 기술 용어 선택 | [terminology](terminology.md) | 현장 용어, 프로젝트 일관성, 첫 등장 설명 |
| 보안, 데이터, 동시성, migration, 호환성 | [boundary-and-negative-cases](boundary-and-negative-cases.md) | 줄이면 안 되는 설명과 잘못된 극단 |
| 문체 calibration, 최종 예시 대조 | [before-and-after](before-and-after.md) | 작업 종류별 Before/After |

현재 작업에 필요한 행만 읽는다. 애매하면 먼저 `boundary-and-negative-cases.md`로 안전 경계를 확인하고,
작업 종류에 맞는 문서 하나를 추가로 읽는다.
