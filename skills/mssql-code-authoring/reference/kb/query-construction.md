# Query construction

## Official sources

- [sp_executesql](https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-executesql-transact-sql?view=sql-server-ver17)
- [Query processing architecture](https://learn.microsoft.com/en-us/sql/relational-databases/query-processing-architecture-guide?view=sql-server-ver17)
- [Data types](https://learn.microsoft.com/en-us/sql/t-sql/data-types/data-types-transact-sql?view=sql-server-ver17)
- [Date and time types](https://learn.microsoft.com/en-us/sql/t-sql/functions/date-and-time-data-types-and-functions-transact-sql?view=sql-server-ver17)
- [rowversion](https://learn.microsoft.com/en-us/sql/t-sql/data-types/rowversion-transact-sql?view=sql-server-ver17)
- [Table hints](https://learn.microsoft.com/en-us/sql/t-sql/queries/hints-transact-sql-table?view=sql-server-ver17)

## Parameters and dynamic SQL

- Bind values through the driver or typed `sp_executesql` parameters. Match length, precision, scale, Unicode, and
  nullability to the referenced column to avoid implicit conversions and incorrect plan estimates.
- Never insert data values into SQL text, even when wrapping the final text in `sp_executesql`.
- SQL parameters cannot represent table, column, sort-direction, or keyword identifiers. Resolve each identifier from
  a closed application allowlist, then apply `QUOTENAME`; reject unknown values.
- Keep owner/schema qualification explicit. Do not use caller-controlled database or server names.

## Result and predicate shape

- Select explicit columns. Preserve API/mapper expectations but do not widen the result with `SELECT *`.
- Use a stable, unique tie-breaker in every ordered page. Gate `OFFSET/FETCH`, window functions, and other syntax on
  the proven engine/compatibility floor; use a repository-supported alternative when necessary.
- Keep indexed columns bare when possible. Avoid functions, arithmetic, and implicit type/collation conversion on the
  column side of a predicate.
- Express date ranges as half-open intervals when that matches the domain. Do not cast a datetime column merely to
  compare its date portion if a range predicate can remain SARGable.
- Avoid scalar row-by-row patterns and correlated work when a proven set-based equivalent preserves semantics.

## SQL Server-specific traps

- Do not add `NOLOCK`/`READUNCOMMITTED` to hide blocking. Dirty, missing, or duplicated reads are observable semantic
  changes, and queries still acquire schema stability locks.
- Prefer explicit `INSERT`, `UPDATE`, and `DELETE` flows over introducing `MERGE` into an unproven legacy concurrency
  path. Reuse `MERGE` only when repository conventions, target version, locking semantics, and concurrency tests prove
  it safe.
- `GO` is a client-tool batch separator, not T-SQL. Emit it only when the proven migration runner supports it.
- Terminate statements consistently, especially before a common table expression.

## Data type intent

- Use `datetime2` for new wall-clock timestamps and `datetimeoffset` when the offset is part of the domain. Preserve
  existing `datetime` behavior unless migration compatibility is in scope.
- Use `rowversion` only as an 8-byte database-local change token. It is neither UTC nor a creation/update timestamp;
  do not use the deprecated `timestamp` spelling for new work.
- Use `nvarchar` and `N'...'` literals when Unicode is required. Match lengths; an oversized or mismatched parameter
  can alter conversions and plans.
- Use `decimal(p,s)`/`numeric(p,s)` for exact decimal domains. Do not use `float` for equality-sensitive money or
  accounting values.
- Treat `uniqueidentifier` width and insertion order as index-design inputs. Do not assume generated values are
  sequential or an ideal clustered key.
- Treat `IDENTITY` as surrogate generation, not a gapless business sequence or commit-order clock.

## Verification

Test null, boundary, Unicode/collation, skewed parameter, empty-set, duplicate, and concurrent-change cases. Verify
the application mapping and parameter metadata, not only the SSMS result grid.
