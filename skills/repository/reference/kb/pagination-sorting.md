---
title: 페이지네이션과 정렬
source: https://docs.spring.io/spring-data/jpa/reference/repositories/query-methods-details.html#repositories.special-parameters
last_fetched: 2026-06-24
skills: [repository]
---

# 페이지네이션과 정렬

> 보조 출처: https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html

## Pageable / Page / Slice / Sort
- **`Pageable`** — 페이지 번호·크기·정렬을 묶은 요청. `PageRequest.of(page, size, sort)`.
- **`Page<T>`** — 콘텐츠 + `totalElements`/`totalPages`. **전체 count 쿼리를 추가 실행**한다.
- **`Slice<T>`** — 콘텐츠 + `hasNext`만. **count 쿼리를 실행하지 않는다**(size+1 조회로 다음 존재 판별).
- **`Sort`** — 정렬만 필요할 때.

```kotlin
fun findByStatus(status: String, pageable: Pageable): Page<OrderEntity>
fun findByMemberId(memberId: String, pageable: Pageable): Slice<OrderEntity>
```

## count 쿼리 비용 / Slice로 회피
- `Page`는 매 조회마다 `select count(*)`를 함께 날린다. 대용량 테이블에서 **count는 비싼 연산**이다.
- 총 페이지 수 UI가 불필요한 무한 스크롤·"더 보기"에는 **`Slice`로 count를 회피**한다.
- `@Query` + `Page`에서 count 쿼리를 따로 최적화하려면 `countQuery` 속성을 지정한다.

## keyset / cursor 페이지네이션 (대용량 권장)
- 깊은 `OFFSET`은 앞 행을 모두 스캔·버리므로 페이지가 깊어질수록 **선형으로 느려진다**.
- 마지막으로 본 키를 기준으로 다음 묶음을 읽는 **keyset(cursor)** 방식을 권장.
```kotlin
// 예: createdAt, id 기준 keyset
@Query("select o from OrderEntity o where (o.createdAt, o.id) < (:ts, :id) order by o.createdAt desc, o.id desc")
fun nextPage(@Param("ts") ts: Instant, @Param("id") id: String, pageable: Pageable): List<OrderEntity>
```
- Spring Data의 `ScrollPosition`/`Window`(keyset scroll) API도 활용 가능.

## Sort 안전성
- `Sort`에 **클라이언트가 준 문자열을 그대로** 넘기면 임의 프로퍼티/함수가 노출될 수 있다 → **허용 컬럼 화이트리스트**로 검증.
- 정렬 컬럼이 인덱스 순서와 맞아야 정렬 연산을 생략할 수 있다.

## 리뷰 훅
- [ ] 다건 조회가 `Pageable`로 페이징되는가? (경계 없는 `findAll` 금지)
- [ ] 총 개수가 불필요한 화면인데 `Page`를 써서 불필요한 count를 날리지 않는가? → `Slice`
- [ ] 대용량/깊은 페이지에 `OFFSET` 대신 keyset/cursor를 검토했는가?
- [ ] 외부 입력으로 받은 `Sort` 프로퍼티를 화이트리스트로 검증하는가?
- [ ] 커스텀 `@Query` + `Page`에서 count 쿼리가 비대하지 않은가?(`countQuery` 지정 검토)
