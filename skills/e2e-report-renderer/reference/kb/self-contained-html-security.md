---
title: 단일 자급자족 HTML 보안 — XSS·이스케이프·CSP
source: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
last_fetched: 2026-06-24
skills: [e2e-report-renderer]
---

# KB: 단일 HTML 보안 (외부 리소스 0 / XSS 방지 / CSP)

리포트는 신뢰할 수 없는 캡처 데이터(상류 서비스가 만든 응답 본문·헤더·로그)를 그대로
임베드한다. 단일 HTML이라도 — 아니 **가장 공유되기 쉬운 단일 HTML이기에** — 보안이 핵심이다.
근거: OWASP XSS Prevention Cheat Sheet, MDN `Node.textContent`
(https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent).

## 1. 외부 리소스 0 (공급망·추적·오프라인)

- CDN 스크립트·웹폰트·원격 이미지 **금지**(SKILL.md `REN-6`). 전부 단일 `.html` 안에:
  손으로 쓴 CSS(`:root` 변수), 바닐라 JS(ES2020), 시스템 폰트 스택, 인라인 SVG.
- 효과: 공급망 공격(변조된 CDN) 차단, 외부 추적 제거, 오프라인 동작, CSP 단순화.
- 빌드 스텝·`node_modules` 없음(`REN-7`).

## 2. XSS 방지 — `textContent` 우선, `innerHTML` 금지

OWASP 1순위 규칙: **신뢰할 수 없는 데이터는 출력 컨텍스트에 맞게 인코딩한다.** 가장 안전한
방법은 데이터를 **HTML로 해석시키지 않는 것**이다.

- 동적 텍스트(목적·실제·증거·로그 꼬리·응답 본문)는 **`textContent`로 삽입**한다
  (SKILL.md `REN-9`). `textContent`는 문자열을 **그대로 텍스트로** 넣어 `<`, `>`, `&` 를
  마크업으로 해석하지 않는다(MDN). 따라서 본문에 `<script>`나 `<img onerror=...>`가 있어도
  실행되지 않는다.
- **`innerHTML`에 미이스케이프 runner 데이터 주입 금지.** 부득이 HTML을 만들어야 하면 먼저
  HTML 엔터티 이스케이프(`& < > " '`)를 거친다.
- 속성에 값을 넣을 땐 속성 컨텍스트 이스케이프, URL을 넣을 땐 URL 컨텍스트 검증을 추가로
  적용한다(OWASP: 컨텍스트별 인코딩).

### HTML 엔터티 이스케이프 최소 집합
| 문자 | 치환 |
|------|------|
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| `"` | `&quot;` |
| `'` | `&#x27;` |

## 3. JSON 인라인 시 `</` 이스케이프 (스크립트 블록 조기 종료 방지)

run JSON을 `<script type="application/json">` 블록에 인라인할 때, **HTML 파서는 JSON을
모른다.** 문자열 값 안에 리터럴 `</script>`가 있으면 파서가 스크립트 블록을 **거기서 종료**해
페이지가 깨지고(양성), 악의적 입력이면 XSS로 이어진다(악성).

- 규칙: 삽입 전에 JSON 텍스트의 **모든 `</` 를 `<\/` 로 치환**한다(SKILL.md `REN-7.1`).
  `\/`는 JSON에서 `/`와 동일하게 파싱되므로 데이터 의미는 보존되고 HTML 파서의 `</script>`
  매칭만 깨진다.
- 이 위험은 상류 서비스가 만든 응답 본문을 runner가 충실히 캡처한 경우 현실적으로 발생한다.

## 4. CSP 관점 (defense-in-depth)

- 단일 HTML은 보통 `file://` 또는 첨부로 열리므로 서버 헤더 CSP를 못 건다. 그래서 **외부
  리소스 0 + `textContent`** 가 1차 방어다.
- 그럼에도 인라인 스크립트가 필요하므로 `'unsafe-inline'`을 쓰게 되는데, 이는 외부 소스를
  전부 제거(`REN-6`)함으로써 위험 표면을 최소화하는 설계로 상쇄한다. 인라인 데이터를 코드로
  실행하지 않는 한(=`textContent`/JSON 파싱만) 주입 경로가 없다.
- 호스팅된 환경이라면 `default-src 'self'`, `object-src 'none'`, `base-uri 'self'` 같은
  보수적 정책을 추가로 권장한다.

## 5. 신뢰할 수 없는 캡처 데이터 + 마스킹

- 응답 본문·헤더·로그는 **외부 입력으로 취급**한다(절대 신뢰 금지).
- XSS 이스케이프와 별개로, **마스킹(PII)** 을 반드시 한 번 더 적용한다(SKILL.md `REN-13`).
  렌더 결과는 가장 공유되기 쉬운 산출물이므로 under-masking은 PII를 채팅·PR로 누출시킨다.
- 이미 `<MASK:...>`로 마스킹된 값은 그대로 둔다(이중 마스킹 방지).
- 정리: **이스케이프(코드 주입 차단) + 마스킹(정보 누출 차단)** 은 별개 의무이며 둘 다 적용.

## 리뷰 훅
- [ ] 출력 HTML에 외부 URL 참조가 0개인가(CDN/웹폰트/원격 이미지 없음).
- [ ] 모든 runner 유래 동적 텍스트를 `textContent` 또는 사전 이스케이프로 주입하는가.
- [ ] 미이스케이프 데이터를 `innerHTML`에 넣는 경로가 없는가.
- [ ] JSON 인라인 시 모든 `</`를 `<\/`로 치환하는가(`REN-7.1`).
- [ ] 속성/URL 컨텍스트에 맞는 인코딩을 적용하는가.
- [ ] 본문·헤더·로그를 외부 입력으로 취급하는가(무조건 신뢰 금지).
- [ ] XSS 이스케이프와 별도로 PII 마스킹을 한 번 더 적용하는가(`REN-13`).
- [ ] 이미 마스킹된 값(`<MASK:...>`)을 재마스킹하지 않는가.
- [ ] 빌드 스텝·`node_modules` 없이 바닐라로 구성되는가(`REN-7`).
