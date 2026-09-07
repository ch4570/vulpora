---
title: 결정성과 커버리지
source:
  - https://kotlin.github.io/kotlinx-kover/
  - https://pitest.org/quickstart/
  - https://testing.googleblog.com/2020/12/test-flakiness-one-of-main-challenges.html
last_fetched: 2026-09-02
skills: [test-authoring]
---

# KB: 결정성 / 커버리지

## 결정적 테스트 (`TST-10`~`TST-12`)
- **결정성은 타협 불가다.** 같은 코드에 대해 통과/실패가 갈리는 **플레이키 테스트**는 신뢰를
  무너뜨리고 결국 무시된다(Google Testing Blog *Flaky Tests*).
- 비결정성의 주요 원천과 차단법:
| 원천 | 증상 | 차단법 |
|------|------|--------|
| 벽시계 시간(`now()`) | 시각 의존 분기, 만료 로직 | `Clock`을 주입하고 고정 `Clock.fixed(...)` 사용 |
| 난수 | 무작위 결과 | `Random(seed)` 주입, 시드 명시 고정 |
| `Thread.sleep`/실제 대기 | 느림 + 타이밍 의존 | 가상 시간/콜백 동기화, 실제 sleep 금지 |
| 실제 네트워크/외부 API | 환경 의존, 지연 | 더블/임베디드로 경계 대체 |
| 실행 순서·공유 상태 | 다른 테스트가 남긴 상태에 의존 | 케이스별 고유 데이터, 격리(`TST-12`) |
| 컬렉션 순회 순서 | `HashMap`/병렬 순서 비결정 | 정렬 후 단언 또는 순서 무관 matcher |

## 확률적 로직은 분포를 단언한다 (`TST-11`)
- 시드를 고정해 **다수 반복의 통계적 성질**을 단언한다(한 번 뽑은 값 X).
```kotlin
val counts = mutableMapOf<String, Int>().withDefault { 0 }
repeat(1000) { i ->
    sut.sample(items, k = 2, random = Random(seed = i.toLong()))
        .forEach { counts[it] = counts.getValue(it) + 1 }
}
counts.getValue("high") shouldBeGreaterThan counts.getValue("low")
```

## 격리 (`TST-12`)
- 테스트는 실행 순서나 공유 가변 상태에 의존하면 안 된다. 케이스마다 **고유 데이터**를 생성하고,
  DB 테스트는 **고유 키**로 자기 행을 만든다(예: `"m-${UUID.randomUUID()}"`).
- Kotest 기본 `SingleInstance`에서도 통과하도록 가변 필드 공유를 피한다.

## 커버리지의 의미와 한계
- **커버리지 = 실행된 코드, ≠ 검증된 코드.** 어서션 없이 호출만 해도 라인 커버리지는 오른다.
  높은 커버리지가 품질을 보장하지 않는다.
- **굿하트의 법칙:** 숫자가 목표가 되면 의미 없는 테스트가 양산된다. 숫자는 **테스트되지 않은
  위험 영역을 찾는 신호**로 쓴다.
- 측정 강도(약 → 강):
| 지표 | 측정 | 한계 |
|------|------|------|
| **라인(line)** | 실행된 줄 비율 | 분기·예외 미검증을 못 잡음 |
| **브랜치(branch)** | 분기 양쪽 실행 여부 | 실행만 보고 단언 여부는 모름 |
| **뮤테이션(mutation)** | 코드를 변형(mutant)했을 때 테스트가 잡는지 | 가장 강한 신호. 느림 |
- 라인 100%여도 분기 미검증·단언 누락이 가능하다. 가능하면 **브랜치**를 보고, 핵심 로직은
  **뮤테이션 테스트**로 어서션의 실효성을 검증한다.
- agent-authored change에서는 coverage 상승만으로 완료하지 않는다. selected test가 plausible fault에서
  실제 실패하는 RED 또는 controlled mutation evidence를 함께 남긴다(`TST-20`).

## Kover (Kotlin 커버리지 도구)
- **Kover**는 Kotlin 공식 커버리지 도구(JaCoCo/IntelliJ 엔진 기반)로, 라인·브랜치 커버리지
  리포트와 **검증 규칙(verify rule)** 으로 임계치 게이트를 제공한다.
- 임계치는 `minBound` 등으로 라인/브랜치 비율을 강제할 수 있다. 슬로우 테스트 제외 등은
  소스셋/태그 필터로 처리한다(이 스킬의 `@DisableSlowTest`는 커버리지에서 제외됨).
- **빌드 게이트 일반화:** 커버리지 임계치 게이트는 특정 빌드도구에 묶지 말고 **감지된
  빌드시스템(gradle/maven 등)** 에 맞춰 적용한다. Kover는 그중 Kotlin 표준 도구일 뿐,
  "커버리지를 게이트로 강제한다"는 원칙은 도구 독립적이다.
- PIT 같은 mutation tool은 repository에 이미 구성됐을 때 changed high-risk target에 우선 사용한다. test
  authoring만을 위해 새 plugin/dependency를 추가하지 않으며, survivor count 전체를 맹목적인 숫자 목표로
  만들지 않는다.

## 리뷰 훅
- [ ] 실제 `Thread.sleep`/벽시계 시간/실제 네트워크에 의존하지 않는가(`TST-10`).
- [ ] `Clock`·`Random`을 주입하고 **시드를 명시 고정**했는가(`TST-10`).
- [ ] 확률적 로직은 단일 샘플이 아니라 **분포**를 단언하는가(`TST-11`).
- [ ] 케이스별 고유 데이터/키로 순서·공유 상태 의존을 없앴는가(`TST-12`).
- [ ] 커버리지 숫자만 올리는 **어서션 없는 호출 테스트**가 아닌가(`TST-6`).
- [ ] 핵심 분기·예외 경로가 라인이 아닌 **브랜치 관점**으로 덮였는가(`TST-8`).
- [ ] 커버리지 게이트가 빌드시스템 자동감지에 맞춰 일반적으로 적용되는가(특정 빌드도구 하드코딩 X).
- [ ] 핵심 변경의 selected test가 RED 또는 controlled mutation에서 실제 실패했는가(`TST-20`).
