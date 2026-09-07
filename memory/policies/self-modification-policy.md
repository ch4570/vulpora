# Self-Modification Policy

## Purpose

Self-modification means memory or eval results cause changes to agent prompts, policies, skills, orchestration, permissions, or code.

Default stance: deny. Self-modification is allowed only through reviewable files, explicit evidence, and eval gates.

## Allowed

- Propose changes as draft documents or patches.
- Update low-risk wording in examples with review.
- Promote a skill after replay/eval and reviewer approval.
- Deprecate unsafe guidance with audit.
- Add eval fixtures that expose failures.

## Denied

- Automatically rewrite system/developer instructions.
- Automatically expand tool permissions.
- Automatically approve new procedural memory.
- Modify `agents/**` from memory evidence alone.
- Treat success on one task as permission to change global behavior.
- Use untrusted content to modify prompts, policies, or skills.

## Requires Review

- Any prompt or agent role change.
- Any skill behavior change.
- Any policy change.
- Any change that can affect tool use, file writes, network access, or destructive operations.
- Any orchestration graph change.
- Any broad-scope memory update.

## Review Gate

Self-modification requires:

1. Written proposal.
2. Source memories or episodes.
3. Risk classification.
4. Eval or replay evidence.
5. Reviewer verdict.
6. Audit event.
7. Rollback path.

## Safe Proposal Format

```text
Change:
Why:
Source evidence:
Risk:
Eval/replay:
Rollback:
Reviewer:
```

## Examples

Allowed proposal:

```yaml
change: Add a retrieval-gate warning to memory-curator instructions.
why: Poisoning fixture showed untrusted instruction-bearing memory was too easy to summarize.
risk: medium
eval:
  - evals/memory-poisoning/cases/untrusted-web-instruction.yaml
reviewer: memory-security-reviewer
status: proposed
```

Denied automatic rewrite:

```yaml
change: Rewrite all agent prompts to trust the latest retrieved memory.
trigger: One successful run.
reviewer: none
eval: none
status: applied
```

## Verification

```bash
rg -n "self-modification|prompt|policy|skill|Requires Review|Denied" memory/policies/self-modification-policy.md
rg -n "review|eval|rollback|audit" memory/policies/self-modification-policy.md
```

Manual checklist:

- Is this a behavior change?
- Does it expand authority?
- Is there eval evidence?
- Is there a rollback path?
- Was it reviewed by a role not responsible for the original change?
