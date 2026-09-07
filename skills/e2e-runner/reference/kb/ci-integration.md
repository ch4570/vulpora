---
title: CI에서의 E2E 통합
source: https://docs.spring.io/spring-boot/reference/actuator/endpoints.html, https://docs.nestjs.com/controllers, https://docs.nestjs.com/fundamentals/lifecycle-events, https://docs.gitlab.com/ee/ci/
last_fetched: 2026-08-29
skills: [e2e-runner]
---

# KB: CI에서의 E2E 통합

## 빌드시스템 자동감지 게이트
CI는 특정 빌드도구에 묶지 않고 **저장소를 보고 빌드시스템을 자동감지**한 뒤 그 진입점으로
빌드/기동/테스트한다. Gradle은 후보 중 하나의 예시일 뿐이다.

| 신호 파일 | 감지된 빌드시스템 | 대표 진입점(예시) |
|-----------|------------------|-------------------|
| `build.gradle(.kts)`, `gradlew` | Gradle | `./gradlew :<module>:bootRun`, `:<module>:test` |
| `pom.xml`, `mvnw` | Maven | `./mvnw spring-boot:run`, `./mvnw verify` |
| `package.json` + `package-lock.json` | npm | `npm ci`, `npm run test:e2e` |
| `pnpm-lock.yaml` | pnpm | `pnpm install --frozen-lockfile`, `pnpm --filter <package> run start` |
| `yarn.lock` | yarn | `yarn install --immutable`, `yarn workspace <package> start` |

- 모듈/경로/명령은 **일반 표현**(`<module>`, "변경된 모듈")으로 다룬다. 하드코딩 금지.

## 헬스체크 후 실행 (readiness gate)
**앱이 준비되기 전에 E2E를 던지면 거의 다 환경 탓 실패**가 된다(원칙 4). 그래서 CI는
헬스가 `200`이 된 뒤에만 시나리오를 실행한다.

Spring Boot Actuator(공식 문서):
- **`/actuator/health`**: 종합 상태. `UP`/`DOWN`. 가장 기본 게이트.
- **`/actuator/health/readiness`** / **`/actuator/health/liveness`**: Kubernetes 스타일
  probe 그룹. **readiness** = "트래픽 받을 준비됨", **liveness** = "프로세스 살아있음".
  E2E 게이트는 **readiness가 더 정확**하다(포트가 열려도 의존성 초기화 전일 수 있음).
- readiness가 구성돼 있으면 그것을 우선 쓰고, 아니면 `/actuator/health`가 source of truth
  (`RUN-7`). 헬스 엔드포인트는 민감정보 노출 방지를 위해 기본적으로 상세를 숨긴다.

NestJS:
- `@Controller()` prefix와 method route를 결합하고 bootstrap의 `setGlobalPrefix()`를 반영해
  repository-declared health/readiness endpoint를 확정한다.
- package script 중 `start:e2e`를 우선하고, 없으면 non-watch `start`를 쓴다. `dev`/`start:dev`처럼
  watch mode만 있는 경우 runner가 임의 명령을 만들지 않고 기동 계약 미해결로 중단한다.
- health response의 service/module metadata 등 repository-owned identity signal로 기존 listener가 대상
  module인지 확인한다. 증명할 수 없으면 unknown listener를 adopt하거나 종료하지 않는다.

헬스 대기 패턴(러너):
- framework별로 해석한 readiness endpoint를 일정 interval로 폴링하며 `200`을 기다리되 **유한 deadline**(예
  `RUN-7.0`: `2s` 간격, 최대 `180s`). 타임아웃이면 멈추고 띄운 것들을 정리한다.

## 아티팩트 보존
E2E 산출물은 사후 분석을 위해 CI 아티팩트로 보존한다.

GitLab CI(공식 문서):
```yaml
e2e:
  stage: test
  script:
    - <빌드시스템 자동감지로 앱 기동/헬스대기 후 e2e 실행>
  artifacts:
    when: always           # 실패해도 증거를 남긴다
    paths:
      - test-report/e2e/
    reports:
      junit: test-report/e2e/**/junit.xml   # 있으면 테스트 탭에 노출
    expire_in: 1 week
```
- **`when: always`** 가 핵심 — 실패 시에도 JSON/MD/raw/로그를 남겨야 디버깅 가능하다.
- 보존되는 아티팩트는 **공유**되므로 PII는 기록 시점에 마스킹돼 있어야 한다(KB
  `pii-masking-and-evidence`).

## exit code 규약
CI 파이프라인은 **프로세스 종료코드**로 합/불을 판정한다. 러너의 exit code 매트릭스
(SKILL.md `RUN-18.1`):

| verdict | code | 의미 |
|------|------:|------|
| `PASS` | `0` | 수집·선택·실행이 각각 1건 이상이며 실행 건과 선택 P0가 모두 PASS, cleanup·teardown·absence probe·orphan audit도 PASS |
| `PARTIAL` | `2` | 실행은 있었고 문서화된 selected non-P0 미통과 또는 slow-test 제외만 존재 |
| `BLOCKED` | `3` | 미지원 stack 또는 수집된 테스트 0건 |
| `INCONCLUSIVE` | `4` | 선택/실행 0건, 선택 P0 미통과, 문서화되지 않은 non-P0 공백, cleanup·teardown·absence probe·orphan audit 누락/실패 |

- 실패가 0이라는 사실만으로 PASS가 되지 않는다. 선택·실행·P0·cleanup·teardown·absence probe·orphan audit의 양성 증거가
  모두 있어야 한다. `probeError`도 문서화된 non-P0 공백이면 PARTIAL, P0 또는 증거 공백이면
  INCONCLUSIVE다(`RUN-9.1`, `RUN-18.1`).
- 판정 우선순위는 `BLOCKED > INCONCLUSIVE > PARTIAL > PASS`이다.
- 일반 non-zero verdict의 stderr는 정확히 `ERROR: verdict=<VERDICT>\n` 한 줄이다.
- `--diagnostic-only`는 실행된 선택 P0의 non-PASS만 단독 원인일 때에만 exit 0을 허용하며,
  verdict=INCONCLUSIVE와 qualifying_pass=false는 유지한다.

## 리뷰 훅
- [ ] 빌드/기동/테스트가 **빌드시스템 자동감지**로 정해지는가(특정 도구 하드코딩 없음).
- [ ] E2E 실행 전에 **framework별 repository-declared 헬스 게이트**를 통과시키는가.
- [ ] 헬스 대기가 **유한 deadline** polling인가(무한 대기 없음).
- [ ] 산출물을 CI 아티팩트로 **`when: always`** 보존하는가(실패 시에도).
- [ ] 보존 아티팩트의 PII가 마스킹돼 있는가(공유 경로 위험).
- [ ] PASS에 수집·선택·실행·P0·cleanup·teardown·absence probe·orphan audit의 양성 증거가 모두 있는가.
- [ ] PARTIAL/BLOCKED/INCONCLUSIVE가 각각 2/3/4이며 stderr가 정확한가.
- [ ] `--diagnostic-only`가 선택/실행 0건이나 lifecycle 실패를 우회하지 않는가.
