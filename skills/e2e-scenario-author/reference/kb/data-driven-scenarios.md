---
title: 데이터 주도 시나리오 (Scenario Outline/Examples)
source: https://cucumber.io/docs/gherkin/reference/#scenario-outline
last_fetched: 2026-06-24
skills: [e2e-scenario-author]
---

# KB: 데이터 주도 시나리오 (파라미터화)

## Scenario Outline / Examples (Gherkin 공식)
- `Scenario Outline`(= `Scenario Template`)은 **같은 시나리오를 입력 집합마다 반복** 실행한다.
- 본문 스텝의 `<placeholder>` 가 `Examples` 표의 **헤더 컬럼명**과 매칭되어 행마다 치환된다.
- `Examples`(= `Scenarios`) 표는 첫 행이 헤더, 나머지 행이 각각 하나의 구체 시나리오가 된다.
- 즉 "행위 1개 + 데이터 N행 = 시나리오 N개". 중복 시나리오를 한 틀로 축약하는 도구다.

```gherkin
Scenario Outline: size 경계값에 따른 응답 상태
  When 회원이 size=<size> 로 목록을 조회한다
  Then 응답 상태는 <status> 이다

  Examples:
    | size | status |
    | 0    | 400    |
    | 1    | 200    |
    | 100  | 200    |
    | 101  | 400    |
```

- placeholder는 표 헤더와 **정확히 같은 이름**이어야 치환된다(`<size>` ↔ `size`).
- 한 Outline에 여러 `Examples` 블록을 둘 수 있다(유효/무효를 나눠 가독성↑).

## 언제 파라미터화하나
1. **동일 Given/When/Then, 입력만 다름** → Outline/데이터셋 표로 묶는다.
2. **경계값 분석 결과**(KB `boundary-and-negative-cases.md`)는 자연스럽게 Examples 표가 된다.
3. **행위 자체가 다르면** 묶지 않는다(별도 시나리오). 표는 "데이터 변형"용이지 "로직 분기"용이 아니다.

## 카탈로그에서의 데이터 표현
- 카탈로그 블록의 `Dataset` 칸이 한 시나리오의 입력을 담는다(예: `memberId={{seed.MEMBER_ID}}, size=20`).
- 같은 행위의 데이터 변형이 여러 개면, 각 변형을 **별도 시나리오 ID**로 emit하되 ID 한정자로 구분한다
  (예: `...-VALIDATION-FAIL-SIZE-MIN`, `...-VALIDATION-FAIL-SIZE-MAX`). 결정론적 ID 규칙(`SCA-6`) 유지.

## 합성 데이터·시드 규칙 (필수)
> `Dataset`/`Preconditions` 값은 **반드시 합성(synthetic)** 이어야 한다(`SCA-16`).

금지:
- 실제 사용자 ID, 실제 회원/주문 식별자, 실제 전화번호·이메일·주민번호 등 PII.
- 운영 전용 인덱스명(로컬 시드와 다른 이름), 운영 전용 플래그값.

허용:
- 저장소가 실제로 제공하는 합성 fixture 값 또는 `{{seed.TOKEN}}` 참조.
- 결정론적이고 재생성에 안정적이며 probe 가능한 값.

실값이 반드시 필요한 시나리오는 **카탈로그에서 제외**하고 노트로 분리한다(자동 실행 불가).

## 데이터셋 설계 원칙
1. **결정론적**: 같은 SHA에서 재생성하면 동일한 Dataset이 나와야 한다(`SCA-13`).
2. **자족적**: 시나리오가 의존하는 시드는 `Preconditions`/`Depends-on`으로 명시한다(자유 텍스트 금지, `SCA-8`).
3. **최소성**: 결과에 영향 주는 입력만. 불필요한 필드는 노이즈.
4. **경계 우선**: 가운데 임의값보다 경계값을 데이터 행으로 선택(결함 검출력↑).

## 나쁜/좋은 예
```text
# 나쁨: 실데이터·중복 시나리오
Dataset: userId=88213394 (실제 사용자), phone=010-...
3개 시나리오가 size=19,20,21 로 거의 동일하게 반복

# 좋음: 합성 시드 + 경계 데이터 표로 축약
Dataset(Examples): size ∈ {0(400), 1(200), 100(200), 101(400)}, memberId={{seed.MEMBER_ID}}
```

## 리뷰 훅
- [ ] 동일 행위의 입력 변형을 **Examples/데이터셋 표**로 묶어 중복을 제거했는가.
- [ ] placeholder 이름이 Examples 헤더와 **정확히 일치**하는가.
- [ ] 데이터 행이 **경계값** 중심인가(임의 중앙값 나열이 아닌가).
- [ ] `Dataset`/`Preconditions`에 **실데이터·PII가 없고** 라운드 넘버 합성 시드만 쓰는가(`SCA-16`).
- [ ] 실값이 필요한 시나리오는 카탈로그에서 제외하고 노트로 분리했는가.
- [ ] 데이터셋이 결정론적이며 재생성 시 동일한가(`SCA-13`).
- [ ] 표로 묶은 것이 "데이터 변형"뿐이고 "로직 분기"를 한 틀에 욱여넣지 않았는가.
