---
title: 도구/함수 정의 품질
source: https://platform.openai.com/docs/guides/function-calling
last_fetched: 2026-06-24
skills: [harness-propose]
---

# KB: 도구/함수 정의 품질 (tool definitions)

> 도구 정의(이름·파라미터 스키마·설명·예시)의 품질이 호출 정확도를 결정한다.
> 근거: OpenAI "Function calling guide", Anthropic "Tool use overview".

## 1. 이름(name)

- **행위가 드러나게** 짓는다: 동사+대상(`create_order`, `cancel_subscription`).
- 모델이 추측해야 하는 모호한 이름(`process`, `handle`, `do`)을 피한다.
- 비슷한 도구는 이름만으로 역할이 구분되게 한다.

## 2. 파라미터 스키마(precise schema)

- **타입을 명시**한다: string/number/boolean/array/object. 느슨한 단일 문자열로 받지 않는다.
- **필수/선택**을 분리하고, 기본값이 있으면 설명에 적는다.
- **열거형(enum)·범위·패턴**으로 허용값을 좁힌다(예: `status: ["OPEN","CLOSED"]`).
- 객체 파라미터는 **중첩 필드까지 스키마화**한다. 모델은 스키마가 정밀할수록 정확히 채운다.

```jsonc
// 좋은 예 (정밀)
{
  "name": "search_articles",
  "parameters": {
    "type": "object",
    "properties": {
      "query":  { "type": "string", "description": "검색어(필수)" },
      "status": { "type": "string", "enum": ["DRAFT","PUBLISHED"] },
      "limit":  { "type": "integer", "minimum": 1, "maximum": 50 }
    },
    "required": ["query"]
  }
}
```

## 3. 설명(description)이 모호성을 제거한다

- **언제 쓰고 언제 쓰지 말지**를 적는다. 비슷한 도구가 둘 이상이면 서로를 배제하도록 쓴다
  (예: "단건 조회는 `get_x`, 목록은 `list_x`").
- 부작용(쓰기·삭제·외부 호출 발생 여부)과 비용을 명시한다.

## 4. 예시(examples)

- 대표 입력 1~2개와 그 의미를 제공한다. 모델은 스펙보다 예시를 더 잘 모방한다.
- 경계 케이스(빈 결과, 잘못된 입력)에 대한 기대 동작도 짧게 적는다.

## 5. 구조화된 에러 반환

- 실패는 자유 문장이 아니라 **구조화**해 돌려준다: `{ error_code, message, fix_hint }`.
- 검증 실패는 어느 필드가 왜 틀렸고 허용값이 무엇인지 알려준다.
- 성공/부분성공/실패를 명확한 상태값으로 구분한다.

## 리뷰 훅
- [ ] 도구 이름이 **행위(동사+대상)**로 자명한가.
- [ ] 파라미터에 **타입·필수/선택·enum/범위**가 정밀하게 정의됐는가.
- [ ] 설명이 **사용 시점/비사용 시점·부작용**을 구분하는가.
- [ ] 유사 도구 간 설명이 서로를 **배제(disambiguate)**하는가.
- [ ] 대표 **예시 입력**이 제공되는가.
- [ ] 에러가 `error_code`/`fix_hint` 등 **구조화된 형태**로 반환되는가.
