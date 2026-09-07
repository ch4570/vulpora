# NL→SQL Guardian Knowledge Base — 색인 (INDEX)

> OWASP·PostgreSQL **공식 문서**를 distill한 인용 가능한 KB. 각 파일은 frontmatter에
> `source`(원문 URL)·`last_fetched`·`skills`를 담는다.
> **리뷰 시 사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며,
> 지적할 때 KB의 `source` URL을 근거로 인용한다. (예: "OWASP Query Parameterization 기준 …")

## 작업 유형 → 읽을 KB

### 인젝션 방어 (값/식별자 주입)
| KB | 다룸 |
|----|------|
| [sql-injection-defense](sql-injection-defense.md) | 파라미터 바인딩, 문자열 연결 금지, 식별자 화이트리스트, LLM 출력 처리 |

### 읽기 전용 강제 (쓰기/DDL/멀티스테이트먼트 차단)
| KB | 다룸 |
|----|------|
| [read-only-enforcement](read-only-enforcement.md) | 문장 화이트리스트(SELECT/WITH), 금지 키워드·세미콜론, 읽기전용 트랜잭션, 다층 방어 |
| [least-privilege-db-role](least-privilege-db-role.md) | 최소권한 롤(SELECT만), GRANT/REVOKE, search_path, 시크릿 관리 |

### 결과 바운딩 / 행 잠금
| KB | 다룸 |
|----|------|
| [result-bounding-and-row-locks](result-bounding-and-row-locks.md) | LIMIT/TOP/FETCH, 결과 캡(하드 절단), SELECT ... FOR UPDATE 차단 |

## 원칙 문서와의 관계
- 상위 판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**하며, principles는 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. OWASP/PG 문서 갱신 시 `source` URL을 다시 확인해 갱신.
- TODO(차기): RLS(행수준 보안) 정책 KB, 오류 메시지 정보노출 KB, rate-limit/timeout KB 추가 여지.
