---
name: design-pattern-apply
description: Assess whether a design pattern fits a real axis of change and prescribe its application. Use for pattern selection or composition/inheritance decisions; reject over-design.
---

# Design Pattern Application

A skill that **judges the value of applying a pattern** and prescribes it, grounded in GoF
*Design Patterns*, *Head First Design Patterns*, and Spring DI principles. For grounding facts see
this skill's `reference/kb/` (creational · structural · behavioral patterns, DI/Strategy/Factory);
for principles see `reference/principles.md`. The index is `reference/kb/INDEX.md` (if you can't
find the path, search with Glob).

> **Core**: A pattern is not a goal but a prescription. Apply it **only when the problem (an axis
> of change/extension) actually exists**, and state the extension benefit against the cost of
> indirection. If a simpler prescription (Extract Function, sealed `when`) suffices, don't add the
> pattern (YAGNI).

## Judgment order (proceed exactly like this)

1. **Confirm the axis of change** — identify "what changes often" from past change history /
   upcoming cases. If none, hold off.
2. **Examine simpler alternatives first** — is Extract Function / sealed `when` / polymorphism
   enough?
3. **Pattern matching** — if a real axis of change matches the signals below, prescribe that
   pattern.
4. **State the trade-off** — more classes · reduced traceability vs. extensibility. Does the
   benefit justify the cost?
5. **Apply in small steps** — introduce interface → Move implementation → delegate from call
   sites, testing at every step.

## Signal → pattern

| Signal | Pattern |
|---|---|
| Policy/algorithm scattered across branches with frequent swapping/extension | **Strategy** |
| Same task skeleton, only some steps differ (duplicated skeleton) | **Template Method / template-callback** (Toby) |
| `new`/concrete construction scattered everywhere | **Factory Method / Abstract Factory** |
| On state change, many places notified · mutable subscribers | **Observer** |
| Combinatorial explosion of features handled by inheritance | **Decorator** (composition) |
| Interface-mismatch adapting code scattered around | **Adapter** |
| State-specific behavior differences · transitions tangled in `if` | **State** |

## Over-design warning (do-not-apply signals)
- Branches hardly ever change → keep a simple `when`.
- Only one implementation → hold off on interface+factory (speculative generalization).
- Inheritance is enough/clear → don't overuse Decorator.

## Example (introducing Strategy)
```kotlin
// Before — policy scattered across branches; every new type requires editing call sites (OCP violation)
fun discount(order: Order, grade: Grade) = when (grade) { /* per-grade discount formula */ }
// After — strategy interface + injected implementation (new policy = new implementation, call sites unchanged)
interface DiscountPolicy { fun discount(order: Order): Money }
class BasicDiscount : DiscountPolicy { /* ... */ }
class VipDiscount : DiscountPolicy { /* ... */ }
```
Application steps: ① extract the strategy interface → ② Move the branch bodies into implementations → ③ inject via DI, delegate from call sites.
