---
title: HTTP/REST E2E 실행과 검증
source: https://github.com/rest-assured/rest-assured/wiki/Usage, https://www.jetbrains.com/help/idea/http-client-in-product-code-editor.html
last_fetched: 2026-06-24
skills: [e2e-runner]
---

# KB: HTTP/REST E2E 실행

## 무엇을 단언하는가 (단언 대상 3종)
실행 중인 HTTP API에 요청을 보내고 **응답의 세 층**을 검증한다.

| 층 | 단언 대상 | 예시 |
|----|----------|------|
| **상태줄** | HTTP status code | `200 OK`, `201 Created`, `404 Not Found`, `5xx`는 즉시 `FAIL` |
| **헤더** | 응답 헤더(존재/값) | `Content-Type: application/json`, `Location`, `ETag`, `Cache-Control` |
| **본문** | body의 값/구조 | JSON path 값, 배열 크기, 스키마 일치 |

- **상태코드는 1차 게이트다.** REST-assured에서 `5xx`/예상 밖 코드는 첫 응답에서 실패로
  본다. 러너는 5xx를 받으면 **첫 응답에서 `FAIL`** 이며 재요청하지 않는다(`RUN-2.1`).
- 본문 단언은 **JSON path** 기반이 안전하다(필드 순서·공백에 둔감). 전체 문자열 비교는
  취약하다.

## `.http` 파일 형식 (JetBrains HTTP Client)
`.http`/`.rest` 파일은 IntelliJ/`httpyac`/VS Code REST Client 등에서 공유되는 **텍스트
기반 요청 정의 형식**이다. 사람이 읽고 버전관리하기 좋다.

```http
### 단건 조회
GET http://localhost:8080/api/v1/articles/{{articleId}}
Accept: application/json

> {%
  client.test("status is 200", function() {
    client.assert(response.status === 200, "expected 200");
  });
  client.global.set("ETAG", response.headers.valueOf("ETag"));
%}

### 다음 요청에서 캡처 변수 사용
POST http://localhost:8080/api/v1/articles
Content-Type: application/json
If-Match: {{ETAG}}

{ "title": "demo" }
```

규칙(공식 문서):
- 요청 구분자는 `###`. 한 파일에 여러 요청을 순서대로 둔다.
- `{{var}}` 는 변수(환경 파일 `http-client.env.json` 또는 응답 핸들러에서 set).
- `> {% ... %}` 는 **응답 핸들러 스크립트**: `client.test(...)`로 단언, `client.global.set(...)`로
  후속 요청에 넘길 값을 캡처한다. → 러너의 `Captures`/`{{prev.KEY}}` 모델과 동일한 발상.
- 본문은 헤더 뒤 빈 줄 다음에 온다.

## REST-assured given/when/then DSL
JVM 진영의 사실상 표준 HTTP e2e 검증 DSL. **BDD 스타일 3단**으로 읽힌다.

```java
given()
    .baseUri("http://localhost:8080")
    .header("Accept", "application/json")
    .pathParam("id", articleId)
.when()
    .get("/api/v1/articles/{id}")
.then()
    .statusCode(200)
    .contentType("application/json")
    .header("ETag", notNullValue())
    .body("title", equalTo("demo"))
    .body("tags.size()", greaterThan(0))
    .time(lessThan(2000L));   // 지연 단언
```

핵심 규칙(REST-assured Usage):
- **`given()`** = 요청 사양(헤더/파라미터/바디/인증), **`when()`** = 동작(HTTP 메서드+경로),
  **`then()`** = 응답 단언. 세 블록의 책임을 섞지 않는다.
- 본문 단언은 **GPath/JSON path**: `body("store.book[0].title", equalTo(...))`,
  `body("size()", is(3))`. XML도 동일 문법.
- `extract()` 로 응답에서 값을 뽑아 후속 요청에 전달한다(러너 `Captures` 등가):
  `String id = ...extract().path("id");`
- `time(lessThan(...))` 로 응답 지연을 단언할 수 있다 — 러너는 지연을 **증거로 항상 캡처**한다.
- 인증: `.auth().oauth2(token)`, `.auth().preemptive().basic(u,p)`.

## 멱등성/메서드 의미 (단언 설계의 전제)
- `GET`/`HEAD`/`PUT`/`DELETE`는 멱등, `POST`는 비멱등. 비멱등 시나리오는 `Mutates:`를
  선언하고 teardown으로 원복해야 재실행 가능(KB `test-environment-and-data`).
- `201 Created`는 보통 `Location` 헤더를 동반한다 → 생성 결과의 식별자를 거기서 캡처.

## 리뷰 훅
- [ ] 상태코드를 단언하는가. `5xx`/예상 밖 코드를 첫 응답에서 `FAIL`로 처리하는가(재요청 금지).
- [ ] `Content-Type`·필요한 응답 헤더(`Location`/`ETag` 등)를 검증하는가.
- [ ] 본문 단언이 **JSON path 기반**인가(전체 문자열 비교로 취약하지 않은가).
- [ ] 후속 요청에 넘길 값을 명시적 캡처(`extract()` / `client.global.set` / `Captures`)로 받는가.
- [ ] 비멱등(`POST` 등) 요청 시나리오가 `Mutates:`+teardown을 갖는가.
- [ ] 응답 지연을 증거로 남기는가(필요하면 임계 단언 `time(lessThan(...))`).
- [ ] 응답 본문/헤더의 PII가 리포트에 기록되기 전에 마스킹되는가(KB `pii-masking-and-evidence`).
