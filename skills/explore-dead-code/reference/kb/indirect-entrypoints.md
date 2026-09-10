---
title: Indirect entrypoints and open consumer boundaries
source: https://knip.dev/explanations/entry-files
sources:
  - https://knip.dev/explanations/entry-files
  - https://docs.spring.io/spring-framework/reference/core/beans/classpath-scanning.html
last_fetched: 2026-09-10
skills: [explore-dead-code]
---

# Indirect entrypoints

[Knip](https://knip.dev/explanations/entry-files) determines use from entry files. Its entry
discovery includes package `main`, `bin`, `exports`, scripts and framework plugins; explicit
configuration can replace defaults. An analyzer result must be read with its entry/project
configuration. An exported library member with no internal caller may serve an external consumer.

[Spring](https://docs.spring.io/spring-framework/reference/core/beans/classpath-scanning.html)
can register annotated components through classpath scanning. Inspect the scan's package boundary
and applicable configuration before interpreting an unreferenced component. Lack of explicit
instantiation is not enough to classify a discovered bean as unused.

Apply those entrypoint principles to the current source rather than assuming a universal list.
The following are investigation prompts, not claims that any particular mechanism is active:

| Observed signal | Evidence to inspect before promoting a candidate |
|---|---|
| HTTP handler, listener, scheduled hook, dependency injection | Annotation/decorator plus router, scanner, subscription or lifecycle registration |
| ORM/serialization model or reflective method | Mapping/configuration, schema consumers, reflection target or string key |
| Alias, re-export, callback, interface implementation | Import binding, registration value or dispatch contract; follow use beyond the original spelling |
| Dynamic module/attribute lookup, plugin or service loader | Loader expression and registry/config/metadata, including relevant hidden files |
| UI page/template, CLI script, package public export | Route/template conventions, script manifest or declared package boundary |
| Generated code, tests, migrations | Generator inputs, test discovery, migration naming/loader; distinguish production from test-only use |

If the target is computed from external input and cannot be bounded statically, hold the candidate
with that reason. Do not promote arbitrary string mentions to proven use either: link the string
to the loader/registration path. Missing configuration is uncertainty, not proof of inactivity.

## 리뷰 훅

- [ ] Public API and dynamic roots have a documented consumer boundary or remain held.
- [ ] Annotation/registration evidence is anchored in the actual repository.
- [ ] Tests count as references and test-only use is separate from zero-reference findings.
- [ ] A closed cycle is checked for outside callers; internal edges alone do not prove use.
