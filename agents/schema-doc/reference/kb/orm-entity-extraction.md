---
title: ORM/엔티티 코드에서 테이블·컬럼·관계 추출 (JPA 일반)
source: https://jakarta.ee/specifications/persistence/
last_fetched: 2026-06-24
consumers: [schema-cartographer]
---

# KB: ORM 엔티티 추출 (테이블·컬럼·관계·enum)

## 리뷰 훅 (이걸 점검하라)
- [ ] `@Entity` 클래스 → 테이블 후보로 잡았는가. `@Table(name=...)` 없으면 **명명 전략**으로 테이블명 유추했는가.
- [ ] 각 영속 필드 → 컬럼. `@Column(name=...)` 없으면 명명 전략(camelCase→snake_case 등)으로 컬럼명 유추했는가.
- [ ] `@Id`/`@EmbeddedId` → PK. `@GeneratedValue`는 의미(자동생성)만 메모(물리 타입은 마이그레이션 기준).
- [ ] 관계 어노테이션(`@ManyToOne`/`@OneToMany`/`@OneToOne`/`@ManyToMany`)에서 **FK 방향·조인 컬럼**을 읽었는가.
- [ ] `@JoinColumn`/`@JoinTable` → FK 컬럼명·조인 테이블 추출했는가.
- [ ] `@Enumerated(STRING|ORDINAL)` + enum 타입 → **허용값 목록**을 enum 정의에서 수집했는가.
- [ ] 코드와 마이그레이션이 어긋나는 곳을 **드리프트**로 표기했는가(물리=마이그레이션 우선).

## 근거 (명세 요지, 프레임워크 일반)
- **테이블 매핑**: `@Entity` + `@Table(name, schema)`. `@Table` 생략 시 구현의 **명명 전략**이 클래스명에서 테이블명을 만든다.
- **컬럼 매핑**: 기본은 영속 필드 1개 = 컬럼 1개. `@Column(name, nullable, length, columnDefinition)`로 상세 지정.
  생략 시 명명 전략이 필드명에서 컬럼명을 만든다(흔히 camelCase → snake_case).
- **식별자**: `@Id`(단일), `@EmbeddedId`/`@IdClass`(복합). 생성 전략 `@GeneratedValue`.
- **관계**:
  - `@ManyToOne` (+ `@JoinColumn`) → **이 엔티티가 N측**, FK 컬럼은 이 테이블에. 가장 신뢰도 높은 FK 신호.
  - `@OneToMany(mappedBy=...)` → 역방향(소유는 상대의 `@ManyToOne`). 별도 FK 컬럼 없음.
  - `@OneToOne` (+ `@JoinColumn`) → 1:1. FK가 한쪽에.
  - `@ManyToMany` (+ `@JoinTable`) → N:M, **조인 테이블**(두 FK).
  - `@Enumerated` → 컬럼이 enum 문자열/서수. enum 정의에서 허용값 수집.
- **상속/임베디드**: `@MappedSuperclass`/`@Embeddable`/`@Embedded`는 컬럼을 부모/포함 클래스에서 끌어온다 — 필드를 펼쳐 컬럼화.

## 비-JPA ORM 일반화
- 다른 ORM/DSL(예: 코드-퍼스트 매퍼, 테이블 DSL)도 같은 정보(테이블·컬럼·PK·FK·enum)를 **다른 표기**로 담는다.
- 어노테이션 대신 빌더/스키마 선언을 `Grep`으로 찾아 동일 매핑(테이블·컬럼·관계)을 추출한다. 신호 종류는 같다.

## 드리프트 caveat (MUST)
- ORM 코드는 **의도**다 — 물리 진실은 마이그레이션(KB: flyway-schema-replay).
- 다음은 드리프트로 표기:
  - 코드에 있는 컬럼/테이블이 마이그레이션에 없음 → "코드 전용(미반영 의심)".
  - 마이그레이션에 있는 컬럼이 엔티티에 없음 → "DB 전용(매핑 없음)".
  - 타입/nullable/길이 불일치 → 물리(마이그레이션) 채택 + 양쪽 값 병기.
- `ddl-auto`(자동 DDL) 설정에 의존하는 프로젝트는 마이그레이션이 불완전할 수 있음을 **주의 항목**으로 남긴다.

## 인용 시
"JPA 명세(관계 매핑) 기준 `@ManyToOne`+`@JoinColumn` → FK는 N측 테이블, 단 타입은 마이그레이션 채택" 식으로 근거를 단다.
