# Knowledge-Audit Knowledge Base — 색인 (INDEX)

> 문서·지식 관리의 정립된 **표준·정책**(Verifiability, PROV-O, Dublin Core, Write the Docs,
> Google docguide, Diátaxis)을 distill한 인용 가능한 KB. 각 파일 frontmatter에 `source`(원문 URL)·
> `last_fetched`·`skills`를 담는다.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 지적할 때
> KB의 `source` URL을 근거로 인용한다. (예: "Verifiability 기준 — 검증 가능한 것만 승급 …")

## 작업 유형 → 읽을 KB

### 후보 판정 / 승급 (verify & promote)
| KB | 다룸 |
|----|------|
| [verification-promotion](verification-promotion.md) | 근거 대조, 삼분 결정(승급/폐기/보류), 증거 요건, 패스당 한도 |
| [provenance-trust-tiers](provenance-trust-tiers.md) | 신뢰 등급(정본/auto/미검증), 검증 게이트, 출처 기록 |
| [deduplication](deduplication.md) | 중복 탐지, 병합/링크, 정본 위치 선택, 모순 처리 |

### 노후 점검 / 재검증 (freshness)
| KB | 다룸 |
|----|------|
| [staleness-freshness](staleness-freshness.md) | last_fetched vs last_verified, 재검증 주기, 노후 탐지, 만료 정책 |
| [provenance-trust-tiers](provenance-trust-tiers.md) | 등급 전이(정본 강등 포함) |

### 정기 감사 운영 (audit run)
| KB | 다룸 |
|----|------|
| [audit-checklist-cadence](audit-checklist-cadence.md) | 인벤토리→triage→반영, 임계치/배치 한도, 롤백 안전 |
| [verification-promotion](verification-promotion.md) | triage 삼분 상세 기준 |
| [deduplication](deduplication.md) | 전처리 단계의 중복 차단 |

## KB 한 줄 요약
| KB | 한 줄 요약 |
|----|-----------|
| [provenance-trust-tiers](provenance-trust-tiers.md) | 출처(PROV-O)와 신뢰 등급(정본/auto/미검증), 검증 게이트로 등급 전이 |
| [staleness-freshness](staleness-freshness.md) | Dublin Core 시간 메타데이터로 노후 탐지·재검증·만료 처리 |
| [deduplication](deduplication.md) | SSOT/ARID 기반 중복 탐지·병합·링크·모순 해소 |
| [verification-promotion](verification-promotion.md) | 검증가능성 기반 승급/폐기/보류 결정과 증거 요건 |
| [audit-checklist-cadence](audit-checklist-cadence.md) | 정기 감사 절차(인벤토리·triage·반영)와 임계치·롤백 |

## 원칙 문서와의 관계
- 상위 통찰·판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **표준 근거·세부 규칙**이다.
- 충돌 시 **KB(공식 표준)가 우선**하며, principles는 그 위에 판단 기준을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. 출처(표준·정책) 개정 시 `source` URL을 다시 fetch해 갱신한다.
- 신선도 정책 자체는 [staleness-freshness](staleness-freshness.md) 참조(KB도 노후 대상이다).
- TODO(차기 KB 후보): Diátaxis 문서 유형 분류(튜토리얼/하우투/레퍼런스/설명) 기반 항목 배치,
  지식 그래프/링크 무결성 점검, 자동 학습 confidence 스코어링.
