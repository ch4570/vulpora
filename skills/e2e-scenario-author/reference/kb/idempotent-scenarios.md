---
title: 멱등 시나리오 설계 (재실행 안전성)
source: https://www.rfc-editor.org/rfc/rfc9110.html#name-idempotent-methods
last_fetched: 2026-06-24
skills: [e2e-scenario-author]
---

# KB: 멱등 시나리오 / teardown / 의존성 체인

## HTTP 멱등성 정의 (RFC 9110 §9.2.2)
- 어떤 메서드는 **동일 요청을 여러 번 보낸 효과가 한 번 보낸 효과와 같으면** 멱등(idempotent)이다.
- RFC 9110 기준 멱등 메서드: **`GET`, `HEAD`, `PUT`, `DELETE`, `OPTIONS`, `TRACE`**.
- **`POST`는 멱등이 아니다**(재전송 시 중복 생성 가능).
- 멱등성은 **서버 상태의 의도된 효과**에 대한 성질이지, 응답 상태코드 일치를 뜻하지 않는다.
  (예: 같은 자원 `DELETE`를 두 번 하면 두 번째는 404일 수 있으나, "삭제됨"이라는 상태 효과는 동일.)
- **안전(safe) 메서드**(`GET`/`HEAD` 등, §9.2.1)는 상태를 바꾸지 않으므로 자동으로 멱등이다.

| 메서드 | 안전 | 멱등 | E2E 재실행 함의 |
|--------|------|------|------------------|
| GET/HEAD | O | O | teardown 불필요(`Mutates: —`) |
| PUT | X | O | 같은 페이로드 재실행 안전. 그래도 상태 변경이므로 정리 권장 |
| DELETE | X | O | 재실행 안전(이미 삭제됨). 선행 생성에 의존 |
| POST | X | X | **재실행 위험**. 고유 키와 teardown 필수 |

## E2E 시나리오의 멱등성 = "재실행 안전성"
> 카탈로그의 모든 시나리오는 **반복 실행해도 안전**해야 한다. 첫 실행은 통과하고 두 번째는
> 잔여 상태 때문에 실패하는 시나리오는 결함이다.

`Mutates` 선언 규칙(`SCA-17`):
- 순수 GET 등 안전 메서드 → `Mutates: —`.
- POST/PUT/DELETE, 메시지 발행기, outbox 핸들러 → `Mutates: <resource>`(자원 1개 이상 명시).

상태 변경 시나리오는 primary fence 뒤에 **shell teardown fence**를 반드시 둔다. 첫 비어 있지 않은 줄은
`# teardown`이며 runner가 primary 성공·실패·timeout 뒤에도 finally semantics로 실행한다. SQL은 read-only다.

## 재실행 충돌 회피 기법
1. **고유 키(unique key)**: 생성(POST) 시나리오는 재실행마다 충돌하지 않도록 고유 토큰을 쓰거나,
   teardown으로 생성물을 삭제한다. (결정론적 ID 규칙 `SCA-6`과 충돌하지 않게: 시나리오 ID는 결정론,
   런타임 데이터 키는 충돌 회피.)
2. **멱등 메서드 활용**: 가능하면 PUT(upsert 의미)로 설계하면 재실행이 자연히 안전해진다(RFC §9.2.2).
3. **항상 정리**: teardown을 finally 단계로 실행해 다음 실행의 깨끗한 시작을 보장한다.
4. **DELETE의 재실행**: 멱등이므로 안전하나, 삭제 대상이 선행 생성에 의존하면 `Depends-on`으로 묶는다.

## 의존성 체인 (Depends-on)
의존성은 **명시적 배열**로 선언한다(`SCA-9`).
- `Depends-on: [<ID>, <ID>]` — 단일 의존도 배열 형태. 독립이면 리터럴 `—`.
- `Captures: <KEY>, <KEY>` — 선행 시나리오가 남긴 식별자를 후속이 소비. 없으면 `—`.
- 단수형 `depends-on: <ID>` 은 **금지**(runner가 거부).

체인 예(범용):
```text
E2E-ORDER-POST-HAPPY   → Captures: ORDER-ID
E2E-ORDER-GET-HAPPY    → Depends-on: [E2E-ORDER-POST-HAPPY], 입력에 {{ORDER-ID}}
E2E-ORDER-DELETE-HAPPY → Depends-on: [E2E-ORDER-POST-HAPPY], teardown 역할 겸함
```
- **순환 의존 금지**: 자기검증(`SCA-15.DEP-CYCLE`)에서 거부된다.
- 체인은 실행 순서를 강제하므로, 체인 끝에 teardown을 배치하면 멱등성과 의존성을 동시에 만족한다.

## 안티패턴
- POST 생성 시나리오를 teardown 없이 둠 → 실행 위치와 무관하게 재실행 시 누적/충돌.
- teardown을 자유 텍스트로만 적고 fence 없이 둠 → 실행기가 정리 못 함.
- 상태 변경인데 `Mutates: —` 로 선언 → 자기검증이 거부(`SCA-15.BAD-MUTATES`).

## 리뷰 훅
- [ ] 순수 GET/HEAD 시나리오는 `Mutates: —` 인가.
- [ ] POST/PUT/DELETE·발행기·outbox 핸들러는 `Mutates: <resource>` 로 자원을 명시했는가.
- [ ] 모든 상태 변경 시나리오가 **shell teardown fence**를 포함하는가(`SCA-17`).
- [ ] teardown fence가 `# teardown`으로 시작하고 primary 실패에도 실행되는가.
- [ ] 생성(POST) 시나리오가 **재실행 시 충돌하지 않는** 키/정리 전략을 갖는가.
- [ ] `Depends-on`이 **배열 형태**이고 단수형을 쓰지 않았는가(`SCA-9`).
- [ ] 의존 그래프에 **순환이 없는가**(`SCA-15.DEP-CYCLE`).
- [ ] DELETE 시나리오가 선행 생성에 의존하면 `Depends-on`으로 연결했는가.
