# KB 인덱스 — response (응답 DTO / 엔벨로프 설계)

이 디렉터리는 응답(Response) 계층의 **사실/규칙 중심 지식 베이스**다. 각 파일은 공식 문서/표준
(Spring MVC, RFC 9457, RFC 9110/7231, RFC 8288, OWASP)에 근거한다.

## 작업 유형 → 읽을 KB

| 작업 유형 | 먼저 읽을 KB |
|-----------|--------------|
| 응답 DTO 새로 만들기 / model 매핑 | [`response-dto-mapping.md`](response-dto-mapping.md) |
| 오류 응답 설계 / 예외 핸들러 | [`problem-detail-rfc9457.md`](problem-detail-rfc9457.md), [`error-response-design.md`](error-response-design.md) |
| 상태 코드 고르기(201/204/400/409/422 …) | [`http-status-codes.md`](http-status-codes.md) |
| 목록/페이지네이션 응답 | [`pagination-metadata.md`](pagination-metadata.md) |
| 응답 형태(엔벨로프 vs 베어) 결정 | [`response-envelope-design.md`](response-envelope-design.md) |
| 검증 오류 / 정보 누출 방지 | [`error-response-design.md`](error-response-design.md) |
| 직렬화 이름 / null / 날짜 형식 | [`content-negotiation-serialization.md`](content-negotiation-serialization.md) |

## KB 한 줄 요약

| KB | 한 줄 요약 |
|----|-----------|
| [`response-dto-mapping.md`](response-dto-mapping.md) | `from(model)` 팩토리가 매핑 소유, 엔티티 직접 노출 금지, 불변 `data class` |
| [`problem-detail-rfc9457.md`](problem-detail-rfc9457.md) | `application/problem+json` 표준 멤버 + 확장 멤버, Spring `ProblemDetail` 통합 |
| [`http-status-codes.md`](http-status-codes.md) | RFC 9110 상태 코드 의미·멱등성, 만능 200 금지 |
| [`pagination-metadata.md`](pagination-metadata.md) | 오프셋 vs 커서, 공유 `_pagination` 엔벨로프, 안정적 정렬 필수 |
| [`response-envelope-design.md`](response-envelope-design.md) | 베어/엔벨로프 일관 선택, 상태 코드↔본문 책임 분리 |
| [`error-response-design.md`](error-response-design.md) | 일관 오류 형태, 필드 검증 오류 매핑, 내부 정보 누출 금지(OWASP) |
| [`content-negotiation-serialization.md`](content-negotiation-serialization.md) | produces/Accept, Jackson 명명·null·ISO-8601, 안정적 필드 계약 |

## 원칙과의 관계

- 상위 헌법은 `../principles.md`. **충돌 시 우선순위: KB > principles > 취향.**
- KB는 출처 근거 사실/규칙이므로, principles와 어긋나면 KB를 따른다.

## 갱신 정책

- 각 KB는 frontmatter에 `source`(공식 문서/표준 URL)와 `last_fetched`(현재 `2026-06-24`)를 둔다.
- 출처 문서/표준 개정 시 해당 KB를 다시 확인하고 `last_fetched`를 갱신한다.
- 새 사실/규칙은 임의 추가하지 않고 출처에 근거해 반영한다.

## TODO

- [ ] Spring 버전 업데이트 시 `ProblemDetail`/`ErrorResponse` API 변화 재확인.
- [ ] RFC 9457/9110 정오표(errata) 점검 후 `last_fetched` 갱신.
- [ ] 캐싱(ETag/Cache-Control)·조건부 요청 KB 추가 검토.
- [ ] 하이퍼미디어(`Link` 헤더, HAL) 채택 시 전용 KB 분리 검토.
