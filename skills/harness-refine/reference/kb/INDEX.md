# 하네스 재귀 정제 Knowledge Base — 색인 (INDEX)

> 하네스를 실행 대비(Propose–Probe–Compose)로 다듬을 때 근거로 삼는 KB.
> 각 파일 frontmatter에 `source`·`last_fetched`·`skills`가 있다.
> **사용법**: 지금 단계에 맞는 KB만 읽고, 그 "리뷰 훅"으로 점검한다. 전체를 한 번에 읽지 않는다.

## 작업 유형 → 읽을 KB

### 실행 계획·예산 잡기, 병렬/순차 고르기 (preflight, 1~4단계)
| KB | 다룸 |
|----|------|
| [propose-probe-compose](propose-probe-compose.md) | 기준 실행 → 제안 → 탐침 → 합성 루프, 병렬·순차 재귀, 예산 |

### 후보 제안·합성 검토 (2·4단계)
| KB | 다룸 |
|----|------|
| [edit-surface](edit-surface.md) | INV·DOM 분리, 컴포넌트 선택 비용, 생략=상속 편집 계약 |

### 선택 (5단계)
| KB | 다룸 |
|----|------|
| [answer-free-selection](answer-free-selection.md) | 정답 없는 익명 선택, 채점 정보 유출 차단, KEEP_BASE |

### 회고·라이브러리·승격 (6·7단계)
| KB | 다룸 |
|----|------|
| [experience-library](experience-library.md) | 수정별 판정, 이전 가능한 교훈, 도메인 라이브러리, 격리와 승격 |

## 각 KB 한 줄 요약
| KB | 한 줄 요약 |
|----|-----------|
| [propose-probe-compose](propose-probe-compose.md) | 같은 과제에서 원본과 후보를 나란히 실행해 대비로 하네스를 고친다. |
| [edit-surface](edit-surface.md) | 절차와 지식을 나눠 제안하고 가장 싼 컴포넌트에 담는다. |
| [answer-free-selection](answer-free-selection.md) | 채점 기준 없이 익명 산출물만 보고 고르며 원본 유지도 정답이다. |
| [experience-library](experience-library.md) | 채택과 효과를 구분해 기록하고 교훈은 격리 상태로 쌓는다. |

## 원칙 문서와의 관계
- 상위 판단 기준은 `../principles.md`. KB는 그 원칙의 출처 근거와 세부 규칙이다.
- 충돌하면 KB가 우선한다.

## 갱신
- 각 파일 `last_fetched` 기준. 출처 논문·저장소의 개정판이 나오면 다시 확인한다.
- TODO(차기 KB 후보): 다중 과제 스윕에서 라이브러리 오염 측정, 실행기 격리 증거 수집.
