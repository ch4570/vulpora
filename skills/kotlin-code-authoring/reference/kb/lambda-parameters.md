---
title: Kotlin lambda parameter names
source: https://kotlinlang.org/docs/coding-conventions.html#lambdas
last_fetched: 2026-08-25
skills: [kotlin-code-authoring]
---

# Kotlin lambda parameter names

Kotlin's style guide illustrates a single-parameter lambda with `it` and defines formatting for explicit lambda parameter lists. Apply the repository rule below after checking its formatter and nearby code.

- Use `it` for a non-nested single-parameter lambda.
- When nested lambdas would make the active value or receiver unclear, name the inner parameter in that block.
- Do not erase parameters required by a multi-parameter API.

## 리뷰 훅

- [ ] The lambda has one implicit parameter before choosing `it`.
- [ ] An explicit parameter exists only for a nested-scope ambiguity or an API-required parameter list.
- [ ] The target repository's formatter and local style do not require a conflicting form.
