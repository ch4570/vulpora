---
title: Spring Data JPA entity state와 저장 계약
source: https://docs.spring.io/spring-data/jpa/reference/jpa/entity-persistence.html
last_fetched: 2026-08-20
consumers: [java-reviewer]
owner: java-reviewer
source_type: official
last_verified: 2026-08-20
verified_by: vulpora-authoring
review_after: 2026-11-20
status: verified
evals: [java-reviewer.spring-data-state.v1]
revalidate_on: [spring-data-major-version-change, source-change, eval-failure]
---

# Spring Data JPA entity state와 저장 계약

## 리뷰 훅

- [ ] `CrudRepository.save()` 대상의 new-state 판단이 id/version 전략과 맞는가?
- [ ] 수동 할당 id에서 non-null id만으로 existing entity로 오인하지 않는가? `Persistable.isNew()` 또는
      다른 명시적 전략이 실제 lifecycle callback과 일치하는가?
- [ ] `save()` 반환 instance와 전달 instance를 동일하다고 가정하지 않는가? `merge()` 경로의 managed
      instance를 이후 코드가 올바르게 사용하는가?
- [ ] Entity 생성·변경 메서드가 identifier, version, association과 aggregate invariant를 보존하는가?
- [ ] Persistence operation이 실제 transaction 안에서 실행되는지 호출 경로로 확인했는가?
- [ ] JPA finding을 entity mapping, repository call, transaction과 focused persistence test로 확인했는가?

## 공식 계약

Spring Data JPA의 `save()`는 새 entity면 `EntityManager.persist()`, 그렇지 않으면 `merge()`를 사용한다.
기본 new detection은 non-primitive version property를 먼저 보고, 없으면 identifier가 `null`인지 본다.
수동 할당 identifier처럼 id가 처음부터 non-null인 모델은 이 기본 전략과 맞지 않을 수 있으며,
`Persistable.isNew()`나 custom `EntityInformation`으로 계약을 명시할 수 있다.

## 증거와 심각도

`save()`를 무조건 insert 또는 update로 해석하지 않는다. Identifier/version 선언, `Persistable`, lifecycle
callback과 실제 repository call을 함께 읽는다. 잘못된 state detection이 정상 경로의 누락 update,
예상치 못한 insert 또는 invariant 손상을 일으키는 것이 확인되면 HIGH 이상 후보지만, DB interaction이
확인되지 않으면 inferred finding과 좁은 persistence test를 제시한다.
