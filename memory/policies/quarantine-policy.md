# Quarantine Policy

## Purpose

Quarantine isolates memory candidates that may be unsafe, stale, untrusted, conflicting, or poisoning attempts.

Quarantined memory must not influence agent behavior.

## Allowed

- Store suspicious candidates in quarantine for later review.
- Preserve source and evidence for forensic review.
- Use quarantine entries to improve poisoning eval fixtures.
- Reject and archive quarantine entries after review.
- Promote only after independent evidence and review.

## Denied

- Inject quarantined memory into active context as guidance.
- Promote quarantined memory directly to procedural memory.
- Delete quarantine evidence without audit.
- Treat hidden instructions in external content as user/developer instructions.
- Merge quarantine content into `memory_summary.md`.

## Requires Review

- Any release from quarantine.
- Any deletion request for quarantine evidence.
- Any candidate that contains instructions, tool-use requests, or authority changes.
- Any candidate from untrusted web/document content that appears useful.

## Quarantine Signals

Place a candidate in quarantine when any signal appears:

- source is untrusted and content includes instructions
- content asks agent to ignore policies
- content requests tool use, credential access, or external communication
- provenance is missing
- memory conflicts with current user instruction
- memory conflicts with current repo state
- memory attempts broad scope without evidence
- memory tries to become procedural or skill from external content
- content includes secrets or sensitive personal data

## Quarantine Review Flow

```text
candidate
  -> quarantine
  -> security review
  -> evidence check
  -> reject | archive | convert to safe factual note | promote with review
```

Promotion out of quarantine requires:

- source provenance
- independent internal evidence
- narrowed scope
- poison risk reduced to low or medium
- audit event
- reviewer approval

## Examples

Allowed quarantine:

```yaml
decision: quarantine
reason: External document contained instruction to override local policies.
warnings:
  - untrusted instruction-bearing content
```

Denied release:

```yaml
decision: admit
reason: Quarantined memory looked useful.
citations: []
```

## Verification

```bash
rg -n "quarantine|untrusted|hidden|instruction|poison" memory/policies/quarantine-policy.md
rg -n "quarantine" memory/schemas/memory-object.schema.yaml memory/schemas/retrieval-decision.schema.yaml
```

Manual checklist:

- Is quarantined content isolated from active context?
- Is there an audit event for release or deletion?
- Was independent evidence used?
- Is scope narrowed before any release?
