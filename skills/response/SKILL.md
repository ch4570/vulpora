---
name: response
description: Scaffold a REST response DTO in the API module with a `from(model)` companion factory; paginated lists use the shared cursor page envelope. Use when adding a response body for an API endpoint.
---

# response — REST response DTO scaffold (API module)

Generate a response body that maps from a domain model via a `from(...)` factory, keeping mapping out of
the controller.

> **Authority**: [`AGENTS.md`](../../../AGENTS.md) is binding. Review with `kotlin-spring-review`.

> **Reference loading (progressive disclosure):**
> Read [principles](reference/principles.md) first, then use the [KB index](reference/kb/INDEX.md).
> Load only topic files matching the current task; MUST NOT recursively load the entire KB.

## Where it goes
- API module, package `com.example.api.<domain>` — co-located with the controller. No `public` keyword.
- Class name `<Entity>Response`.

## Skeleton (see `order/OrderResponse.kt`)
```kotlin
data class <Entity>Response(
    val id: String,
    val <field>: <Type>,
) {
    companion object {
        fun from(model: <Model>): <Entity>Response =
            <Entity>Response(
                id = model.id,
                <field> = model.<field>,
            )
    }
}
```

## Rules (MUST)
- `data class` with `val` properties + a `companion object { fun from(model): <Entity>Response }` factory — the response, not the controller, owns model→DTO mapping.
- **Paginated lists** wrap in the shared cursor page envelope (공유 커서 페이지 엔벨로프 / 공통 프로토콜 모듈; `@JsonProperty("_pagination")` meta + `nextCursor`); do not invent a per-endpoint page wrapper.
- KDoc per field, in Korean.
- 생성 코드에 단일 파라미터 람다가 있으면 중첩되지 않은 경우 `it`을 쓰고, 중첩 스코프를 구분해야 할 때만 내부 파라미터에 이름을 붙인다. 여러 파라미터가 필요한 API는 예외다.

## Verify
빌드시스템 자동감지 (gradle/maven/npm/pnpm/yarn) 후 해당 빌드로 컴파일 확인.

## Related
[[request]] · [[service]]
