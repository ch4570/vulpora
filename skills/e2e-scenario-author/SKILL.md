---
name: e2e-scenario-author
description: Generate or refresh a source-validated E2E scenario catalog for Spring JVM or NestJS after endpoints/listeners change. Authoring only; does not execute tests.
---

# E2E Scenario Author — Catalog Generation Protocol

This skill is **normative**. **MUST / MUST NOT / SHOULD** carry RFC-2119 meaning. Rules are cited by ID (`SCA-n`).

> **Authority**: [`AGENTS.md`](../../../AGENTS.md) is binding. This skill writes a project-wide *shared* document (`docs/e2e-scenarios/catalog.md`), so its output is reviewable in PRs alongside the code change that triggered it.

> **Shared contract**: [`docs/e2e-scenarios/CONTRACT.md`](../../../docs/e2e-scenarios/CONTRACT.md) is the project SSOT. When it is absent, copy the bundled version-1 source at [`reference/e2e-scenario-contract.md`](reference/e2e-scenario-contract.md) once. If the project copy already exists, never overwrite or repair it silently. If this skill disagrees with the project contract, the project contract wins.

> **Reference loading:** The SCA rules below and project contract govern authoring. Read
> [surface discovery](reference/kb/api-surface-discovery.md) for supported framework extraction;
> [boundary cases](reference/kb/boundary-and-negative-cases.md) only for constraint classification, and
> [idempotent scenarios](reference/kb/idempotent-scenarios.md) only for mutation/teardown design.
> Read [principles](reference/principles.md) only for rationale, and [the KB index](reference/kb/INDEX.md)
> only for an unresolved topic. MUST NOT recursively load the entire KB.

---

## A. Boundary

**SCA-1 (Write targets) — MUST.** Repository writes are limited to:
- `docs/e2e-scenarios/CONTRACT.md` — copied from the bundled contract only when missing; never overwritten.
- `docs/e2e-scenarios/catalog.md` — atomically replaced only after the complete candidate passes validation twice.
- `docs/e2e-scenarios/notes.md` — created only if missing; never overwritten.

Candidate generation uses an owned temporary directory outside the repository and cleans it on every exit. No slug
sidecar is allowed: IDs must be reproducible from source evidence alone.

**SCA-2 (No execution) — MUST NOT.** This skill MUST NOT call `curl`, `gradle`, `docker`, or any other command that triggers a test run. Execution is `e2e-runner`'s responsibility.

**SCA-3 (Generate, validate, replace) — MUST.** Regenerate the complete catalog into a fresh candidate, run
`scripts/discover-surfaces.js <repository-root> docs/e2e-scenarios/CONTRACT.md` into an owned temporary inventory,
then run `scripts/validate-catalog.js <candidate> docs/e2e-scenarios/CONTRACT.md <inventory>` and the determinism
check there before atomically replacing the catalog. Never write a partial candidate and never restore from `git`;
a failed run leaves the previous working-tree bytes untouched.

**SCA-4 (Reports out of scope) — MUST NOT.** This skill MUST NOT write to `test-report/`. Reports are produced by `e2e-runner` and `e2e-report-renderer`.

---

## B. Generation procedure

**SCA-5.0 (Repository profile) — MUST.** Detect the repository profile before enumerating surfaces. Supported
profiles are:

| Profile | Required repository evidence |
|---|---|
| `spring-jvm` | Gradle/Maven build with Spring Web or Spring Kafka evidence and discovered `*/src/main/kotlin` or `*/src/main/java` roots |
| `node-nestjs` | A `package.json` containing both `@nestjs/common` and `@nestjs/core`, with TypeScript files under that package's `src/` root |

Discover module names and source roots from settings/build/package files; never assume `app-api`, `app-worker`, a
language, package manager, or fixed directory depth. Spring evidence takes precedence in mixed repositories. If no
supported profile is proven, stop with `SCA-5.0: unsupported repository profile` and do not create an empty catalog.

