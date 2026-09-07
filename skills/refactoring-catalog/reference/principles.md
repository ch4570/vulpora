# 리팩터링 핵심 원칙 (Principles)

> 이 문서는 Martin Fowler 『Refactoring』(2nd ed.)의 정의·법칙을 추출한 실무 원칙 모음이다.
> 에이전트와 스킬이 리팩터링 판단의 근거로 삼는 "헌법" 역할을 한다. 세부 카탈로그·기법은
> `kb/`의 토픽 파일에 있으며, **충돌 시 KB(카탈로그 사실)가 이 원칙 문서를 이긴다.**
>
> **출처(Sources)**
> - Martin Fowler, 『Refactoring: Improving the Design of Existing Code』, 2nd ed. (Addison-Wesley) — https://martinfowler.com/books/refactoring.html
> - 온라인 카탈로그: https://refactoring.com/catalog/
> - Code Smell: https://martinfowler.com/bliki/CodeSmell.html
> - Opportunistic Refactoring: https://martinfowler.com/bliki/OpportunisticRefactoring.html
> - Two Hats / Self-Testing Code: 『Refactoring』 2nd ed. ch.1, ch.4
>
> 예시는 도메인 중립 엔티티(Order, Member, Article, Product, Money, PaymentType 등)와
> Kotlin/Java로 작성한다.

---

## 0. 대전제: 리팩터링은 "동작 보존" 변환이다

> Fowler 정의: *"리팩터링은 소프트웨어의 **겉으로 드러나는 동작을 바꾸지 않으면서** 내부
> 구조를 개선하여, 더 이해하기 쉽고 수정 비용이 싸지도록 만드는 것이다."*

- 관찰 가능한 동작(입출력, 부수효과, 계약)을 바꾸면 그것은 리팩터링이 아니라 **기능 변경**이다.
- 기능 추가/버그 수정과 리팩터링은 **절대 한 커밋에 섞지 않는다**(아래 "두 개의 모자").

---

## 1. 두 개의 모자 (The Two Hats)

『Refactoring』 ch.2.

- 개발 중에는 **기능 추가 모자**와 **리팩터링 모자** 중 하나만 쓴다.
- 기능 모자: 새 테스트를 추가하고 동작을 바꾼다. 리팩터링 모자: 테스트를 추가하지 않고
  구조만 바꾼다(기존 테스트가 그대로 통과해야 한다).
- 모자를 자주 바꿔 쓰되, **지금 어떤 모자인지 항상 자각**한다. 두 작업이 섞이면 리뷰·롤백이 불가능해진다.

---

## 2. 작은 단계(Small Steps)로, 매 단계 테스트

『Refactoring』 ch.1·2.

- 리팩터링은 **아주 작은 변환의 연속**이다. 각 변환은 컴파일·테스트를 통과해야 다음으로 넘어간다.
- "한 번에 조금씩 바꾸고 매번 테스트" → 깨졌을 때 **직전 변경 하나**만 의심하면 된다(디버깅 시간 급감).
- 큰 리팩터링도 작은 단계의 합으로 분해한다(Split Phase, Branch by Abstraction 등).

---

## 3. 테스트 안전망이 전제 (Self-Testing Code)

『Refactoring』 ch.4.

- **테스트 없는 대규모 리팩터링은 금지.** 리팩터링의 안전성은 자가 테스트 코드에서 나온다.
- 레거시처럼 테스트가 없으면 먼저 **특성화 테스트(characterization test)** 로 현재 동작을 고정한 뒤 리팩터링한다.
- 검증은 빌드시스템을 **자동 감지**해서 돌린다(gradle/maven/npm/pnpm/yarn). 특정 빌드툴을 가정하지 않는다.
- 자세한 안전 절차는 `kb/refactoring-safety.md`.

---

## 4. 스멜은 휴리스틱이다 (Smell as Heuristic, not Rule)

https://martinfowler.com/bliki/CodeSmell.html

- 코드 스멜은 "더 깊은 문제일 수 있으니 **여기를 보라**"는 표면 신호이지, 그 자체가 버그/규칙 위반은 아니다.
- 스멜 → 카탈로그 리팩터링으로 매핑하되, **판단(언제 적용/유보)** 은 사람이 한다. 기계적 적용 금지.
- 스멜·처방 매핑은 `kb/code-smells.md`.

---

## 5. 가치 ÷ 위험으로 우선순위

『Refactoring』 ch.2 + Opportunistic Refactoring.

- 리팩터링은 **곧 손댈 코드, 자주 읽히는 코드, 버그가 모이는 코드**부터. "예뻐서" 하지 않는다.
- **기회적 리팩터링(Opportunistic / 보이스카우트 규칙)**: 기능 작업하러 들른 김에 그 주변을
  조금 더 깨끗하게 두고 나온다. 단, 작업 범위를 넘는 산만한 확산은 피한다(scope 통제).
- 가치(이해·수정 비용 절감)가 위험(깨질 가능성·테스트 부재·락인 범위)을 넘을 때만 진행.

---

## 6. 언제 리팩터링하지 않는가

『Refactoring』 ch.2.

- 처음부터 **다시 짜는 게 싼** 엉망 코드 → 리팩터링보다 재작성.
- **곧 폐기**될 코드.
- 테스트 안전망을 만들 수 없고, 변경 위험이 가치를 압도할 때(우선 안전망부터).
- 마감 직전 등 **두 모자를 분리할 여유가 없을 때**는 일단 멈추고 일정에 부채로 기록한다.

---

## KB와의 관계 / 우선순위

- 이 문서는 "왜·언제"의 판단 원칙이다. "무엇을 어떻게(카탈로그 이름·메커니즘 단계)"는 `kb/`가 담는다.
- **충돌 시 KB가 우선**한다(카탈로그 사실·메커니즘이 책의 정본이므로). 색인은 `kb/INDEX.md`.
