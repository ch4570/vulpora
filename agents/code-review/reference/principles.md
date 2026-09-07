# Kotlin + Spring 코드 리뷰 핵심 원칙 (Principles)

> Kotlin/Spring 공식 문서 + Martin Fowler(bliki·refactoring) + Clean Code/DDD를 distill한
> 코드 리뷰의 "헌법". 에이전트·스킬이 판단 근거로 삼는다. **사실(공식 문서 규칙)은 `kb/`가
> 우선**하고, 이 문서는 통찰·우선순위·trade-off 판단을 담는다.
>
> **출처**: kotlinlang.org/docs, docs.spring.io, martinfowler.com, refactoring.com (상세는 `kb/INDEX.md`).

---

## 0. 대전제: 취향이 아니라 원칙, 그러나 컨텍스트가 최우선

- 모든 지적은 **출처(공식 문서/Fowler/책 또는 프로젝트 규약)** 를 단다. 근거 없는 단정 금지.
- **적용 우선순위: 프로젝트 규약(AGENTS.md/CLAUDE.md) > 최신 공식 문서 > 책/블로그.** 충돌 시 이유 명시.
- KISS/YAGNI 존중. 규칙을 위한 규칙 강요 금지 — 트레이드오프를 설명한다.

---

## 1. 의존성은 안쪽(도메인)으로 흐른다

Fowler DDD/Layered + Hexagonal. 의존성 역전(DIP)이 핵심.
- 도메인은 프레임워크·인프라에 **무의존**. 외부 시스템은 **포트+어댑터**로 격리.
- **Anemic Domain Model**(데이터만 있고 행위 없는 도메인)은 안티패턴 — 행위를 도메인으로.
- 의존성 방향 위반은 한 번 새면 되돌리기 어렵다 → **HIGH 이상**.

---

## 2. 불변성과 널 안정성 (Kotlin)

- `val`·`data class copy()`·읽기 전용 컬렉션 우선. 공개 API에 `Mutable*` 노출 금지.
- 비즈니스 로직 `!!` 금지. 플랫폼 타입(`Type!`) 의심. nullable은 `?.`/`?:`/스마트캐스트로.
- 타입 분기 반복 `when` → `sealed` + 망라적 `when`(다형성 > 분기).

---

## 3. 싱글톤 빈 가변 상태 = 동시성 버그

Spring 빈은 기본 싱글톤. **가변 인스턴스 필드는 데이터 레이스**.
- 생성자 주입 + `val` 불변 의존. `GlobalScope` 금지, 블로킹은 `Dispatchers.IO`.
- **정상 경로에서 재현되는 레이스만 HIGH+**. "동시 시 가능"하나 의도된 트레이드오프면 MEDIUM(의도 확인).

---

## 4. 트랜잭션 경계는 정확히

- `@Transactional` **자기호출(self-invocation) 무효**(프록시 미경유). 조회는 `readOnly`.
- 트랜잭션 내 외부 API 호출·장시간 작업 주의(커넥션 점유). 전파(propagation) 의미를 안다.

---

## 5. 리팩터링은 행위 보존 + 작은 단계 (Fowler)

- 리팩터링 = **겉보기 동작을 바꾸지 않고** 내부 구조 개선. 테스트가 안전망.
- **Code Smell**(중복, 긴 함수, 큰 클래스, feature envy 등)을 신호로 본다 — smell은 "어디를 보라"는 힌트.
- 큰 함수·큰 클래스(SRP 위반)는 추출(Extract Function/Class)로.

---

## 6. 테스트 (Fowler Test Pyramid)

- 단위 테스트 다수 + 통합 소수 + E2E 최소. 빠르고 격리된 단위 테스트가 토대.
- 테스트 가능 설계(의존성 주입), AAA/FIRST, 경계 테스트. 금전은 `BigDecimal`.

---

## 7. 증명 우선 · 심각도 캘리브레이션

- CRITICAL/아키텍처 단정은 추론에서 멈추지 말고 **컴파일/테스트/grep으로 실증**, 신뢰도(확정/추정) 태깅.
- **사실 전제 미확인 CRITICAL은 존재 불가** — 거짓 BLOCK이 정확한 BLOCK만큼 비싸다.

| 등급 | 의미 | 조치 |
|---|---|---|
| 🔴 CRITICAL | 보안·데이터 손실·증명된 레이스·부팅/배포 파손 | BLOCK([확정]만) |
| 🟠 HIGH | 버그·아키텍처 위반·트랜잭션 오류 | WARN |
| 🟡 MEDIUM | 유지보수성·비관용·의도 가능 트레이드오프 | INFO |
| 🟢 LOW | 사소 — **린터(ktlint/Detekt)가 잡는 기계적 스타일은 "린터 위임" 한 줄로** | NOTE |
