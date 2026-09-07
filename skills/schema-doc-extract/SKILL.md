---
name: schema-doc-extract
description: Generate or refresh a Mermaid ERD and per-schema table specifications from migration SQL and ORM code. Static extraction only; no live database.
---

# schema-doc-extract — schema documentation extraction workflow

Reads Flyway migration SQL and the entity/ORM definitions in code **statically** (without a live DB connection),
builds a cumulative schema model, then writes two artifacts to files: (1) a Mermaid `erDiagram` ERD,
(2) per-table Markdown specifications. This skill is the **procedural engine** invoked by the `schema-cartographer` agent.
The output format is fixed: **Mermaid erDiagram + Markdown table specification**.

> **Authority**: migration SQL is the **single source of truth for the physical schema**. Code (ORM) is the basis for intent, naming, and
> relationships, but it can drift (diverge). On conflict, the physical schema follows the migrations, and the divergence is **noted in the drift section**.
> Deeper rationale: [`reference/principles.md`](reference/principles.md), [`reference/kb/`](reference/kb/INDEX.md).

## Invocation triggers
- "Draw / refresh the ERD", "Create the table specification docs", "Bring the schema docs up to date".
- When migrations/entities have changed and the ERD/specs need to be regenerated.
- When the `schema-cartographer` agent performs a schema cartography task.

## INPUTS — input-source detection (generic, no live DB)
Assume you don't know the project structure and **detect generically with Glob/Grep**.

| Target | Detection method |
|------|-----------|
| Flyway migrations | Glob `**/db/migration/**/*.sql`, `**/migration/**/*.sql`, `**/V*__*.sql`, `**/R__*.sql` |
| Entity/ORM code | Grep `@Entity` / `@Table` (JPA · Kotlin/Java), or the ORM model declaration |
| Schema/table comments | SQL `COMMENT ON TABLE/COLUMN`, entity KDoc/JavaDoc, `@Comment` |
| enum values | SQL `CHECK (... IN (...))` · enum types, code `@Enumerated(EnumType.STRING)` enum classes |

- If there are zero matches, stop and ask the user for the path. **Do not invent a schema by guessing.**

## WORKFLOW — step-by-step procedure
1. **Locate the sources**: collect the list of migration files and the list of entity files using the Glob/Grep above.
2. **Replay in version order**: apply versioned migrations cumulatively in **ascending version order** to build the *cumulative schema model*.
   Do not look at only the latest file. Apply `CREATE/ALTER/DROP TABLE`, `ADD/DROP COLUMN`, indexes, constraints, and comments in sequence.
   Repeatable (`R__`) migrations overwrite at the end (view/function definitions).
3. **Enrich with ORM metadata**: from the entities, fill in table/column logical names, KDoc descriptions, enum candidates, and associations (FK intent).
4. **Reconcile drift**: for the physical schema (column types · NULL · constraints), **the migration wins**. Items that diverge from the code are not discarded but **flagged as drift** (e.g. a column present in the code but absent from the migration).
5. **Infer relationships and cardinality**: draw a relationship **only when there is FK evidence** (SQL `FOREIGN KEY`/`REFERENCES`, or an explicit `@ManyToOne`/join column). For a nullable FK use `o` (0..1), and for a NOT NULL FK use `|` (1) to set cardinality. Do not draw relationships without evidence.
6. **Render the Mermaid erDiagram**: draw every table as an entity, and FK-backed relationships as crow's-foot (KB `mermaid-erdiagram-syntax`).
7. **Render the Markdown table specification**: per table, a `Column | Type | NULL | Default | Key | Description` table + Index/Constraint/Relationship sub-sections (KB `output-layout`).
8. **Group by schema, then write files**: group tables **by schema**, and write **one** `tables/<schema>.md` file per schema. Also refresh the entry point `tables/_index.md` and the full ERD `erd.md`. Write everything deterministically and idempotently (same input → same files, diffable).

## OUTPUT LAYOUT — default output paths
The table specifications are split into **one file per schema** (`tables/<schema>.md`). Don't cram every table into a single file — as schemas grow, the diff scope stays confined to that schema's file, and discovery/ownership become clear.

```text
docs/schema/
├── erd.md              # Mermaid erDiagram block (full ERD — all schemas / cross-schema relationships)
└── tables/
    ├── _index.md       # schema index (schema → table count · link) + global drift summary
    ├── public.md       # table specification for the public schema + that schema's drift section
    └── <schema>.md     # one file per schema (schema name, alphabetical)
```

### Splitting rules (MUST)
- **1 schema = 1 file**: each `tables/<schema>.md` contains only the specifications of the tables belonging to that schema. Drift is likewise **limited to that schema's tables** and placed in the `## Drift` section at the bottom of that file.
- **Keep the directory form even for a single schema**: even if every table is in `public` alone, write it as `tables/public.md` (determinism · extensibility). The legacy single `tables.md` is no longer used (see migration note below).
- **Filename = schema name**: the lowercase identifier as-is (`public.md`, `order.md`). Replace characters that can't be used in an identifier with `_`, and note the original schema name in `_index.md`.
- **Keep the ERD single**: because relationships cross schema boundaries, keep the full ERD as a single `erd.md` (don't split it into per-schema ERDs).
- **`_index.md` is the entry point**: keep only the schema list · each schema's table count · file links + the **global drift summary (counts)** (detailed drift lives in each schema file).
- **Fixed ordering**: the index/file list is in **alphabetical schema-name order**, and within each file in **alphabetical table-name order** (diff stability). Columns keep the migration declaration order.
- If the project already uses a different root such as `docs/erd/`, follow that root, but apply the same `tables/<schema>.md` splitting rules underneath it. The default root is `docs/schema/` above.

> **Legacy migration**: if an existing single `docs/schema/tables.md` exists, split it by schema into `tables/<schema>.md` and remove the old `tables.md` (or leave only a one-line pointer to `tables/_index.md`). If the caller explicitly requests a single file, that instruction takes precedence.

## Output examples

Read [worked ERD and table examples](reference/output-examples.md) only when the output shape is unclear.
For ordinary extraction, follow the layout and splitting contract above without loading the examples.

## Verify
- [ ] The ```mermaid block in erd.md parses syntactically (erDiagram header + entity blocks + relationship lines).
- [ ] **Every table** present in the migrations appears in the ERD and in the specification file (of the schema that table belongs to).
- [ ] The table specifications are split into **one file per schema** (`tables/<schema>.md`), with no other schema's tables mixed into a file.
- [ ] `tables/_index.md` exists, links every schema file in alphabetical order, and the table counts match reality.
- [ ] No legacy single `tables.md` was left behind (if one existed, it was split and removed, or only a pointer remains).
- [ ] Relationships are drawn only when there is FK evidence (no inferred relationships without evidence).
- [ ] **A Drift section always exists in every schema file** (if there is no divergence, "no drift detected").
- [ ] Re-running with the same input produces the same files (fixed ordering/format, diffable).

## Related
[[flyway]] · [[entity]] · `schema-cartographer` · `postgres-schema-design`