**SCA-5 (Source enumeration) — MUST.** Enumerate the API surface from code, not from memory. Apply the matching
patterns to every discovered source root:

| Surface | rg pattern (initial; tune per discovery) |
|---|---|
| HTTP — direct mapping | `rg -n '@(Get\|Post\|Put\|Delete\|Patch)Mapping' <discovered-source-roots>` |
| HTTP — class-level only | `rg -n '@RequestMapping' <discovered-source-roots>` (then filter classes with no method-level mapping) |
| HTTP — composed meta-annotations | `rg -n '@(RestController\|Controller)' <discovered-source-roots>`, then resolve referenced annotations |
| Kafka | `rg -n '@KafkaListener(?:s)?\|@RetryableTopic' <discovered-source-roots>` |
| Outbox handlers | `rg -n 'OutboxEventHandler<' <discovered-source-roots>` |
| Outbox publishers | `rg -n 'OutboxEvent(?:Publisher\|Saver)\|outboxRepository' <discovered-source-roots>` |
| NestJS HTTP | `rg -n '@Controller\|@(Get\|Post\|Put\|Delete\|Patch)' <discovered-source-roots>` |
| NestJS bootstrap | `rg -n 'setGlobalPrefix\|useGlobalPipes.*ValidationPipe' <discovered-source-roots>` |
| NestJS local auth | `rg -n '@UseGuards\|UseGuards\(' <discovered-source-roots>`; resolve project decorators that wrap it |

For each match, read the surrounding class to determine: HTTP method, full path, request body shape, response shape,
authentication assumption, and outbox/event topic property. For Spring, combine class-level `@RequestMapping` with
the method mapping. For NestJS, combine statically resolved `setGlobalPrefix`, `@Controller`, and method mapping.
Authentication is source-backed only when expressed by a local annotation/decorator such as `@PreAuthorize`,
`@UseGuards`, or a project decorator whose definition wraps `UseGuards`; do **not** infer it from global security
configuration. NestJS class-validator constraints count only when a global or handler-local `ValidationPipe` is
proven from source.

**SCA-5.1 (Path constant resolution) — MUST.** When a mapping or NestJS global prefix uses a constant or property
placeholder (`@GetMapping(Endpoints.ARTICLES)` / `@GetMapping("${api.articles.path}")` /
`app.setGlobalPrefix(API_PREFIX)`), resolve it by reading the referenced constant declaration or repository config
value at the catalog SHA. If resolution requires runtime context (profile-dependent, computed at boot), generation
MUST fail with a precise error citing the file and unresolved expression. Silent fallback to the literal expression
is forbidden.

**SCA-5.2 (Hard fail on unreadable source) — MUST.** A parse failure, a missing referenced symbol, or an unresolved topic property MUST stop generation immediately with an error of the form `SCA-5.2: <path>:<line>: <reason>`. The catalog is not overwritten on failure.

**SCA-6 (Deterministic scenario ID) — MUST.** Every scenario receives an ID of the form
`E2E-{AREA}-{TARGET}-{BEHAVIOR}`. Derive `AREA` from source evidence rather than a domain allowlist:

- HTTP: first stable route segment after conventional `api` and version segments.
- Kafka/outbox: stable topic, event, or handler owner token.
- Health/management: the first stable management path segment.

If no stable token exists, fail with the source location. Do not collapse unrelated surfaces into `MISC`.

**SCA-6.1 (TARGET and BEHAVIOR derivation) — MUST.** Derive the remaining ID tokens deterministically:

1. `TARGET` starts with the HTTP method or async action and includes only route tokens needed to distinguish two
   surfaces in the same area.
2. Preserve path-variable names as tokens (`/{userId}` → `BY-USER-ID`) so collection and item routes differ.
3. `BEHAVIOR` is `HAPPY`, `AUTH-FAIL`, `NOT-FOUND`, `CONFLICT`, `CONSUME`, `PUBLISH`, or `DLQ`.
4. For validation behavior, append the constrained field and boundary, such as
   `VALIDATION-FAIL-SIZE-MIN` or `VALIDATION-FAIL-NAME-NOT-BLANK`.

