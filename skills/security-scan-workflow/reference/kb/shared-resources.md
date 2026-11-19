---
title: Shared-resource effect and ownership analysis
source: ../../SKILL.md
sources:
  - uri: https://docs.opensearch.org/latest/api-reference/index-apis/delete-index/
  - uri: https://kafka.apache.org/41/operations/basic-kafka-operations/
  - uri: https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html
last_fetched: 2026-09-10
skills: [security-scan-workflow]
---

## Effect inventory

The matrix below is the workflow's analysis policy, not a claim that every repository uses these
services. First inventory actual clients, config, lifecycle scripts and privileges. For each
present resource follow the real call, including wrappers, raw dispatch, retry and error cleanup.
Use the deployed service/API version before concluding its exact effect.

| Resource | Effects and boundaries to inspect |
|---|---|
| Database/cache | Unbounded reads/writes, deletes, cascades, flush, TTL eviction, locks, transaction/session settings, failed deadlines and connection reuse. Use the destructive-data topic for DB/Redis semantics. |
| Search | Index delete, update/delete-by-query, wildcard targets, alias retargeting, reindex destinations, templates and shared cluster settings. An alias/name prefix does not establish ownership of the resolved index. |
| Broker | Topic/queue deletion or purge, retention/config changes, offset resets, acknowledgments, duplicate delivery and retry floods. Bind topic, group, partition and tenant as applicable. |
| Object store | Bucket/key/version selection, bulk delete, overwrite, lifecycle and permissions; empty prefixes and caller-supplied object lists. List filters are not authorization to mutate the returned objects. |
| Host/infrastructure | Recursive file cleanup, symlinks, process-group signals, container prune, shared volumes, namespaces, cluster/namespace contexts, IAM revocation/grants and deployment routing. Test naming is not ownership. |

Official examples clarify why operation names alone are insufficient:

- [OpenSearch Delete Index](https://docs.opensearch.org/latest/api-reference/index-apis/delete-index/)
  supports multiple index targets and wildcard expressions. Trace target construction and effective
  destructive-operation configuration, not just the method's spelling.
- [Kafka operations](https://kafka.apache.org/41/operations/basic-kafka-operations/) include topic
  configuration and consumer offset changes. Consider retained data and consumption behavior as
  well as explicit deletion when reviewing administrative wrappers.
- [S3 DeleteObjects](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html) takes a
  bucket and a list of keys with optional version IDs and can report per-object failures. Trace
  authorization and partial results; a successful transport response is not blanket completion.

## Ownership and blast radius

For every candidate record principal, operation, trigger, client construction, effective target,
selection bounds, isolation class, guard location, failure/retry paths and maximum effect.
Read-only operations can harm availability through locks, expensive work or full buffering.
Configuration and routing writes can affect other tenants without deleting anything.

EPHEMERAL_OWNED requires evidence connecting resource creation by this run to the exact client,
target and lifecycle, with reuse/shared overrides excluded. A request boolean, a process-wide
test flag, a random-looking identifier or matching string prefix cannot mint ownership.
In-process opaque handles can restrict a capability only when issued by a trusted constructor,
bound to actual identities, unforgeable across the input boundary and revoked at teardown.
Do not infer distributed ownership from a JavaScript object identity alone.

SHARED does not mean every operation must be removed: authorized exact-object maintenance can
be legitimate. Require enforced principal/tenant membership and bounded resource/operation
selection. UNKNOWN must keep its evidence gap visible; fix fail-open source paths without probing
the unknown resource. Do not replace global flush with wildcard enumeration and call it scoped.

## Regression targets

Test missing/empty/wildcard scopes, wrong tenant/run, expired/revoked ownership, shared-client
substitution despite matching target names, partial failure, retry budget and cancellation.
Assert zero sensitive calls on rejected paths and exact bounded calls on legitimate ones.
Use in-memory transports or proven run-owned resources, never the discovered shared endpoint.

## 리뷰 훅

- [ ] Resource inventory covers executable bindings, not just DB/Redis keywords.
- [ ] Writes, reads, configuration, routing and availability effects are considered.
- [ ] Authorization, exact client/target ownership and operation bounds precede the sink.
- [ ] Missing/reused/substituted ownership fails closed; legitimate bounded paths survive.
- [ ] Unknown resources were not probed, cleared or changed to prove the finding.
