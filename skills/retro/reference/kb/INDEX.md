# 회고 / 포스트모템 Knowledge Base — 색인 (INDEX)

> SRE·포스트모템·애자일 회고의 **공식/권위 레퍼런스**를 distill한 인용 가능한 KB. 각 파일은
> frontmatter에 `source`(원문 URL)·`last_fetched`·`skills`를 담는다.
> **사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 지적할 때 KB의
> `source` URL을 근거로 인용한다.

## 작업 유형 → 읽을 KB

### 회고 진행 (형식 선택·구조화)
| KB | 다룸 |
|----|------|
| [retro-frameworks](retro-frameworks.md) | Keep/Problem/Try, Start/Stop/Continue, 4Ls, Mad/Sad/Glad; 형식 선택, 회고 5단계 |
| [timeline-evidence](timeline-evidence.md) | git log/diff·로그로 타임라인 재구성, 사실 vs 해석 분리 |

### 사고 분석 (장애·실패 깊게 파기)
| KB | 다룸 |
|----|------|
| [blameless-postmortem](blameless-postmortem.md) | 비난 없음 문화, 심리적 안전, 포스트모템 문서 구성, 작성 트리거 |
| [root-cause-5whys](root-cause-5whys.md) | 5 Whys 절차·함정, 기여 원인 vs 근본 원인, 단일원인 과단순화 회피 |
| [timeline-evidence](timeline-evidence.md) | 증거 기반 타임라인, 추측을 사실처럼 쓰지 않기 |

### 개선 반영 (발견 → 변화)
| KB | 다룸 |
|----|------|
| [action-item-tracking](action-item-tracking.md) | SMART 액션, 소유자·기한·검증, "절대 안 일어나는 액션" 방지, 예방 vs 완화 |

## KB 한 줄 요약
| KB | 한 줄 |
|----|------|
| retro-frameworks | 회고 형식들과 목적별 선택, 좋은 회고의 5단계 흐름 |
| blameless-postmortem | 사람이 아닌 시스템을 보는 포스트모템 문화와 문서·트리거 |
| root-cause-5whys | "왜"를 반복하는 근본원인 분석과 그 함정들 |
| action-item-tracking | 발견을 추적·소유·기한 있는 실행으로 바꾸는 법 |
| timeline-evidence | git/로그 증거로 사실 타임라인을 세우고 해석과 분리 |

## 원칙 문서와의 관계
- 상위 원칙·판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**하며, principles는 책·표준 기반 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. SRE Book/Workbook·Atlassian playbook·Scrum Guide 개정 시
  `source` URL을 다시 fetch해 갱신.
- TODO(차기): incident severity 분류, on-call 운영, error budget/SLO, Fishbone·Fault Tree
  등 다중 원인 분석 기법 KB 추가 여지.
