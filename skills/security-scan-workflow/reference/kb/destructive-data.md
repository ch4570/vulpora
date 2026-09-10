---
title: Shared database and Redis destructive-operation review
source: https://redis.io/docs/latest/commands/flushdb/
sources:
  - uri: https://redis.io/docs/latest/commands/flushall/
  - uri: https://redis.io/docs/latest/commands/scan/
  - uri: https://docs.spring.io/spring-data/commons/docs/current/api/org/springframework/data/repository/CrudRepository.html
  - uri: https://docs.spring.io/spring-data/jpa/reference/api/java/org/springframework/data/jpa/repository/JpaRepository.html
  - uri: https://www.postgresql.org/docs/current/sql-truncate.html
last_fetched: 2026-09-10
skills: [security-scan-workflow]
---

## Database effects

Resolve receiver, overload and actual query before assigning scope. Spring Data `deleteAll()`
removes all repository entities; `deleteAll(entities)` and ID-based variants constrain the input
set, whose ownership still needs review. Batch methods differ in lifecycle/cascade behavior;
inspect the deployed API and entity relationships rather than assuming entity callbacks apply.
Local collection clearing is not database deletion.

For bulk SQL, inspect the effective predicate, tenant binding, join/cascade targets and execution
privilege. A `WHERE` clause may be tautological or become empty in a query builder. Bound SQL
values do not make a global `DELETE` tenant-safe. PostgreSQL `TRUNCATE ... CASCADE` expands to
referencing tables; transaction rollback support does not limit the effect after commit.

## Redis effects

`FLUSHDB` removes keys in the selected database; a client key prefix does not scope it.
`FLUSHALL` covers all databases on the addressed server. Client/cluster routing determines
which nodes are reached; do not infer cluster-wide or cluster-safe behavior from the name.
`ASYNC` changes execution mechanics, not namespace authorization or ownership.

Trace `flushDb`, `flushdb`, `flushall`, `flushAll`, `flush_db`, server-command wrappers, raw
dispatch and Lua command calls to their actual client. Also inspect key enumeration followed by
bulk `DEL`/`UNLINK`: `SCAN` iterates keys; replacing `KEYS` with `SCAN` does not itself constrain
deletion. Inspect fixed/validated prefixes, empty-prefix fallbacks, caller-controlled glob syntax,
selected database, ACL and connection binding. Prefer exact owned keys when recommending cleanup.

## Workflow ownership decision

For every candidate record trigger, resource binding, isolation class, effective row/key set,
guard placement and lifecycle. Include before/after test hooks, retry/error cleanup, startup
jobs, cron, migration `clean`, shell/CI helpers and admin endpoints. A test can use a shared
service through an environment fallback; an ephemeral container can be bypassed by an override.

`EPHEMERAL_OWNED` needs construction by this run, binding of the actual client to that resource,
no shared/reused override path, and a matching teardown. User claims, localhost, test profiles,
transactions and random key prefixes alone are insufficient. `UNKNOWN` requires a named
verification gap. `SHARED` with unbounded reachable deletion is a reportable operational risk
even if the caller is trusted. Do not require an injection exploit to report it.

Keep proven isolated teardown as a safe counterexample. An intentionally authorized global
maintenance action needs an evidenced target and guard; intent alone cannot suppress its risk.

## 리뷰 훅

- [ ] Wrappers and overloads resolve to the real DB/Redis operation, including scripts and hooks.
- [ ] Predicates, tenant membership, cascade and key selection bound the actual effect.
- [ ] Resource binding and lifecycle support SHARED, EPHEMERAL_OWNED, or UNKNOWN explicitly.
- [ ] FLUSHDB/FLUSHALL are not treated as prefix-scoped or made safe by ASYNC.
- [ ] Broad SCAN-to-delete and empty-prefix paths are inspected along with flush commands.
- [ ] Unknown ownership prevents a clean result; review never connects to or clears the service.
