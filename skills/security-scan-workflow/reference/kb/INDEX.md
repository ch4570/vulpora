# Security scan knowledge routing

| Task signal | Read | Decision |
|---|---|---|
| Browser rendering, cookies, sessions, state-changing endpoints | [Browser boundaries](browser-boundaries.md) | XSS context and CSRF applicability/controls |
| Database/Redis writes, cleanup helpers, migrations, CI/test lifecycle | [Destructive data](destructive-data.md) | Scope, resource binding, ownership and blast radius |
| Search/queue/storage/infrastructure, shared state or privileged capabilities | [Shared resources](shared-resources.md) | Non-deletion effects, exact ownership, target and budget bounds |
| Explicit fix/harden/remove-risk request, source changes or verification commands | [Remediation](remediation.md) | Actual repairs, authority boundary and safe regression evidence |
| Reconciling results, partial execution or missing deployment evidence | [Reporting](reporting.md) | Evidence fields, confidence, dissent and completion |

Credential, SQL/interpreter, authentication/authorization, SSRF, filesystem, crypto, dependencies,
configuration and abuse knowledge remain owned by the
mandatory `security-auditor` bundle and its INDEX. Give it task signals for selective loading.

[Principles](../principles.md) hold durable judgment rules; topics hold source-backed distinctions.
Refresh affected topics when framework APIs, upstream guidance, or a regression changes the
decision. `last_fetched` records retrieval, not runtime validation. TODO: add framework-specific
topics only when real review failures demonstrate a gap.
