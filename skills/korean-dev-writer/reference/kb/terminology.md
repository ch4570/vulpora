---
title: 한국 개발 문서의 기술 용어
source: User-provided Korean developer writing requirements
last_reviewed: 2026-08-19
skills: [korean-dev-writer]
---

# 기술 용어 선택

영어를 없애거나 늘리는 것이 목표가 아니다. 프로젝트의 기존 표기와 한국 개발자가 실제로 읽는 표현을
우선한다.

## 원어를 유지하기 쉬운 용어

`API`, `endpoint`, `payload`, `cache`, `worker`, `thread`, `process`, `retry`, `fallback`, `timeout`,
`race condition`, `deadlock`, `transaction`, `middleware`, `callback`, `dependency`, `runtime`

`endpoint`를 기계적으로 `종단점`으로 바꾸지 않는다. 반대로 `사용자`, `요청`, `응답`, `배포`, `장애`,
`복구`처럼 한국어가 자연스러운 말까지 영어로 바꾸지 않는다.

## 선택 순서

1. 코드, API 계약과 저장소 문서에서 이미 쓰는 표기를 찾는다.
2. 같은 문서 안에서는 한 표기를 유지한다.
3. 독자가 모를 수 있는 약어나 전문어는 첫 등장에만 짧게 설명한다.
4. 원어가 코드 식별자라면 본문에서 임의로 번역해 다른 개념처럼 만들지 않는다.
5. 복수형, 대소문자와 띄어쓰기도 프로젝트 관례를 따른다.

## 자주 생기는 문제

- `재시도(retry)`와 `retry`를 문단마다 번갈아 쓴다.
- `동시성 문제`와 `race condition`을 같은 뜻으로 취급한다.
- `transaction`을 모든 문맥에서 `거래`로 번역한다.
- `dependency`가 package dependency인지 업무 선후 관계인지 구분하지 않는다.
- 기술적으로 다른 `process`, `thread`, coroutine을 모두 `작업`으로 뭉뚱그린다.

용어가 정확하지만 독자에게 낯설면 없애지 말고 짧게 정의한다. 정확성을 희생한 쉬운 말은 좋은 한국어가
아니다.
