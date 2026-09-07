---
name: postgres-schema-design
description: >-
  Design and review PostgreSQL tables/schemas. Covers data modeling
  (entities·relationships·normalization), identifier strategy (natural/surrogate
  keys), constraints·integrity (PK/FK/UNIQUE/CHECK), type selection, history
  modeling, and naming conventions. Use when writing new table/migration DDL or
  reviewing an existing schema. Applies the principles of "Core Data Modeling,"
  validated against the official PostgreSQL documentation.
---

# PostgreSQL Schema Design

Official PostgreSQL `Data Definition`/`Constraints` documentation + data modeling insight.
See `reference/principles.md` for the underlying principles.

## Design/review order

1. **Identify what the data represents** (entities/relationships/attributes). Spot concepts from receipts, screens, and requirements.
2. **Apply data modeling principles** — `reference/kb/data-modeling.md`.
3. **Design integrity/constraints** — `reference/kb/constraints-integrity.md`.
4. **If history is needed**, choose a history model — `reference/kb/history-modeling.md`.
5. **Check naming conventions** — `reference/kb/naming-standards.md`.
6. Present the DDL, and for a change also review safety with the **risk-check skill**.

## Quick checklist (HIGH-and-above candidates)

### Integrity (most important — non-negotiable)
- [ ] **Does every table have a PK.**
- [ ] **Is NOT NULL the default.** Allow NULL only for genuinely optional columns.
- [ ] **Does every relationship have an FK.** Does the `ON DELETE` behavior match the meaning (CASCADE/RESTRICT/SET NULL).
- [ ] **Is there an index on the FK column.** PG does not create one automatically → full scan on parent DELETE/UPDATE.
- [ ] **Does the natural key (business uniqueness) have a UNIQUE constraint.** Relying only on a surrogate key lets duplicates pile up.
- [ ] **Are domain rules enforced with CHECK** (`amount >= 0`, status value sets, period `start <= end`).

### Types
- [ ] Money is `numeric` (no floating point). Identifiers are `bigint`/`GENERATED AS IDENTITY`.
- [ ] Timestamps are `timestamptz` (recommended). Date-only is `date`. (Make the application TZ assumption explicit.)
- [ ] Codes/enumerations: code table + FK (extensibility) or `enum`. Booleans are `boolean`.
- [ ] Semi-structured data is `jsonb` (+GIN). **Do not abuse jsonb to avoid normalization.**
- [ ] Derived/computed columns are `GENERATED ALWAYS AS (...) STORED`.

### Modeling
- [ ] Is normalization the default. **For denormalization, are the performance rationale + consistency-maintenance plan both documented.**
- [ ] Are many-to-many relationships resolved with an associative entity.
- [ ] Is the trade-off of the super/subtype (generalization) choice (weakened integrity) understood.
- [ ] Is the same fact not stored redundantly in two places (if redundant, document it + assign sync responsibility).

### Identifiers
- [ ] Is the PK stable (does its value never change). If it is a changing natural key, introduce a surrogate key.
- [ ] Exposing a sequential integer as an externally visible identifier risks guessing → if needed, separate a UUID/public ID.

## Standard DDL skeleton (reference)

```sql
CREATE TABLE orders (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_no     text        NOT NULL,                 -- natural key
    customer_id  bigint      NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    status       text        NOT NULL DEFAULT 'OPEN'
                 CHECK (status IN ('OPEN','PAID','CANCELLED','SHIPPED')),
    total_amount numeric(15,2) NOT NULL CHECK (total_amount >= 0),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_no)                                  -- business uniqueness
);
CREATE INDEX ON orders (customer_id);                  -- FK index (required)
CREATE INDEX ON orders (status, created_at);           -- query pattern
```

## Deliverable

For each finding: the violated modeling quality attribute/PG constraint rule → reason → corrected DDL → consistency verification method.
Self-assess the design against the 6 quality attributes: **requirements (completeness)·correctness·non-redundancy·clarity·flexibility·readability**.

## KB (official PostgreSQL docs — read and cite first)
From `reference/kb/INDEX.md`, pick the KB matching the design topic and read it, check against each KB's `## Review hooks`,
and cite via the `source` URL.
- `reference/kb/data-modeling.md` — ER theory, normalization, generalization/integration, identifier strategy
- `reference/kb/constraints-integrity.md` — PK/NOT NULL/FK (+index)/UNIQUE/CHECK/EXCLUDE, NULL handling
- `reference/kb/history-modeling.md` — point/interval history, preventing period overlap (range+EXCLUDE), audit columns
- `reference/kb/naming-standards.md` — naming·data standardization·domain types
- Higher-level judgment criteria: `reference/principles.md`
