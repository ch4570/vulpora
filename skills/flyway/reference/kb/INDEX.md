# Flyway Knowledge Base — 색인 (INDEX)

> Flyway 공식 문서(Red Gate, documentation.red-gate.com/fd)를 distill한 인용 가능한 KB.
> 각 파일 frontmatter에 `source`(공식 URL)·`last_fetched`·`skills`를 담는다.
> **사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 지적 시 KB의 `source`를 근거로 인용한다.

## 작업 유형 → 읽을 KB

### 마이그레이션 작성 (authoring)
| KB | 다룸 |
|----|------|
| [versioned-vs-repeatable](versioned-vs-repeatable.md) | V/R 구분, 적용 시점, 선택 기준 |
| [naming-versioning](naming-versioning.md) | 파일명 문법, prefix/version/separator, 순서·충돌 |
| [idempotency-patterns](idempotency-patterns.md) | IF NOT EXISTS, 재실행 안전, 트랜잭션 경계 |

### 안전한 변경 (safety)
| KB | 다룸 |
|----|------|
| [safe-migration-patterns](safe-migration-patterns.md) | NOT NULL 3단계, 백필, CONCURRENTLY, 온라인 DDL 연계 |
| [undo-limitations](undo-limitations.md) | undo 한계, forward-fix, 롤백 전략 |

### 운영 (operations)
| KB | 다룸 |
|----|------|
| [baseline-outoforder-sync](baseline-outoforder-sync.md) | baseline, out-of-order, info/validate, 로컬 DB 동기화 |

## 원칙 문서와의 관계
- 상위 판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**한다.

## 갱신
- 각 파일 `last_fetched` 기준. Flyway 메이저 변화 시 `source` URL을 다시 fetch해 갱신.
- TODO(차기): callbacks, placeholders, `clean` 위험성, schema history table 구조, dry-run/migrate report.
