---
title: 콘텐츠 협상과 JSON 직렬화
source: https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-config/content-negotiation.html
last_fetched: 2026-06-24
skills: [response]
---

# 콘텐츠 협상 / 직렬화 (Content Negotiation & Serialization)

> 출처: Spring MVC Content Negotiation + Jackson 직렬화 설정.
> 핵심: **직렬화 이름·null 정책·날짜 표현을 전역으로 고정해 안정적 필드 계약을 유지한다.**

## 1. produces / Accept

- 핸들러에 `produces = MediaType.APPLICATION_JSON_VALUE`를 명시해 협상 결과를 명확히 한다.
- 오류 응답은 `application/problem+json`(→ `problem-detail-rfc9457.md`).
- 클라이언트의 `Accept`에 따라 표현을 협상하되, 본 스킬의 기본 표현은 JSON이다.

## 2. Jackson 필드 명명

- 명명 전략(camelCase vs snake_case)을 **전역으로 한 번** 정한다
  (`spring.jackson.property-naming-strategy` 또는 `ObjectMapper` 설정).
- 개별 필드의 직렬화 이름이 계약상 중요한 경우 `@JsonProperty`로 못박는다.
  특히 `_pagination`처럼 언더스코어 메타 키는 명시적으로 고정한다.

```kotlin
data class ArticleResponse(
    /** 글 식별자 */
    @get:JsonProperty("id") val id: String,
    /** 제목 */
    val title: String,
    /** 게시 시각 (ISO-8601, UTC) */
    val publishedAt: Instant,
)
```

## 3. null 포함/제외

- null 필드를 직렬화에 포함할지(`Include.ALWAYS`) 제외할지(`Include.NON_NULL`)를 **전역으로 통일**한다.
- 한 API 안에서 엔드포인트마다 다른 null 정책을 쓰지 않는다(클라이언트 분기 복잡도 증가).
- "선택적 필드 부재"와 "값이 null"의 의미를 문서로 명확히.

## 4. 날짜/시간 (ISO-8601)

- 시각은 **ISO-8601**로 직렬화한다(예: `2026-06-24T08:15:30Z`). 타임존 인식 타입(`Instant`,
  `OffsetDateTime`) 사용을 권장하고, 타임존을 응답에 명확히(UTC 권장).
- 에포크 밀리초 같은 숫자 타임스탬프는 가독성/타임존 모호성 때문에 지양(쓰려면 전역 일관 + 문서화).
- Jackson `JavaTimeModule` 등록, **타임스탬프를 숫자로 쓰지 않도록**
  `WRITE_DATES_AS_TIMESTAMPS=false` 설정.

## 5. 안정적 필드 계약

- 필드 이름/타입/의미는 공개 계약. 리팩터링으로 프로퍼티명이 바뀌어도 직렬화 이름은
  `@JsonProperty`로 유지한다.
- enum은 안정적 문자열(name/code)로 직렬화하고 ordinal 직렬화를 피한다.
- 파괴적 변경(필드 제거/의미 변경)은 버전/미디어타입으로 흡수하고 호환성을 점검한다.

## 리뷰 훅

- [ ] 핸들러가 `produces`(성공 JSON / 오류 problem+json)를 명시하는가?
- [ ] 필드 명명 전략이 전역으로 고정되어 있는가?
- [ ] 계약상 중요한 직렬화 이름을 `@JsonProperty`로 못박았는가(`_pagination` 등)?
- [ ] null 포함/제외 정책이 전역으로 일관된가?
- [ ] 날짜/시간이 ISO-8601 + 타임존 인식으로 직렬화되는가(숫자 타임스탬프 지양)?
- [ ] enum이 ordinal이 아닌 안정적 문자열로 직렬화되는가?
- [ ] 파괴적 필드 변경에 호환성/버저닝을 고려했는가?