Historical hand-written slug overrides and sidecars are forbidden; source-derived IDs are the only stable mapping.

**SCA-6.2 (Duplicate-ID hard fail) — MUST.** If two surfaces derive the same
`E2E-{AREA}-{TARGET}-{BEHAVIOR}` ID, generation MUST fail with both source locations cited. The catalog is not overwritten on duplicate ID.

**SCA-7 (Per-surface scenario floor) — MUST.** This is normative, not advisory. The checklist and the rule MUST agree.

For every:

| Surface | Required scenarios |
|---|---|
| HTTP endpoint | one happy-path (`HAPPY`); plus one `AUTH-FAIL` if the endpoint or its class carries `@PreAuthorize`, `@Secured`, `@UseGuards`, or a source-resolved project auth annotation/decorator |
| HTTP endpoint with `@Min`/`@NotBlank`/`@Valid` etc. on the request | one `VALIDATION-FAIL` per declared constraint group |
| Kafka listener | one `CONSUME` scenario |
| Kafka listener with retry/DLQ wiring (`@RetryableTopic` or `errorHandler` reference) | one additional `DLQ` scenario |
| Outbox handler (worker) | one `CONSUME` and (if the handler publishes downstream) one `PUBLISH` |
| Outbox publisher (api) | one `PUBLISH` scenario asserting the outbox row is written |

Boundary / negative scenarios beyond the above are emitted only when the controller code itself shows the constraint. Do not invent negative paths that the code does not enforce.

**SCA-8 (Preconditions are explicit) — MUST.** When a scenario depends on system state that the test itself does not set up (existing OpenSearch index, Kafka topic, feature flag, seeded user), the `Preconditions` row MUST use one of the formal predicates defined in [`CONTRACT.md §4`](../../../docs/e2e-scenarios/CONTRACT.md). Free-text preconditions are forbidden — they cannot be probed.

**SCA-9 (Dependency declaration) — MUST.** Use the array form defined in [`CONTRACT.md §3`](../../../docs/e2e-scenarios/CONTRACT.md):

- `Depends-on: [<ID>, <ID>]` — array even for a single dependency. Literal `—` if independent.
- `Captures: <KEY>, <KEY>` — comma-separated identifiers matching `^[A-Z][A-Z0-9_-]*$`. Literal `—` if none.

The singular `depends-on: <ID>` form from earlier drafts is **forbidden** and rejected by the runner (`RUN-6.1`).

---

## C. Catalog file shape

**SCA-10 (Header) — MUST.** Compute one SHA-256 over the normalized bytes of every discovered source/config file,
their repository-relative paths, the detected profile, and the project contract. The first lines are:

```markdown
<!-- AUTO-GENERATED by e2e-scenario-author. DO NOT EDIT. Human notes belong in docs/e2e-scenarios/notes.md. -->
<!-- Source fingerprint: sha256:{64-lowercase-hex} -->
<!-- Contract: docs/e2e-scenarios/CONTRACT.md version 1 -->

# E2E Scenario Catalog

> Single source of truth for E2E coverage. Regenerate with `e2e-scenario-author`, execute with `e2e-runner`, and publish with `e2e-report-renderer`.
```

**SCA-11 (Scenario block format) — MUST.** Every scenario follows the exact key set, order, and spelling defined in [`CONTRACT.md §1`](../../../docs/e2e-scenarios/CONTRACT.md). The contract wins on disagreement. Read the [worked scenario example](reference/catalog-example.md) only when
the fixed-key contract is insufficient to determine the output shape.

The key spellings MUST NOT change — `e2e-runner` parses by these literal keys.

**SCA-11.1 (Stable ordering & normalization) — MUST.** Sort complete scenario IDs lexicographically. Normalize
line endings to LF, strip trailing whitespace, end the file with one newline, and place exactly one blank line
between blocks.

Without this, `SCA-13` cannot guarantee byte-identical regeneration.

