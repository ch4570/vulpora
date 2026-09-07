---
title: 빈 이름 규칙과 충돌 회피
source: https://docs.spring.io/spring-framework/reference/core/beans/definition.html
last_fetched: 2026-06-24
skills: [repository]
---

# 빈 이름 규칙과 충돌 회피

> 보조 출처: https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-autowire.html

## 빈 이름 규칙
- 모든 빈은 컨테이너 내에서 **고유한 식별자(이름)** 를 가진다. 보통 하나의 이름 + 선택적 alias.
- 컴포넌트 스캔/리포지토리 자동 등록 시 기본 빈 이름은 **클래스(또는 인터페이스) 단순명의 첫 글자를 소문자화**한 것.
  - `OrderEntityRepository` → 빈 이름 `orderEntityRepository`.
- 명시 지정: `@Repository("orderEntityRepository")` 또는 `@Bean` 메서드 이름.

## 빈 이름 충돌 = 부팅 실패 (override=false 기본)
- Spring Boot 2.1+ 기본값 **`spring.main.allow-bean-definition-overriding=false`**.
- 서로 다른 두 정의가 **같은 빈 이름**을 가지면 컨테이너 기동 시 `BeanDefinitionOverrideException`으로 **부팅이 실패**한다.
- 즉, 이름 충돌은 런타임이 아니라 **시작 시점에 즉시 터지는** 하드 제약이다.

## 인프라/내장 빈명과의 충돌 회피
- 프레임워크·스타터가 **이미 등록한 빈 이름**과 겹치면 충돌한다.
- **실제 사례**: 엔티티 이름이 "Job"이라 도메인 리포지토리를 `JobRepository`로 만들면
  빈 이름 `jobRepository`가 **Spring Batch 내장 `jobRepository` 빈**(`JobRepository` 인프라 빈)과 충돌해 부팅이 깨진다.
  - 회피: **`JobEntityRepository`** 처럼 도메인 규약(`…EntityRepository`)을 따라 이름을 유일하게 만든다.
  - 다른 모듈에 같은 단순명이 미러링될 수 있으면 **도메인 접두사**로 구분한다.

```kotlin
// 위험: 빈 이름 jobRepository → Spring Batch 내장 빈과 충돌, 부팅 실패
interface JobRepository : JpaRepository<JobEntity, String>

// 안전: 빈 이름 jobEntityRepository
interface JobEntityRepository : JpaRepository<JobEntity, String>
```

## 명시적 빈명 / 네이밍 규칙
- 자동 생성 이름에 의존하기보다, 충돌 위험이 있으면 **명시적 빈 이름**을 지정한다.
- 일관된 접미/접두 규칙(`…EntityRepository`, 도메인 접두사)으로 전역 유일성을 확보한다.

## 타입 기반 주입 권장
- `@Autowired`/생성자 주입은 **타입 기준**으로 해결한다 → 빈 이름 변경에 강건.
- 같은 타입 빈이 여러 개일 때만 `@Qualifier`/`@Primary`로 구분. **문자열 `@Qualifier` 남용은 지양**(리팩터링 취약).

## 리뷰 훅
- [ ] 리포지토리 빈 이름이 프레임워크/스타터 내장 빈(예: Spring Batch `jobRepository`)과 충돌하지 않는가?
- [ ] 엔티티명이 "Job" 등 인프라 명칭과 겹칠 때 `…EntityRepository` 규약으로 유일화했는가?
- [ ] 여러 모듈에 미러링되는 타입에 도메인 접두사로 빈명 충돌을 예방했는가?
- [ ] `allow-bean-definition-overriding`을 임의로 켜서 충돌을 가리지 않았는가? (기본 false 유지)
- [ ] 의존성을 타입 기반으로 주입하는가? (문자열 `@Qualifier` 남용 없음)
