| Task signal | Read this topic | Purpose |
|---|---|---|
| New feature, unclear task, navigation, screen hierarchy, user journey | [user-flow-and-architecture](user-flow-and-architecture.md) | Evidence-to-flow decisions and information architecture |
| Form, async request, loading, empty/error, permission, retry, confirmation | [states-and-recovery](states-and-recovery.md) | Interaction transitions and recoverable feedback |
| Existing components, narrow/wide layouts, accessibility, implementation specification | [responsive-design-handoff](responsive-design-handoff.md) | Component reuse and observable handoff checks |

## Routing

Read [principles](../principles.md) first. Select topics by the actual task signal; a small copy
change does not require loading every topic. Use the trusted `product-ui-design` dependency for
visual direction and its established quality gates, within the agent's read-only authority.

## Relationship and maintenance

Principles express durable trade-offs; topic files provide sourced facts and local review hooks.
`last_fetched` records source retrieval, not proof of live design quality or agent behavior.
Recheck affected topics when their sources, product constraints, or linked evals change. New runtime
feedback stays quarantined until a source check and regression case support promotion.

## Next topics

Content design for complex workflows; multilingual navigation; collaborative editing and conflict recovery.