**SCA-12 (Executable fences) — MUST.** Every scenario has exactly one primary executable fence whose info string is
`http`, `sql`, or `shell`. A mutating scenario has one optional `shell` teardown fence after the primary; for a
mutating scenario that optional position is required. Its first non-blank line is `# teardown`. The runner executes
it with finally semantics even when the primary fails or times out. Read-only scenarios have no teardown fence;
SQL remains read-only.

---

## D. When to run

| Trigger | Action |
|---|---|
| Adding/removing/renaming any Spring `@*Mapping`, NestJS `@Controller`/HTTP method decorator, `@KafkaListener`, `@RetryableTopic`, or `OutboxEventHandler` | Re-run this skill in the **same PR** as the code change |
| Refactor that does not change HTTP method/path/body/response | No re-run required |
| Renaming a query/path parameter (changes `Dataset`) | Re-run |
| Adding `@PreAuthorize` / removing `@Min`-style validation | Re-run (changes the per-surface floor under `SCA-7`) |
| Before opening a PR touching a discovered supported source root or fixture/config input | Re-run and carry the catalog diff alongside |

Carrying the catalog diff in the same PR is **strongly recommended** — it lets reviewers see, in one place, how the API contract changed and which E2E coverage moved with it.

---

## E. Output discipline

**SCA-13 (Determinism check) — MUST.** Generate two independent candidates from the same normalized source set and
contract. Compare the complete bytes, including the source fingerprint header. If they differ, delete owned
candidates and fail with `SCA-13: non-deterministic generation; <N> diff lines; first divergence at <line>`.
Do not touch the existing catalog. On equality, validate once more and atomically replace it.

A non-deterministic generation is a bug in the skill, not a permitted state.

**SCA-14 (No catalog hand-edit recovery) — MUST.** If a teammate hand-edits the catalog, the next run overwrites those edits. The skill does not attempt to detect or preserve them. Communicate to teammates via the `DO NOT EDIT` header.

**SCA-15 (Self-validation pass) — MUST.** Before replacing the catalog, run
`node scripts/validate-catalog.js <candidate> docs/e2e-scenarios/CONTRACT.md <inventory>`. A non-zero result deletes
only owned candidate/inventory files and leaves the prior catalog untouched. The validator rejects:

| Check | Failure code |
|---|---|
| Any scenario block missing one of the keys from [`CONTRACT.md §1`](../../../docs/e2e-scenarios/CONTRACT.md) | `SCA-15.MISSING-KEY` |
| Key spelling deviates from the contract | `SCA-15.KEY-SPELL` |
| A `Preconditions` value not matching the grammar in [`CONTRACT.md §4`](../../../docs/e2e-scenarios/CONTRACT.md) | `SCA-15.BAD-PRECOND` |
| `Depends-on` not an array | `SCA-15.DEP-CARDINALITY` |
| Cycle in the `Depends-on` graph | `SCA-15.DEP-CYCLE` |
| `Mutates` value not matching [`CONTRACT.md §6`](../../../docs/e2e-scenarios/CONTRACT.md) | `SCA-15.BAD-MUTATES` |
| Duplicate scenario ID (also `SCA-6.2`) | `SCA-15.DUP-ID` |
| Invalid primary/teardown count or type | `SCA-15.BAD-FENCE-COUNT` / `SCA-15.BAD-TEARDOWN` |
| Mutating HTTP without `Mutates`, SQL mutation, or chained shell command | `SCA-15.MISSING-MUTATES` / `SCA-15.SQL-MUTATION` / `SCA-15.BAD-PRIMARY-SHELL-CONTROL` / `SCA-15.BAD-TEARDOWN-CONTROL` |
| Teardown does not reference a declared resource or capture | `SCA-15.BAD-TEARDOWN-REFERENCE` |

This is the structural lint the runner relies on. Without it, an authoring typo silently corrupts the next test run.

**SCA-16 (No real data in catalog) — MUST.** `Dataset` and `Preconditions` values MUST be synthetic. Forbidden:

