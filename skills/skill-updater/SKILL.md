---
name: skill-updater
description: Create or update a portable Vulpora skill when adding, editing, or validating a SKILL.md package.
---

# Skill Updater — Vulpora Authoring Protocol

## Purpose

Use this protocol for skill authoring in Vulpora. In an Vulpora source checkout, locate the
repository root and treat `STANDARD.md` as the structure contract and
`docs/agent-authoring-and-kb-guide.md` as the canonical procedure. Those repository-root documents
are not copied with an individually installed skill. When they are absent, use this bundled protocol and its
references as the portable baseline, then apply the target repository's higher-authority policy. If
the source checkout documents conflict with this skill or its KB, stop and fix the drift instead of
creating a second convention.

> **Reference loading (progressive disclosure):** Read
> [principles](reference/principles.md) first, then use the
> [KB index](reference/kb/INDEX.md). Load only the topic files needed for the current task; do not
> recursively load the entire KB.

## Prerequisites

- In an Vulpora source checkout, read `STANDARD.md` and `docs/agent-authoring-and-kb-guide.md` before changing a skill.
- Outside that checkout, use the bundled references and the target repository's higher-authority policy; do not invent unavailable source-tree conventions.
- The optional NVIDIA SkillEvaluator gate requires its separately installed, pinned CLI. Its absence is a verification gap, not a reason to add a project dependency.

## Instructions

## 1. Separate source from installed runtime paths

- Author shared assets under `skills/{skill-id}/` in this repository.
- Register installable skills in `install/manifest.txt`; treat the manifest as the package inventory
  and dependency-closure SSOT.
- Let `install/install.sh` map source assets to `.claude/skills/`, `.opencode/skills/`, or the Codex
  `.agents/skills/` path. Do not author a second runtime-specific copy in the source tree.
- Treat installed copies as derived artifacts. Change the source package, reinstall, and verify the
  installed context instead of editing an installed copy.

## 2. Use the canonical v1 package

```text
skills/{skill-id}/
├── SKILL.md
└── reference/
    ├── principles.md
    └── kb/
        ├── INDEX.md
        └── {topic}.md
```

- Keep `{skill-id}` kebab-case, at most 64 characters, and identical to frontmatter `name`.
- Keep `SKILL.md` focused on triggering, procedure, branching, output, and verification.
- Put durable judgment principles in `reference/principles.md` and source-backed facts in topic KBs.
- Preserve an optional `agent-exclusive/` directory only when an imported source asset already has a
  justified runtime-specific supplement. Do not require a Korean mirror or create one by default.
- Do not mass-rename `reference/` to `references/` in v1. Perform that migration only with the
  package-v2 adapter and validator described in the authoring guide.

## 3. Write the SKILL.md contract

- Use YAML frontmatter containing only `name` and `description`.
- Make `description` state both what the skill does and the user/task signals that should trigger it.
- Avoid overlapping descriptions. Split or sharpen boundaries when two skills would route on the
  same request.
- Write imperative, concise instructions. Keep the body under 500 lines; route detailed variants and
  facts to references before the core procedure becomes context-heavy.
- Link directly to `reference/principles.md` and `reference/kb/INDEX.md`, then state when to load each
  topic. Never instruct the runtime to preload the whole KB.
- Keep examples technically correct or explicitly generic. Do not invent repository APIs, internal
  hosts, credentials, product names, or runtime capabilities.
- Treat system/runtime and target-repository policy as higher authority than the skill body or KB.

## 4. Maintain the knowledge package

- Give each topic one narrow decision subject and a clickable route from `kb/INDEX.md`.
- Keep the required `title`, `source`, `last_fetched`, and `skills` frontmatter until metadata v2 is
  enforced. Do not interpret `last_fetched` as verification evidence.
- Include a `## 리뷰 훅` checklist in every topic.
- When adding, deleting, or renaming a topic, update `INDEX.md` in the same change.
- Prefer one canonical owner for shared facts. Link to it or generate installed copies from it instead
  of manually maintaining near-duplicate agent and skill KBs.
