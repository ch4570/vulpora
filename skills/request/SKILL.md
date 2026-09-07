---
name: request
description: Scaffold a REST request DTO co-located with its controller, as a validated Kotlin data class. Use when adding a request body for an API endpoint.
---

# request — REST request DTO scaffold

Generate a validated request body for an API endpoint, co-located with its controller.

> **Authority**: `AGENTS.md` is binding. Review with `kotlin-spring-review`.

> **Reference loading (progressive disclosure):**
> Read [principles](reference/principles.md) first, then use the [KB index](reference/kb/INDEX.md).
> Load only topic files matching the current task; MUST NOT recursively load the entire KB.

## Where it goes
- API module, package `com.example.api.<domain>` — **co-located** with the controller (no `request/` subfolder). No `public` keyword.
- Class name `<Action><Entity>Request`.

## Skeleton (see `order/PlaceOrderRequest.kt`)
```kotlin
data class <Action><Entity>Request(
    @field:NotBlank
    val <stringField>: String,
    @field:NotNull
    val <enumField>: <ProtocolEnum>,
)
```

## Rules (MUST)
- `data class` with `val` properties.
- jakarta Bean Validation with the **`@field:`** site target (Kotlin): `@field:NotBlank`, `@field:NotNull`, etc. The controller validates with `@RequestBody @Valid`.
- Identifiers that belong in the URI path (e.g. `memberId`) stay **out** of the body.
- Prefer protocol enums from [`enum`](../enum/SKILL.md) over free-form strings. KDoc per field, in Korean.
- 생성 코드에 단일 파라미터 람다가 있으면 중첩되지 않은 경우 `it`을 쓰고, 중첩 스코프를 구분해야 할 때만 내부 파라미터에 이름을 붙인다. 여러 파라미터가 필요한 API는 예외다.

## Verify
Compile with the detected build system (gradle/maven/etc.).

## Related
[[response]] · [[enum]]