- Real user IDs, real `memberId`, real phone numbers, emails, RRNs.
- Production OpenSearch index names that differ from the local-compose seed.
- Production-only feature-flag values.

Use only values actually discovered in repository-owned test fixtures, or symbolic `{{seed.TOKEN}}` references
whose probe is declared in `Preconditions`. Never invent a numeric seed range. If no synthetic source exists,
omit the scenario from executable output, report the source location as an authoring gap, and leave human context in `notes.md`.

**SCA-17 (Idempotency declaration) — MUST.** Every scenario MUST declare `Mutates` per [`CONTRACT.md §6`](../../../docs/e2e-scenarios/CONTRACT.md). The author MUST follow these rules when deciding which form to emit:

- Pure GET endpoints → `Mutates: —`.
- POST/PUT/PATCH/DELETE endpoints, Kafka publishers, and any outbox handler → `Mutates: <resource>` with at least one resource listed.
- Every mutating scenario MUST include the `shell` teardown fence from `SCA-12`; ordering it last is not cleanup.
- The teardown references the declared resource or a captured identifier and starts with `# teardown`.
- Teardown uses one allowlisted command per line; shell chains, pipes, redirections, substitutions, and continuations are forbidden.

`SCA-15` rejects any non-`—` `Mutates` value without a valid teardown. The runner executes cleanup even after
primary failure and reports cleanup failure as scenario failure.

**SCA-18 (Contract reference is normative) — MUST.** The skill MUST treat [`CONTRACT.md`](../../../docs/e2e-scenarios/CONTRACT.md) as a normative input. A `contractVersion` bump (recorded in the contract header) is a coordinated three-skill PR; this skill alone cannot raise the version. If the contract version on disk is newer than the version the skill recognizes, generation MUST stop with `SCA-18: contract version N > skill-supported N-1`.

**SCA-19 (Source inventory coverage) — MUST.** The candidate and validator MUST consume the exact canonical
`vulpora.e2e-surface-inventory/v1` emitted by `scripts/discover-surfaces.js` for that generation. The catalog
fingerprint must equal the inventory fingerprint. Every catalog `Target` must equal one discovered target after
inline-code/whitespace normalization, and every surface/required-behavior pair must have a scenario on that target
whose ID ends in the behavior token. Reject stale fingerprints, duplicate source identities, catalog-only targets,
and missing floor coverage with `SCA-19.FINGERPRINT-MISMATCH`, `SCA-19.DUP-SURFACE|DUP-TARGET`,
`SCA-19.EXTRA-TARGET`, or `SCA-19.MISSING-COVERAGE`. An agent checklist or prose claim cannot satisfy this rule.

---

## Checklist

- [ ] Candidate validated twice, then catalog atomically replaced; header carries source fingerprint and contract version (`SCA-3`, `SCA-10`, `SCA-13`)
- [ ] Every endpoint, listener, and outbox handler meets its per-surface floor in the bound inventory (`SCA-7`, `SCA-19`)
- [ ] Scenario IDs preserve route variables and validation constraint tokens and regenerate identically (`SCA-6`, `SCA-6.1`, `SCA-6.2`, `SCA-13`)
- [ ] `Preconditions` use the formal grammar; `Depends-on` is an array; `Captures` are uppercase tokens (`SCA-8`, `SCA-9`, `CONTRACT.md §1, §3, §4`)
- [ ] Scenario blocks use fixed keys, one primary fence, and at most one shell teardown (`SCA-11`, `SCA-12`)
- [ ] Every mutating scenario has finally-style teardown; no last-in-area exception remains (`SCA-17`)
- [ ] `Dataset` and `Preconditions` carry no real-user / real-PII data (`SCA-16`)
- [ ] Inventory-bound self-validation pass clean (`SCA-15`, `SCA-19`); determinism diff clean (`SCA-13`)
- [ ] No write to `test-report/`; `notes.md` left untouched if it exists (`SCA-1`, `SCA-4`)
- [ ] Contract version on disk matches skill-supported version (`SCA-18`)
