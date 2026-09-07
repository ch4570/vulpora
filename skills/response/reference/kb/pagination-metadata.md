---
title: 페이지네이션 메타데이터와 커서 엔벨로프
source: https://docs.spring.io/spring-data/commons/reference/repositories/core-concepts.html
last_fetched: 2026-06-24
skills: [response]
---

# 페이지네이션 메타데이터 (Pagination Metadata)

> 출처: Spring Data Commons (Pageable/Slice/Page 개념) + RFC 8288 Web Linking(`Link` 헤더)
> https://www.rfc-editor.org/rfc/rfc8288.
> 핵심: **목록 응답은 명확한 페이지네이션 계약을 노출하고, 정렬은 안정적이어야 한다.**

## 1. 오프셋 vs 커서/키셋

| 방식 | 메타 | 장점 | 단점 |
|------|------|------|------|
| 오프셋(offset/limit) | `total`, `page`, `size`, `totalPages` | 임의 페이지 점프, 총개수 제공 | 깊은 페이지 느림, 삽입/삭제 시 항목 누락·중복 |
| 커서/키셋(keyset) | `nextCursor`, `hasNext` | 큰/변동 집합에 안정적, 일정 성능 | 임의 점프 불가, 총개수 비제공이 일반적 |

- **대량/실시간 변동 집합**(피드형 목록 등)은 커서/키셋을 선호한다. 오프셋은 후행 페이지에서
  스캔량이 커지고, 데이터 변동 시 같은 항목이 중복/누락된다.
- 총개수가 꼭 필요하거나 페이지 점프 UX가 중요하면 오프셋.

## 2. 메타데이터 계약

- **오프셋 엔벨로프**(예시):

```json
{
  "data": [ { "id": "..." } ],
  "_pagination": { "page": 0, "size": 20, "total": 137, "totalPages": 7 }
}
```

- **커서 엔벨로프**(공유 커서 페이지 엔벨로프 / 공통 프로토콜 모듈):

```json
{
  "data": [ { "id": "..." } ],
  "_pagination": { "nextCursor": "eyJpZCI6Li4ufQ==", "hasNext": true }
}
```

- 본 스킬은 **페이지네이션 목록을 단일 공유 커서 페이지 엔벨로프로 래핑**한다
  (`@JsonProperty("_pagination")` 메타 + `nextCursor`). 엔드포인트별 페이지 래퍼를 새로 만들지 않는다.

## 3. 안정적 정렬 (Stable Ordering) — 필수

- 커서/키셋은 **결정적(deterministic) 정렬**이 전제다. 정렬 키에 동률이 있으면 **유니크 타이브레이커**
  (보통 PK)를 마지막 정렬 키로 추가한다: `ORDER BY created_at DESC, id DESC`.
- 커서는 **마지막 항목의 정렬 키 값**을 인코딩(보통 base64)한다. 다음 요청은
  `WHERE (created_at, id) < (:lastCreatedAt, :lastId)` 형태로 이어간다.
- 정렬이 불안정하면 페이지 경계에서 항목이 새거나 중복된다.

## 4. `Link` 헤더(RFC 8288) 대안

- 본문 메타 대신/병행하여 `Link` 헤더로 `next`/`prev`/`first`/`last` URL을 제공할 수 있다:
  `Link: <https://api.example.com/articles?cursor=...>; rel="next"`.
- 하이퍼미디어 스타일이지만, 본 스킬의 기본은 본문 엔벨로프 메타다. 혼용 시 의미를 일치시킨다.

## 5. 경계 규칙

- `data`는 항상 **배열**(빈 결과도 `[]`), `null` 금지.
- `hasNext=false`면 `nextCursor`는 `null`/생략으로 일관.
- `size`는 서버가 강제하는 **최대치**를 두어 무제한 조회를 막는다.

## 리뷰 훅

- [ ] 목록이 단일 공유 커서 페이지 엔벨로프(`_pagination` 메타)로 래핑되는가?
- [ ] 커서/키셋 정렬에 유니크 타이브레이커(PK)가 포함되어 정렬이 안정적인가?
- [ ] 대량/변동 집합에 오프셋 대신 커서를 선택했는가?
- [ ] `data`가 항상 배열(빈 결과 `[]`)인가?
- [ ] `hasNext`/`nextCursor` 관계가 일관(끝이면 nextCursor 없음)된가?
- [ ] `size`에 서버 측 상한이 있는가?
- [ ] 커서 값이 정렬 키를 인코딩하며 클라이언트에 불투명(opaque)한가?
