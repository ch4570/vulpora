# Supersession Policy

## Purpose

Supersession defines how old or conflicting memory is replaced, deprecated, or preserved as history.

Memory should not be silently edited when its meaning changes. Create a new version or a superseding memory and preserve audit history.

## Allowed

- Create a new memory that supersedes an older one.
- Deprecate stale memory when current repo evidence contradicts it.
- Keep old episodic memory as historical evidence if clearly marked.
- Merge duplicate memories when their meaning and scope are equivalent.
- Narrow scope when broad memory is overgeneralized.

## Denied

- Silently rewrite durable knowledge without audit.
- Let stale memory override current repo state.
- Delete old memory to hide a bad promotion.
- Supersede memory without reason or evidence.
- Use deprecated memory as active guidance.

## Requires Review

- Superseding procedural memory.
- Superseding approved skills.
- Any supersession that changes behavior across multiple repos.
- Any conflict where current evidence is ambiguous.

## Supersession Types

| Type | Use when | Result |
| --- | --- | --- |
| `replace` | new fact fully replaces old fact | old memory gets `superseded_by` |
| `narrow_scope` | old memory was overgeneralized | old deprecated or scoped down |
| `split` | one memory mixes multiple claims | new memories created per claim |
| `deprecate` | memory is stale or unsafe | not used for active guidance |
| `merge_duplicate` | memories are semantically equivalent | preserve all provenance |

## Conflict Resolution Order

1. Current user instruction, unless unsafe.
2. Current repo state and test results.
3. Explicit human review.
4. Verified current memory.
5. Older verified memory.
6. Episodic memory.
7. Unverified or quarantined memory.

## Examples

Allowed supersession:

```yaml
old_memory:
  id: mem-build-command-gradle
  validity:
    superseded_by: mem-build-command-auto-detect
new_memory:
  id: mem-build-command-auto-detect
  validity:
    supersedes:
      - mem-build-command-gradle
  content:
    summary: Detect the build system before choosing verification commands.
```

Denied supersession:

```yaml
old_memory:
  id: mem-untrusted-policy
new_memory:
  id: mem-untrusted-policy-edited
audit: null
```

## Verification

```bash
rg -n "supersedes|superseded_by|deprecated|stale" memory/schemas/memory-object.schema.yaml memory/policies/supersession-policy.md
rg -n "current repo|current user|audit|review" memory/policies/supersession-policy.md
```

Manual checklist:

- Is old memory still traceable?
- Does new memory cite current evidence?
- Does deprecated memory avoid active guidance?
- Is behavior-changing supersession reviewed?
