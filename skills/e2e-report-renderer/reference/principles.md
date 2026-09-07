# E2E Report Renderer 핵심 원칙 (Principles)

> 이 문서는 `e2e-report-renderer` 스킬이 판단 근거로 삼는 "헌법"이다. KB(`kb/*.md`)가
> **공식 문서 기반 사실·규칙**이라면, 이 문서는 그 규칙을 관통하는 **통찰·판단 기준**이다.
> 충돌 시 **KB(공식 문서)가 principles보다 우선**하며, SKILL.md의 `REN-n` 규범 규칙이
> 운영상 최종 권위를 가진다.
>
> **출처(Sources)**
> - JUnit5 User Guide — Build/Reporting, Maven Surefire/Ant JUnit XML 스키마
>   (https://junit.org/junit5/docs/current/user-guide/#running-tests-build-reporting)
> - Google Testing Blog — "Flaky Tests at Google and How We Mitigate Them"
>   (https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html)
> - Allure Report Docs — 추세(trend)·첨부(attachments) 개념
>   (https://allurereport.org/docs/)
> - Playwright — Trace Viewer (https://playwright.dev/docs/trace-viewer)
> - WCAG 2.2 — Understanding Contrast (Minimum)
>   (https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
> - OWASP — Cross Site Scripting Prevention Cheat Sheet
>   (https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
> - MDN — Node.textContent (https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent)
>
> 이 스킬은 실행기(runner)가 생성한 데이터의 **뷰(view) 계층**이다. 결과를 재해석하거나
> 만들어내지 않는다.

---

## 0. 대전제: 리포트는 "데이터의 충실한 그림"이지 "새로운 데이터"가 아니다

- 렌더러는 입력 JSON을 **시각화**할 뿐, 합격/불합격을 다시 판정하지 않는다.
- 화면에 보이는 모든 숫자·상태·메시지는 입력 JSON에서 **추적 가능**해야 한다.
- "보기 좋게 하려고" 수치를 보정·반올림·재계산하는 행위는 데이터 위조다.

---

## 1. 뷰 계층은 결과를 절대 재해석하지 않는다 (view-layer-never-reinterprets)

근거: SKILL.md `REN-1`, `REN-2`, `REN-12.2`(`total`은 `summary.total`을 그대로 복사).

1. **집계 숫자는 JS에서 다시 더하지 않는다.** `total`은 입력의 `summary.total`을 **문자 그대로
   복사**한다. 합산 검증(`total == pass + fail + skipped + ...`)은 *읽을 때 1회* 수행하고,
   불일치하면 렌더링을 멈춘다(`REN-5.SUMMARY-MATH`). 화면에서 매번 재계산하지 않는다.
2. **상태값(`PASS`/`FAIL`/`SKIPPED`/`FAILED-DEPENDENCY`)은 데이터 리터럴이다.** 번역·매핑으로
   바꾸지 않는다. UI 라벨(한국어)은 표시용일 뿐, `dataset.status` 조인은 원본 영문 값을 쓴다.
3. **실패를 "성공처럼" 또는 "스킵처럼" 보이게 하는 모든 변환을 금지한다.** 색·글리프·정렬은
   가독성을 위한 것이지 의미를 바꾸기 위한 것이 아니다.
4. 렌더러는 실행기·도커·테스트를 **실행하지 않는다**(`REN-3`). 디스크의 기존 파일만 읽는다.

---

## 2. 단일 공유 산출물은 가장 높은 마스킹 의무를 진다 (single-artifact = highest masking duty)

근거: SKILL.md `REN-13`(마스킹은 권고가 아니라 필수), OWASP XSS Prevention.

1. 렌더 결과 HTML은 **파이프라인에서 가장 공유되기 쉬운 산출물**이다(채팅 스레드, PR 코멘트,
   첨부 등으로 그대로 흘러간다). 따라서 마스킹은 **마지막 방어선이 아니라 추가 방어선**이다.
2. 실행기가 이미 마스킹했더라도 렌더러는 **다시 마스킹한다**(2차 방어). 본문(response body),
   로그 꼬리, 증거 텍스트 등 주입되는 모든 동적 텍스트가 대상이다.
3. 이미 마스킹된 값(예: `<MASK:...>` 형태)은 **그대로 둔다**(이중 마스킹으로 의미 훼손 방지).
4. 마스킹과 XSS 방지는 별개 의무다. 마스킹은 PII 유출을, 이스케이프는 코드 주입을 막는다.
   둘 다 적용한다.

---

## 3. 접근성은 타협 불가다 (accessibility-is-non-negotiable)

근거: SKILL.md `REN-10`, `REN-11.1`, WCAG 2.2 Contrast (Minimum) 1.4.3.

1. **색만으로 정보를 전달하지 않는다.** 상태는 항상 **색 + 글리프(아이콘/기호)** 로 표현한다
   (`✓` PASS, `✕` FAIL, `–` SKIPPED, `?` PROBE-ERROR, `⤴` FAILED-DEPENDENCY).
   색각 이상 사용자도 구분할 수 있어야 한다.
2. **대비는 WCAG AA 이상**을 만족한다. 본문 텍스트 4.5:1, 큰 텍스트 3:1. 검증된 토큰 쌍만
   사용하고, 새 색 조합을 즉흥적으로 만들지 않는다.
3. UI 라벨은 **한국어**가 기본이다(요약 카드, 필터, 표 헤더, 푸터, 빈/오류 상태 메시지).
4. 접근성은 "여유 있을 때 하는 것"이 아니라 렌더의 **합격 조건**이다.

---

## 4. 충실하게 그리거나, 아예 그리지 않는다 (faithful-or-nothing)

근거: SKILL.md `REN-5`(잘못된 JSON의 best-effort 렌더링 금지), `REN-16`, `REN-17`.

1. **스키마/계약 검증을 통과하지 못한 JSON은 렌더링하지 않는다.** 누락 필드, 버전 불일치,
   합산 불일치, 깨진 의존성 참조가 있으면 **명확한 오류로 멈춘다**. "그릴 수 있는 만큼만"
   그리는 절충은 금지다.
2. **미정착(unsettled) run은 그리지 않는다.** `.done` 마커가 있는 정착된 run만 대상이다
   (`REN-17`). 진행 중 데이터는 일관성을 보장할 수 없다.
3. **입력이 없으면 빈 페이지를 만들지 않는다.** 명확한 오류 메시지를 출력하고 비정상 종료한다
   (`REN-16`). 빈 리포트는 "테스트가 0건 통과"라는 거짓 인상을 준다.
4. 단, **부분적 열화(degradation)는 허용**된다(`REN-22`): 아티팩트(raw/log) 파일이 없으면
   해당 행에 "아티팩트 없음"을 표시하고 나머지는 정상 렌더한다. 이는 알려진 열화 상태이지
   데이터 손상이 아니다. — 검증 실패(2차 위조 위험)와 아티팩트 부재(정보 부족)를 구분한다.

---

## 5. 출력 파일명은 결정적이다 (determinism-of-filenames)

근거: SKILL.md `REN-4`, `REN-18`, `REN-19`.

1. **같은 입력 → 같은 파일명.** 파일명은 우연이 아니라 규칙으로 정해진다.
2. **single-run**: `{run-id}.html` (JSON 옆에).
3. **trend**: `trend-N{실제개수}-{YYYY-MM-DD}.html`. 요청한 N이 아니라 **실제 사용된 개수**를
   넣는다(정착 run이 부족하면 있는 만큼).
4. **compare**: 두 run ID를 **사전식(lexicographic)으로 정렬**한 뒤 `compare-{min}-vs-{max}.html`.
   (A, B)와 (B, A)가 **같은 산출물로 수렴**하게 만들어 중복·혼동을 막는다.
5. 결정성은 자동화·캐싱·재현성의 전제다. 타임스탬프 난수나 호출 순서에 의존하지 않는다.

---

## 6. 단일 파일·오프라인 자급자족 (self-contained, zero external resource)

근거: SKILL.md `REN-6`, `REN-7`, `REN-8`.

1. 출력 HTML은 **외부 리소스 0개**: CDN 스크립트, 웹폰트, 원격 이미지 금지. CSS·JS·폰트(시스템
   스택)·데이터·인라인 SVG 전부 단일 `.html` 안에 둔다.
2. **빌드 스텝 없음**: 번들러·트랜스파일러·`node_modules` 없이 손으로 쓴 CSS(`:root` 변수)와
   바닐라 JS(ES2020)만 사용한다.
3. 본문·로그는 **링크가 아니라 인라인**(`<pre>`)으로 임베드한다. "파일 하나만 공유" 속성을
   링크가 깨뜨린다. 다만 크기 상한(`REN-14`)을 지키고, 초과 시 잘라내기 fallback을 적용한다.
