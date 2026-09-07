---
title: Spring MVC validation·error contract와 focused test
source: https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-validation.html
sources_extra:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-exceptionhandler.html
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html
  - https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html
  - https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/ctx-management/caching.html
versions: Spring Framework and Spring Boot current reference
last_fetched: 2026-08-20
consumers: [java-reviewer]
owner: java-reviewer
source_type: official
last_verified: 2026-08-20
verified_by: vulpora-authoring
review_after: 2026-11-20
status: verified
evals: [java-reviewer.spring-web-test-evidence.v1]
revalidate_on: [spring-major-version-change, spring-boot-major-version-change, source-change, eval-failure]
---

# Spring MVC validation·error contract와 focused test

## 리뷰 훅

- [ ] Request body/model/part에 필요한 `@Valid` 또는 method constraint가 실제 validation 경로에
      적용되는가? `Errors`/`BindingResult`와 method validation의 차이를 확인했는가?
- [ ] `@ExceptionHandler`/`@ControllerAdvice` 우선순위와 content negotiation이 API의 status·media type·
      error body 계약을 보존하는가?
- [ ] Entity를 request binding 또는 response body에 직접 노출해 persistence state와 public API를
      결합하지 않는가?
- [ ] Pure business logic은 Spring 없이 unit test하고, MVC/JPA/bean wiring은 필요한 test slice 또는
      좁은 context test로 검증하는가?
- [ ] `@SpringBootTest`가 필요한 이유가 있는가? Slice에 필요한 configuration이 실제로 포함되는가?
- [ ] Test context cache key를 불필요하게 다양화하거나 process fork로 cache를 무효화하지 않는가?
- [ ] Test가 transaction rollback 때문에 production commit/flush behavior를 놓치지 않는가?

## 공식 계약

- Spring MVC는 argument-level validation과 method validation을 구분하며, 적용되는 예외와 handler
  signature도 다를 수 있다. Annotation 존재만으로 모든 nested/method constraint가 검증된다고 보지 않는다.
- Controller-local exception handler와 advice handler에는 적용 범위와 우선순위가 있다. Error response의
  HTTP status, content type과 body는 공개 계약으로 함께 검토한다.
- Spring Boot는 full `@SpringBootTest` 외에 특정 application slice를 위한 test annotation을 제공한다.
  Slice는 제한된 auto-configuration을 가져오므로 실제 포함 범위를 확인해야 한다.
- Spring TestContext는 동일한 configuration key의 context를 static cache로 재사용한다. 다른 profile,
  property, customizer 또는 forked process는 cache reuse와 실행 비용을 바꾼다.

## 증거와 심각도

Missing validation 또는 exception mapping이 실제 request path와 공개 error contract에 영향을 주는지
controller, advice, DTO와 MVC test로 확인한다. Test type 선택은 취향 finding이 아니라 검증 누락·과도한
비용·false confidence가 있는 경우에만 보고한다. Production behavior를 증명하지 못하는 test는 exact gap과
더 좁은 재현 명령을 남긴다.
