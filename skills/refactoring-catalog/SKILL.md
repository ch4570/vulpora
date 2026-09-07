---
name: refactoring-catalog
description: Select behavior-preserving refactorings for demonstrated code smells and give an ordered verification plan. Use when deciding how to improve existing code safely.
---

# Refactoring Catalog

A skill that improves structure through **smell → prescription → small steps** by applying
Martin Fowler's *Refactoring* (2nd ed.) catalog + a code-smell taxonomy + Clean Code heuristics.
For grounding facts see this skill's `reference/kb/` (smell taxonomy, function/class refactorings,
conditionals/polymorphism, encapsulation moves, etc.); for higher-level principles see
`reference/principles.md`. The index is `reference/kb/INDEX.md`
(if you can't find the path, Glob for `principles.md`/`INDEX.md` from the bundle root).

## Application order (proceed exactly like this)

1. **Confirm the safety net** — grep for the target's regression tests. If absent, **write a characterization test first** (without one, cap a large change at MEDIUM).
2. **Smell scan** — identify smells with the review hooks in `reference/kb/code-smells.md` and route through `reference/kb/INDEX.md`.
3. **Catalog mapping** — prescribe a **named refactoring** for each smell (table below).
4. **Design small steps** — split the prescription into behavior-preserving units and compile/test after each step.
5. **Report** — Before/After + applied steps + verification commands. Prioritize by value÷risk.

## Smell → refactoring quick table

| Smell | Prescription (catalog) |
|---|---|
| Duplicated code | Extract Function / Pull Up Method |
| Long function | Extract Function, Replace Temp with Query, Decompose Conditional |
| Long parameter list | Introduce Parameter Object, Preserve Whole Object |
| Large class (multiple responsibilities) | Extract Class |
| Feature Envy | Move Function / Move Field |
| Primitive obsession / data clumps | Replace Primitive with Object (Value Object) |
| Repeated branching (`when`/`if` ladder) | Replace Conditional with Polymorphism (sealed/strategy) |
| Nested conditionals | Replace Nested Conditional with Guard Clauses (early return) |
| Shotgun surgery / divergent change | Cohere via Move, Extract Class per responsibility |

## Rules when prescribing
- Always cite the **source** (Fowler catalog name / Effective Kotlin item).
- **Do not change behavior** — if a feature change/bug fix is mixed in, separate it and report it apart.
- No over-engineering (KISS/YAGNI) — abstract only when duplication actually exists.

## Example (Replace Conditional with Polymorphism)
```kotlin
// Before — type branching repeated across multiple methods
fun fee(type: PaymentType): Int = when (type) {
    PaymentType.CARD -> 100; PaymentType.BANK -> 200
}
// After — sealed + polymorphism (adding a new type is the extension, OCP)
sealed interface Payment { fun fee(): Int }
data object Card : Payment { override fun fee() = 100 }
data object Bank : Payment { override fun fee() = 200 }
```
Application steps: ① model the sealed hierarchy → ② Move each branch body (test per case) → ③ replace call sites with the polymorphic call.
