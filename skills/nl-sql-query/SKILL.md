---
name: nl-sql-query
description: Use when a user asks a data question in natural language and wants the SQL built, executed (read-only), and results shown — for PostgreSQL/MySQL/MS-SQL via the nl-sql MCP. Explore the schema with tools, then author and run a dialect-appropriate SELECT and present the results.
---

# nl-sql-query — natural language → SQL query workflow

A repeatable workflow that takes the user's **natural-language data question**, explores the
DB schema with tools, authors and runs a **read-only SELECT** matched to the target dialect,
and then presents the results as a table. DB access is handled by the companion MCP server
`nl-sql`. This skill is a guide for **how to drive that MCP**, and does not reimplement DB
connection or query execution.

> **Authority**: the truth of the physical schema is the live DB, and `describe_table`/`search_objects`
> are the single source for it. Do **not** guess the schema — confirm it with tools before
> authoring. Dialect rules are in
> [`reference/kb/dialect-differences.md`](reference/kb/dialect-differences.md); the deeper
> rationale is in [`reference/principles.md`](reference/principles.md) ·
> [`reference/kb/`](reference/kb/INDEX.md).

## Invocation triggers
- **Natural-language data questions** such as "show me the counts by order status", "how many members signed up last month?", "the 10 posts with the most comments".
- "Build this question into SQL, run it, and show me the results."
- When the target DB is one of PostgreSQL / MySQL / MS-SQL and the `nl-sql` MCP is connected.

## Prerequisite: the `nl-sql` MCP must be installed and configured
- The `nl-sql` MCP connects to **a single DB**, configured with one `dialect` ∈ {postgres, mysql, mssql} plus connection info (read-only).
- Exposed tools: `list_schemas`, `list_tables`(schema), `describe_table`(schema, table → columns/types/NULL/defaults/PK/FK),
  `search_objects`(keyword → matching tables·columns), `run_select`(sql, params[] → runs a single read-only SELECT/WITH, automatic row cap, returns a markdown table), `explain_select`(sql → plan only; **not supported on MS-SQL** — SQL Server has no EXPLAIN, so it is rejected).
- The active dialect is reported by the server in the `run_select` description. Placeholder syntax differs by dialect (postgres `$1,$2` / mysql `?` / mssql `@p1,@p2`).
- If the MCP is absent or unconfigured, stop and point to the install guide (`mcp/nl-sql/README.md`). **Do not fabricate schema or results without the tools.**

## WORKFLOW — step-by-step procedure
1. **Confirm the target dialect/DB**: confirm the active dialect (postgres/mysql/mssql) from the `run_select` description or with the user. If you don't know the dialect, you're blocked at step 1 (wrong-dialect syntax fails immediately).
2. **Explore the schema**: map natural-language terms to the schema.
   - Use `search_objects(keyword)` to find candidate tables·columns from NL terms ("order", "member", "post").
   - Narrow the scope with `list_tables(schema)`, and pin down the **exact column names·types·NULL·PK/FK** with `describe_table(schema, table)`.
   - If a join is needed, confirm both tables' FKs with `describe_table`. (Procedure detail: KB `nl-to-sql-workflow`)
3. **Author a dialect-appropriate SELECT**: write identifier quoting·row limiting (`LIMIT` vs `TOP`/`OFFSET..FETCH`)·placeholders·pagination per the dialect rules (KB `dialect-differences`). Do not produce wrong-dialect syntax.
4. **Bind values as parameters**: literal values (search terms·dates·IDs, etc.) must **not be embedded by string concatenation** into the SQL — bind them via `params[]`. Placeholders follow the active dialect's syntax (`$1` / `?` / `@p1`).
5. **Execute**: run a single SELECT/WITH with `run_select(sql, params)`. If a heavy query is suspected, you can first check the plan with `explain_select(sql)` (skip it on MS-SQL, which is unsupported).
6. **Present the results**: present the result table + **the SQL used (code block)** + a row count/truncation indicator + a caution about estimates·assumptions (KB `result-presentation`).
7. **Handle empty results·errors**: if the result is 0 rows or a "no such column / ambiguous" error occurs, don't fix it by guessing — **re-confirm** the column names with `describe_table` and re-author. If the question is ambiguous, don't assume; ask 1–2 clarifying questions.

## Safety — read-only invariant
- This skill and the `nl-sql` MCP are **read-only**. `run_select` allows only SELECT/WITH and rejects writes·DDL·multi-statements.
- If the user requests INSERT/UPDATE/DELETE/DDL → **author the SQL and show it, but do not execute it.** Warn about the change's impact, advise that "this skill·MCP does not execute it, so review it with a separate tool/permission and run it yourself", and then **require user confirmation**.

## Key dialect differences (summary — details in the KB)
| Item | PostgreSQL | MySQL | MS-SQL |
|------|-----------|-------|--------|
| Identifier quoting | `"col"` | `` `col` `` | `[col]` |
| Row limiting | `LIMIT n` | `LIMIT n` | `TOP (n)` or `OFFSET m ROWS FETCH NEXT n ROWS ONLY` |
| Pagination | `LIMIT n OFFSET m` | `LIMIT m, n` / `LIMIT n OFFSET m` | `ORDER BY ... OFFSET m ROWS FETCH NEXT n ROWS ONLY` |
| Placeholders | `$1, $2` | `?` | `@p1, @p2` |
| String concatenation | `a \|\| b` | `CONCAT(a, b)` | `a + b` or `CONCAT(a, b)` |
| Current time | `now()` / `CURRENT_TIMESTAMP` | `NOW()` / `CURRENT_TIMESTAMP` | `SYSDATETIME()` / `GETDATE()` |

> `TOP` cannot be used together with OFFSET (MS-SQL pagination is `OFFSET..FETCH`). Details·date functions·booleans·identifier folding are in [`dialect-differences.md`](reference/kb/dialect-differences.md).

## Example (PostgreSQL — generic entity)
Question: "show me the order counts by status, most first"
```sql
SELECT status, COUNT(*) AS cnt
FROM "order"
GROUP BY status
ORDER BY cnt DESC
LIMIT 50;
```
Question: "find members whose email contains a given string" — bind the value via `params`:
```sql
-- params: ['%@example.com']
SELECT member_id, email, created_at
FROM member
WHERE email LIKE $1
ORDER BY created_at DESC
LIMIT 100;
```

## Verify
- [ ] Authored after **actually confirming** column names·types·PK/FK with `describe_table` (no guessing).
- [ ] Followed the active dialect's syntax exactly (quoting·row limiting·placeholders·pagination).
- [ ] Bound every literal value via `params[]` (no value injection by string concatenation).
- [ ] Ran only read-only SELECT/WITH with `run_select`. Writes·DDL were authored only, not executed.
- [ ] Presented the results together with **the SQL used** and a row count/truncation·estimate caution.
- [ ] On empty results·column misidentification, re-confirmed with `describe_table` and re-authored; on ambiguity, asked clarifying questions.

## Related
[[schema-doc-extract]] · `postgres-dba` · `nl-sql` MCP(`mcp/nl-sql/`)
