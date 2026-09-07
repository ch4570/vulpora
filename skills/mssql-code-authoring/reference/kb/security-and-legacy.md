# Security and legacy constraints

## Official sources

- [Secure SQL Server](https://learn.microsoft.com/en-us/sql/relational-databases/security/secure-sql-server?view=sql-server-ver17)
- [Database-level roles](https://learn.microsoft.com/en-us/sql/relational-databases/security/authentication-access/database-level-roles?view=sql-server-ver17)
- [Server-level roles](https://learn.microsoft.com/en-us/sql/relational-databases/security/authentication-access/server-level-roles?view=sql-server-ver17)
- [Deprecated Database Engine features](https://learn.microsoft.com/en-us/sql/database-engine/deprecated-database-engine-features-in-sql-server-2025?view=sql-server-ver17)
- [End-of-support options](https://learn.microsoft.com/en-us/sql/sql-server/end-of-support/sql-server-end-of-support-overview?view=sql-server-ver17)
- [Upgrade SQL Server](https://learn.microsoft.com/en-us/sql/database-engine/install-windows/upgrade-sql-server?view=sql-server-ver17)
- [Compatibility certification](https://learn.microsoft.com/en-us/sql/database-engine/install-windows/compatibility-certification?view=sql-server-ver17)

## Least privilege and injection

- Grant the application only required object/schema permissions through narrowly scoped user-defined roles. Do not
  use `db_owner`, `securityadmin`, or `sysadmin` to solve deployment friction.
- Separate migration identity from runtime identity. Make every `GRANT`, `DENY`, and ownership-chain assumption
  reviewable and reversible.
- Parameterize values. For dynamic identifiers, enforce a closed allowlist and `QUOTENAME`; quoting alone does not
  authorize an arbitrary identifier.
- Never expose connection strings, credentials, login hashes, encryption keys, or unmasked production data in plans,
  logs, fixtures, or reports.

## High-risk legacy surfaces

Treat these as separate security/architecture work, not ordinary query authoring:

- `xp_cmdshell`, OLE Automation, unsafe CLR, external scripts, and ad hoc distributed queries
- linked servers, cross-database ownership chaining, `TRUSTWORTHY`, impersonation, and broad certificate permissions
- replication, CDC, Service Broker, SQL Agent jobs, triggers, and vendor-owned stored procedures
- disabling constraints, triggers, auditing, encryption, or backup/recovery controls

Do not enable or broaden any of them without explicit authority, threat analysis, rollback, and operational ownership.

## Legacy lifecycle

- Record engine build/service pack/CU, edition, OS/deployment, compatibility level, and Microsoft support status.
- A retained legacy compatibility level can reduce application change during an engine upgrade, but it does not
  protect every discontinued T-SQL or external component. Run functional certification.
- Do not use deprecated features in new work. Inventory existing use through official counters/Extended Events or
  migration tooling when authorized, then plan staged replacement.
- Do not silently rewrite vendor SQL or objects whose support contract forbids customization.
- Distinguish SQL Server, Azure SQL Database, and Managed Instance. Server roles, Agent, linked servers, cross-database
  behavior, backup/restore, and feature availability are not interchangeable.

## Upgrade-safe handoff

For an upgrade-related change, deliver current/target support facts, compatibility strategy, discontinued/deprecated
inventory, Query Store or workload baseline, functional test scope, performance recertification, rollback/fallback,
and ownership. A compatibility-level increase is its own deployable and testable change.
