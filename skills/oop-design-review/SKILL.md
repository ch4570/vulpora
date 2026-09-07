---
name: oop-design-review
description: Review object responsibilities, cohesion, encapsulation, and collaboration using SOLID and GRASP. Use for object-oriented design review, not implementation scaffolding.
---

# Object-Oriented Design Review (OOP Design Review)

A skill that diagnoses and improves design smells using the **roles, responsibilities, and
collaboration** and responsibility-driven design of Cho Young-ho's "Object" and "The Reality and
Misconception of Object Orientation", together with SOLID, GRASP, and the cohesion/coupling
principles.
For grounding facts, see this skill's `reference/kb/` (SOLID, GRASP, cohesion/coupling,
encapsulation/invariants, composition vs. inheritance, the Law of Demeter); for the principles, see
`reference/principles.md`. The index is `reference/kb/INDEX.md` (if you can't find the path, search
with Glob).

## Review order (proceed exactly like this)

1. **Diagnose responsibility placement** — Is the logic piled up in a service far away from the
   data (the entity) (anemic domain)?
2. **Tell, Don't Ask** — Code that calls `getX()` and then decides externally and `setY()`s →
   delegate to the object that holds that data.
3. **Encapsulation** — Is mutable internal state (collections/state) exposed as-is → read-only +
   mutating methods.
4. **Dependency direction** — Does a stable abstraction depend on an unstable concrete (DIP
   violation) → invert via an interface (port).
5. **Persistence leakage** — The domain depends directly on EntityManager/`@Repository`, the entity
   is exposed all the way to the API → separate them.
6. **Report** — Before/After + application steps. Don't break persistence invariants or transaction
   semantics (separate out behavior changes).

## Design smell → prescription

| Smell | Prescription |
|---|---|
| Anemic domain (logic concentrated in the service) | Extract+Move into a domain method (`order.cancel()`) |
| Tell-Don't-Ask violation / message chain | Delegate the message to the collaborator, Hide Delegate |
| Encapsulation violation (mutable exposure) | Read-only exposure + mutate via an intention-revealing method |
| Misplaced responsibility (Feature Envy) | Move Function — to the data holder |
| Concrete dependence (`new Impl()`) | Interface (port) + constructor DI (DIP) |
| Behavior decided by type branching | Use polymorphism (sealed/strategy) — pair with `design-pattern-apply` |

## Rules
- **Decide responsibility by "who is the most natural to bear it"** (behavior first, not data).
- When turning something into an entity method, make the entity uphold the **persistence
  invariants** (identifier/association consistency).
- Changing transaction boundaries or association fetching is a **behavior impact** → separate it
  from pure refactoring and mark it.

## Example (anemic domain → rich domain)
```kotlin
// Before — the service pulls out entity data to decide/assemble (Anemic + Ask)
if (order.getStatus() == OPEN && order.getItems().isNotEmpty()) order.setStatus(CANCELLED)
// After — the entity performs the responsibility with its own invariants (Tell, Don't Ask)
order.cancel()   // validates state/conditions internally
```
