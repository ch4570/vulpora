---
title: 의존성 방향, 순환과 모듈 API
source: Clean Architecture (Robert C. Martin), Part V / Ch.22
last_fetched: 2026-08-11
consumers: [application-architect]
owner: application-architect
source_type: book
sources:
  - uri: Clean Architecture (Robert C. Martin)
    version: 1st edition
    locator: Part V Architecture / Ch.22 The Clean Architecture
  - uri: https://docs.gradle.org/current/userguide/java_library_plugin.html
    version: current
    locator: API and implementation separation
last_verified: 2026-08-11
verified_by: Vulpora maintainers
review_after: 2026-11-11
status: verified
evals: [application-architect.multi-module-boundary-review.v1]
revalidate_on: [source-version-change, eval-failure, dependency-cycle-incident]
---

# 의존성 방향, 순환과 모듈 API

## 리뷰 훅

- [ ] source import와 build dependency를 모두 추적해 실제 edge를 기록했는가.
- [ ] domain/application policy가 adapter/framework/database implementation에 의존하지 않는가.
- [ ] A→B→A 또는 더 긴 cycle이 있는가. reflection/event/service locator의 숨은 역방향도 확인했는가.
- [ ] 공개 API가 소비자에게 필요한 최소 type만 노출하고 internal implementation을 감추는가.
- [ ] Gradle `api`와 `implementation` 같은 exposure 차이가 의도와 맞는가.
- [ ] `common`, `shared`, `util`이 사실상 양방향 결합의 우회로인지 확인했는가.

## 판단 규칙

source dependency는 business policy와 안정된 contract를 향해야 한다. 제어 흐름이 반대여도 consumer-owned
port/interface와 adapter implementation으로 source direction을 역전할 수 있다. 하지만 변경 축이 하나이고
대체 구현/경계가 없는 단순 local call에 interface를 추가하는 것은 결합을 줄이지 않을 수 있다.

순환 의존은 독립 이해·테스트·릴리스를 어렵게 한다. cycle을 자를 때는 임의의 `shared` 추출보다 다음을 본다.

1. 잘못 놓인 책임을 실제 owner로 이동
2. 한 방향의 작은 public contract 추출
3. consumer-owned port와 dependency inversion
4. 동기 반환이 불필요하면 domain/application event

Gradle Java Library의 `api` dependency는 consumer compile classpath에 전이되고 `implementation`은 내부로 취급된다.
이는 visibility 증거지만 언어-level public type 누출이나 runtime reflection까지 자동 차단하지는 않는다.

## 공개 API 품질

API에는 stable use case, input/output contract, error/failure semantics만 포함한다. ORM entity, persistence
repository 구현, framework request/response와 내부 aggregate object graph는 경계 밖 변경을 확산시키므로
별도 boundary DTO 또는 ID/value snapshot을 검토한다. DTO 중복은 격리를 위해 지불하는 의도적 비용일 수 있다.
