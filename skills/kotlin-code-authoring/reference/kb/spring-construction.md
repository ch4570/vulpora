---
title: Spring construction boundaries
source: https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html
last_fetched: 2026-08-25
skills: [kotlin-code-authoring]
---

# Spring construction boundaries

Spring documents constructor injection as the preferred form for mandatory dependencies because it supports immutable, fully initialized components. Keep the repository's established component, proxy, and transaction conventions; declarative transaction behavior is infrastructure-sensitive and belongs at the application boundary selected by that architecture.

Additional primary source: [Using `@Transactional`](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html).

## Construction rules

- Use constructor injection for mandatory Spring collaborators. Do not choose field injection to avoid changing a constructor.
- Keep `@Transactional` placement and propagation aligned with nearby application/service code. Check proxy behavior before adding or moving it.
- Do not make controllers or adapters reach around an established service/application boundary to call persistence directly.
- Keep validation and exception translation at the existing boundary, then test the observable contract.

## 리뷰 훅

- [ ] Mandatory dependencies are constructor-injected and can remain non-null `val` properties.
- [ ] Transaction annotations follow the existing service/application boundary and proxy conventions.
- [ ] The implementation preserves local layer direction and persistence boundaries.
- [ ] Error and validation behavior is explicit and covered by the appropriate test level.
