---
title: Kotlin 엔티티 함정
source: https://kotlinlang.org/docs/no-arg-plugin.html
last_fetched: 2026-06-24
skills: [entity]
---

# KB: Kotlin 엔티티 함정 (data class 금지 / 플러그인 / val·var)

> 근거:
> - Kotlin no-arg plugin — https://kotlinlang.org/docs/no-arg-plugin.html
> - Kotlin all-open plugin — https://kotlinlang.org/docs/all-open-plugin.html
> - Spring Kotlin support — https://docs.spring.io/spring-framework/reference/languages/kotlin.html

## 리뷰 훅
- [ ] 엔티티를 **`data class`로 선언하지 않았다**(일반 `class` 사용).
- [ ] `kotlin-jpa`(all-open) 플러그인으로 엔티티가 **`open`** 이 된다(Hibernate 프록시용).
- [ ] `kotlin-noarg`(no-arg) 플러그인으로 **인자 없는 생성자**가 생성된다.
- [ ] 식별 변경/auditing/`@Version` 외 필드는 **`val`**(불변 지향).
- [ ] `lateinit`을 영속 필드에 함부로 쓰지 않았다(미초기화 접근 위험).
- [ ] nullable 컬럼은 Kotlin `?` 타입 + `@Column(nullable = true)`로 **일치**시켰다.

## data class를 엔티티로 쓰면 안 되는 이유
`data class`는 다음을 **모든 프로퍼티 기준으로 자동 생성**한다:
| 자동 생성 | 엔티티에서의 해악 |
|-----------|------------------|
| `equals`/`hashCode` | 생성 id 기반 정체성 파괴 + **지연 연관 필드를 건드려 강제 로딩** |
| `toString` | 로깅 시 지연 연관 그래프를 끌어와 `LazyInitializationException`/N+1 |
| `copy` | 엔티티를 값처럼 복제 → 영속 정체성 혼란 |
| `componentN` | 불필요 |

→ 엔티티는 **일반 `class`** + equals/hashCode 수동 구현(`equals-hashcode.md`).

## 필요한 컴파일러 플러그인
Hibernate는 **프록시(상속)** 와 **리플렉션(빈 객체 생성)** 을 쓴다. Kotlin은 기본적으로 클래스가
`final`이고 no-arg 생성자가 없어 그대로는 동작하지 않는다.
```kotlin
// build.gradle.kts
plugins {
    kotlin("plugin.jpa")      // no-arg: @Entity/@Embeddable에 no-arg 생성자 합성
    kotlin("plugin.spring")   // all-open: @Entity 등을 open 으로
}
```
- `kotlin("plugin.jpa")` = no-arg 플러그인을 JPA 어노테이션에 맞춰 설정.
- `kotlin("plugin.spring")` = all-open을 Spring/JPA 스테레오타입에 적용 → 클래스·멤버가 `open`.

## val vs var
- 대부분의 필드는 **`val`**(불변 지향, 원칙 7).
- 단, 엔티티는 dirty checking과 상태 전이 때문에 일부 `var`가 정당하다:
  - auditing(`@LastModifiedDate var updatedAt`)
  - 낙관적 락(`@Version var version`)
  - 상태 전이 필드
- 식별자가 DB 생성(@GeneratedValue)인 경우 `var id: Long? = null` 형태가 흔하다(앱이 채우지
  않으므로). 가능하면 **앱 할당 불변 키**(`val`)가 정체성에 유리하다.

## nullable / lateinit
- Kotlin non-null(`String`)과 `@Column(nullable = true)`가 어긋나면 DB의 NULL을 읽을 때 깨진다 —
  **타입과 컬럼 nullability를 일치**시킨다.
- `lateinit`은 초기화 전 접근 시 예외. 영속 필드엔 기본값/생성자 주입을 우선한다.