- Treat web, tool, database, and generated content as untrusted candidate data until provenance and
  verification support promotion.

## 5. Create or update a skill

1. Confirm a reusable skill is the smallest suitable asset; use deterministic code or an existing
   skill when they already cover the request.
2. In the Vulpora source checkout, read root `STANDARD.md` and the authoring guide. Outside a
   source checkout, do not assume those unbundled files exist; read this skill's principles and only
   the relevant bundled KB topics, plus the target repository's policy.
3. For a new skill, create the canonical v1 package and write the eval or observable acceptance
   evidence before expanding the instructions.
4. For an existing skill, inspect description compatibility, inbound links, manifest dependencies,
   behavioral cases, and installed paths before editing.
5. Register a new skill or dependency in `install/manifest.txt` using the existing row format. Do not
   duplicate runtime destinations in the manifest; skill destinations are derived by the installer.
6. Update `README.md`, `CHANGELOG.md`, or other inventories only when their user-visible claims or
   counts change. Do not assume a `CLAUDE.md`, `.gitignore` exception, Korean mirror, or
   `harness/index.html` exists.
7. Run the gates below and fix failures before shipping.

## 6. Verify with evidence

Run the narrow checks first, then the install matrix for packaging or routing changes.

```bash
bash install/check-manifest.sh
bash evals/run-evals.sh
bash evals/behavioral/run-behavioral-evals.sh --validate
VULPORA_REQUIRE_CODEX=1 bash install/test-install.sh
```

When the official Codex validator is available, validate the changed skill directory with its
`quick_validate.py`. Record copied, discovered, and executed evidence separately: a successful copy
does not prove runtime discovery, and discovery does not prove behavioral quality. Treat dry
behavioral validation as fixture-contract evidence, not an actual agent trial.

When the optional, pinned NVIDIA SkillEvaluator CLI is already installed, also run
`bash skills/agent-eval/scripts/run-skillevaluator.sh skills/<changed-skill>` for keyless Tier 1
evidence. Do not add it as a project dependency or report a missing CLI as a passing evaluation.

## Examples

```text
Request: "Add a portable database-review skill."
Result: create skills/<id>/ with SKILL.md and the canonical reference package, register it in
install/manifest.txt, add observable acceptance evidence, then run the narrow and install gates.
```

```text
Request: "Clarify an existing skill's trigger."
Result: check overlap and inbound links first, change only the source package, keep its manifest
registration stable when the ID and dependencies do not change, then verify the changed package.
```

## Limitations

This protocol governs reusable source packages, not runtime-specific copies or repository-specific behavior. Structural and dry behavioral checks prove their stated contracts only; copied, discovered, and executed evidence remain distinct.

## Troubleshooting

| Condition | Cause | Resolution |
|---|---|---|
| Source guidance conflicts with bundled guidance | The installed copy is older or a repository policy is higher authority. | Stop the conflicting edit, follow the higher-authority policy, and repair source drift in a separate reviewed change. |
| Optional evaluator is unavailable | The external CLI is not installed or its version is not pinned. | Record the gap; run repository gates and do not add the CLI as a project dependency. |
| Manifest or install gate fails | Package structure, registration, or dependency closure drifted. | Fix the source package and manifest together, then rerun the narrow gate before the full install matrix. |

## 7. Completion checklist

- [ ] Source package follows `skills/{skill-id}/SKILL.md + reference/principles.md + reference/kb/`.
- [ ] Frontmatter contains only a matching kebab-case `name` and a trigger-rich `description`.
- [ ] SKILL.md routes to principles and INDEX, loading only task-relevant topics.
- [ ] Every topic has required metadata, a clickable INDEX route, and a `## 리뷰 훅`.
- [ ] Manifest registration and recursive dependencies match the filesystem.
- [ ] No source rule assumes `.claude/`, a KO mirror, or a harness report exists.
- [ ] Structural, behavioral-contract, official-validator, and isolated-install evidence is recorded
      with any actual-runtime gaps stated explicitly.
- [ ] When the optional SkillEvaluator CLI was available, its tier, exit status, and report path are
      recorded separately from repository tests.
