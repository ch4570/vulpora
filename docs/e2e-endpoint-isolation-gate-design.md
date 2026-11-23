# 접속 대상 관측과 모델 밖 차단 — E2E 격리 게이트 설계

상태: **구현 중 (E1)** — 오너 결정 반영 2026-11-23, 구현 시작 2026-11-23. E2~E4는 구현 전
작성일: 2026-11-23
기준 커밋: `698b670` (작업 브랜치 `docs/ch4570/verification-gate-designs`)
범위: E2E·통합 실행 경로(`e2e-test-workflow`, `e2e-runner`, `playwright-e2e`, `e2e-evidence-report`)와
그 판정 스크립트. 좁은 통합 테스트(`test-authoring`, `backend-test-author`)와 pre-commit 훅은 4단계에서 다룬다.
이 문서가 쓰인 시점에는 스킬·에이전트·스크립트·CI를 바꾸지 않았다. 구현은 14절의 PR 단위로 나눠 진행하고, 지금은 E1(1단계)이 진행 중이다.

> 이 문서에 쓴 사고 3건은 오너가 알려 준 설명을 바탕으로 했고, 원본 실행 기록은 보지 못했다.
> 저장소 규칙(STANDARD §3)에 따라 서비스 이름은 `<service>`로 바꿔 적었다.

### 오너 결정 (2026-11-23)

| 질문(9절) | 결정 | 이 문서에 반영한 곳 |
|---|---|---|
| 1. 공유 자원에 실제로 닿은 경우 | 새 판정 `ISOLATION_BREACH`를 둔다 | 6-2, 14절 PR E1 |
| 2. 차단을 어디까지, 어떤 순서로 | 단계적: 관찰만 → macOS 차단 → 실행(런타임) 샌드박스 | 10절, 14절 |
| 2의 남은 확인(14-1 "기동 전 예외") | **1단계에서도 실행 직전에 LISTEN 중인 공유 포트를 가리키면 기동을 거부한다.** 관찰만이 아니라 기동 거부까지 E1에 넣는다. 거부는 판정 `BLOCKED`로 기록되고, 우회는 사람이 쓴 허용 예외 파일(소유자·사유·만료일 필수)로만 하며 적용 사실이 결과에 남는다 | 6-2, 14-1 "기동 전 거부" |
| 3~8 | 아직 답 없음. 14절의 PR 계획은 각 질문의 추천값을 기본으로 가정하고, 어느 PR이 어느 답에 걸리는지 표시했다 | 9절, 14-4 |

관련 결정(짝 문서 [심사단 합의 게이트와 red team](review-panel-red-team-gate-design.md)의 오너 결정 3·4번)도 여기서 함께 기록한다.
이 문서의 공유 장치(감싸는 스크립트, 격리 영수증)를 red team 재현 실행이 쓰기 때문이다.

| 날짜 | 기록 |
|---|---|
| 2026-11-23 | 재현된 결함은 사람이 "오탐"으로 풀 수 없는 하한선으로 둔다(짝 문서 장치 4). 적용은 R2·R3 때이고 E1에는 영향이 없다 |
| 2026-11-23 | red team 합의 의견에도 거부권을 인정한다(짝 문서 3-(h)). 적용은 R2 때이고 E1에는 영향이 없다 |
| 2026-11-23 | **구현 시작(E1·R1).** E1(1단계: 관찰, 기동 거부, `ISOLATION_BREACH`)과 짝 문서의 R1(관찰·신호)을 함께 구현한다. 구현에서 설계와 달라진 곳은 14-5에 모았다 |

---

## 1. 요약

- **지금 게이트는 환경을 보지 않는다.** `validate-run-result.js`는 `environment` 키가 있는지만 보고,
  `evaluate-run-verdict.js`는 `environment`를 아예 읽지 않는다. 저장소의 자체 테스트도 엔드포인트가 하나도 없는
  `environment`로 검증을 통과시킨다. 앞선 보고서의 약점 1은 맞았고, 실제로는 보고서가 짐작한 것보다 넓다(2절).
- **관측은 앱 안과 앱 밖을 함께 쓴다.** 앱 안에서는 키와 상관없이 설정값 전체에서 주소 모양의 값을 찾고(기동 전),
  실제로 만들어진 클라이언트 객체의 주소를 읽는다(기동 직후). 앱 밖에서는 테스트 프로세스의 소켓을 본다(실행 중·사후).
  설정 키를 틀려도 잡히는 것은 클라이언트 객체 관측과 소켓 관측이다. 하니스가 적어 낸 값만 보는 지금 방식은
  키 오류에 속수무책이다.
- **차단은 테스트 프로세스를 감싸는 샌드박스로 한다.** macOS에서는 실행 직전에 이미 열려 있던 포트를 모두
  "남의 것"으로 보고 그쪽으로 나가는 연결을 막는다. 루프백이 아닌 주소(dev·stg 포함)로 나가는 연결도 막는다.
  환경변수는 허용 목록만 넘긴다. 앱을 컨테이너로 옮겨 `--internal` 네트워크에 가두는 방법은 확실하지만
  지금 구조(호스트 JVM에서 도는 Spring 테스트)를 크게 바꿔야 해서 2순위로 둔다.
- **판정은 셋으로 나눈다.** 기동 전에 걸리면 `BLOCKED`(아무것도 안 건드림), 실행 중 시도가 차단되면 `BLOCKED`
  (설정 결함, 피해 없음), 공유 대상에 실제로 연결됐으면 새 판정 `ISOLATION_BREACH`(PASS 금지, 사고 보고 필수,
  우회 불가). 증거 파일이 없으면 `INCONCLUSIVE`.
- **"모델이 어떻게 행동하든"은 단계적으로만 얻을 수 있다.** 같은 사용자 계정으로 셸을 쥔 에이전트는 감싸는
  스크립트를 건너뛸 수 있다. 실수(사고 1·2의 유형)는 1~2단계로 막힌다. 고의적 우회는 에이전트 런타임의 샌드박스로도
  끝까지 막히지 않는다. Testcontainers에 필요한 Docker 소켓으로 공유 포트에 닿는 컨테이너를 띄울 수 있기 때문이다.
  끝까지 막으려면 공유 자원에 에이전트가 모르는 자격증명을 걸거나, 공유 자원이 없는 곳에서 E2E를 돌려야 한다.
  이 경계를 문서와 판정 결과에 그대로 적는다.
- **추천**: 1단계(환경 스키마 강화 + 키 무관 설정 스캔 + 클라이언트 관측 + 소켓 관찰, 관찰만) → 2단계(macOS
  샌드박스 차단과 영수증 필수화) → 3단계(런타임 샌드박스, Linux CI) → 4단계(좁은 통합 테스트와 훅).

---

## 2. 출발점: 지금 게이트가 실제로 보는 것

앞선 보고서는 grep과 부분 읽기로 "판정 스크립트가 엔드포인트가 run 소유인지 검사하지 않는다"고 적었고,
다른 스크립트가 검사할 가능성은 배제하지 못했다고 했다. 이번에 관련 파일을 끝까지 읽고 확인했다.

| 위치 | 하는 일 | 엔드포인트 소유 확인 |
|---|---|---|
| `skills/e2e-runner/scripts/validate-run-result.js:40` | 루트 필드 10개가 `undefined`가 아닌지만 본다. `environment`도 그중 하나 | 없음. 빈 객체 `{}`도 통과 |
| `skills/e2e-runner/scripts/evaluate-run-verdict.js` 전체 | `selection`, `execution`, `testCases`, `lifecycle`만 읽는다 | 없음. `environment`라는 단어가 파일에 없음 |
| `skills/e2e-runner/scripts/assemble-run-result.js:113` | 하니스가 낸 `environment`를 `owner` 하나 붙여 그대로 복사하고 마스킹만 한다 | 없음 |
| `skills/e2e-runner/tests/harness-pipeline.test.js:93`, `:119` | `environment: {owner, images: ['postgres:16']}`(엔드포인트 없음)로 조립한 결과가 `--require-done` 검증을 통과(exit 0)하는 것을 정상으로 확인한다 | 없음이 의도된 동작으로 굳어 있음 |
| `skills/e2e-scenario-author/reference/e2e-scenario-contract.md` §5 | 결과 JSON 루트에 `environment`가 있어야 한다고만 쓴다 | 내부 구조 정의 없음 |
| `skills/e2e-evidence-report/reference/evidence-schema.md:13` | `environment`는 자유 문자열(`"app http://127.0.0.1:<mapped port>, postgres container <id prefix>"`) | 렌더러는 DB 검증 쿼리의 대상이 run 소유인지 대조하지 않음 |
| `skills/test-quality-review/scripts/validate-review-report.js:225` | 파괴적 정리 작업마다 `disposable_endpoint: true`를 요구 | 모델이 적는 불리언. 관측과 연결되지 않음 |
| `skills/playwright-e2e/SKILL.md` PW-0, PW-5 | `environment.json`을 쓰고 상태 엔드포인트가 run 소유여야 한다고 규정 | 규칙 문장. 확인 스크립트 없음 |
| `agents/backend-test-author.md:141` | "격리된 test-only container와 localhost test endpoint 사용" | `localhost`는 소유를 뜻하지 않는다. 사고 때의 공유 Redis(16379)도 `localhost`였다 |
| `templates/githooks/README.md:51` | 통합 테스트가 로컬 DB·인프라에 의존할 수 있다고 안내 | pre-commit이 돌리는 테스트가 공유 로컬 DB에 붙는 것을 전제로 둠 |

결론은 이렇다.

1. **보고서의 약점 1은 맞다.** RUN-7.1("PASS 전에 모든 상태 의존 속성이 run 소유 매핑 엔드포인트로 풀린다는 것을
   증명하라")을 기계로 확인하는 코드는 이 저장소 어디에도 없다. 보고서가 남긴 단서("다른 스크립트가 검사할 가능성")도
   `assemble-run-result.js`를 끝까지 읽어 보니 해당하지 않았다.
2. **범위가 더 넓다.** E2E 판정만이 아니라 증거 보고서(DB 검증 대상), 테스트 품질 감사(파괴적 정리의 소유),
   테스트 작성 에이전트(`localhost`를 소유로 취급)까지 모두 "모델이 적은 문장"을 소유의 근거로 쓴다.
3. **그래서 사고 때 보고서가 "run 소유 환경만 썼다", "공유 자원 접속 0"이라고 적은 것은 이상한 일이 아니다.**
   게이트가 그 문장을 확인할 수단이 없으니, 문장이 틀려도 통과한다.

행동 평가(`evals/behavioral/cases/e2e-evidence-report/shared-db-refused.yaml` 등)도 "공유 DB에 붙어 달라는 요청을
말로 거절하는가"를 본다. 사고 1·2는 에이전트가 거절할 상황을 인식하지 못한 채 설정이 조용히 공유 쪽으로 풀린
경우라, 이런 평가로는 잡히지 않는다.

---

## 3. 사고 3건을 시험 문제로 다시 쓰기

| # | 일어난 일 | 게이트가 알아야 했던 것 | 이 설계의 담당 |
|---|---|---|---|
| 1 | E2E 워커가 실제 `<service>-api`를 기본 설정으로 띄워 공유 로컬 Redis(`localhost:16379`)와 LocalStack S3(`localhost:4566`)에 E2E 데이터를 썼다. 기동 전 접속 대상 확인이 없었고 게이트도 몰랐다 | 기동 전: 앱이 해석할 접속 대상이 run 소유 목록에 없다. 실행 중: 공유 포트로 연결이 나간다 | 기동 전 스캔, 샌드박스 차단, 소켓 관측 |
| 2 | 하니스가 넣은 Redis 설정 키와 앱이 실제로 읽는 키가 달랐다(표준 `spring.data.redis.*`와 서비스 접두사가 붙은 `spring.data.redis.<service>.*`). 앱은 기본값대로 공유 Redis에 읽기 접속(PING, GET)을 했는데 보고서는 "공유 자원 접속 0"이라고 적었다. 한참 뒤 다른 워커가 우연히 발견했다 | 하니스가 넣은 값이 아니라 앱이 쓴 값. 읽기 접속도 접속이다 | 클라이언트 객체 관측, 키 무관 스캔, 소켓 관측, 사람이 쓰지 않는 영수증 |
| 3 | 코드 리뷰(java-spring, architecture, security 워크플로)가 동시성 문제를 읽기만 하고 실행으로 재현하지 못해 "추정"으로 끝났다 | 이 설계의 직접 대상이 아니다. 다만 재현 실행을 허용하려면 그 실행이 공유 자원에 닿지 않는다는 보장이 먼저 필요하다 | 간접(격리된 재현 환경의 전제). 본 처방은 [심사단 합의 게이트와 red team](review-panel-red-team-gate-design.md) |

---

## 4. 관측: 무엇을 보면 믿을 수 있나

### 4-1. 관측 수단 비교

"키 오류에 강하다"는 하니스가 키를 틀려도 실제 접속 대상을 잡아낸다는 뜻이다. "우회"는 에이전트가 그 관측을
끄거나 건너뛸 수 있는지다.

| ID | 관측 수단 | 시점 | 키 오류에 강한가 | 놓치는 것 | 우회 가능성 | 판단 |
|---|---|---|---|---|---|---|
| O1 | 하니스가 적은 `environment.json` | 사후 | 아니다. 하니스가 넣은 키와 값만 적는다 | 앱이 실제로 쓴 값 전부 | 모델이 쓰는 파일이라 내용 자체를 믿을 수 없음 | 지금 방식. 단독 근거로 쓰지 않는다 |
| O2 | 키 무관 설정 스캔: 앱의 모든 property source를 훑어 호스트·포트·URL 모양의 값을 찾고 run 소유 목록과 대조 | 기동 전 | 대체로 강하다. 사고 2에서 앱이 읽는 키의 값(공유 주소)이 그대로 남아 있으므로 잡힌다 | 코드에 박힌 주소, 라이브러리 기본값(예: Redis 클라이언트의 기본 `localhost:6379`), 실행 중에 조립되는 주소 | 하니스 코드라 에이전트가 지우거나 끌 수 있음 | 1단계 필수. 싸고 기동 전에 막는다 |
| O3 | 클라이언트 객체 관측: 컨텍스트가 뜬 직후 `DataSource` URL, `RedisConnectionFactory` 호스트·포트, S3 클라이언트 endpoint, Kafka bootstrap 주소 등을 빈에서 읽음 | 기동 직후, 첫 시나리오 전 | 강하다. 실제로 연결에 쓸 값이다 | 알려진 타입이 아닌 클라이언트, 요청 시점에 따로 만드는 클라이언트 | O2와 같음 | 1단계 필수. 사고 2를 정확히 겨냥한다 |
| O4 | Actuator `env`, `configprops` | 기동 후 | O2·O3의 약한 형태 | Spring Boot 3.x는 두 엔드포인트의 값을 기본으로 모두 `******`로 가리고, HTTP로는 `health`만 노출한다. 보려면 값 표시와 노출 설정을 바꿔야 한다. 직접 만든 빈은 안 보임 | 같음 | 쓰지 않는다. 같은 정보를 하니스 안에서 직접 읽는 편이 낫고, 노출 설정을 바꾸는 것 자체가 공격면이 된다 |
| O5 | 소켓 폴링: 테스트 프로세스 트리의 연결을 `lsof`로 주기적으로 읽음 | 실행 중·사후 | 강하다. 키·코드와 무관 | 폴링 사이에 열고 닫힌 짧은 연결(사고 2의 PING·GET처럼 짧을 수 있음) | 프로세스 밖이지만 같은 사용자 권한. 감싸는 스크립트를 건너뛰면 없음 | 1단계에 관찰용으로 넣는다 |
| O6 | 패킷 관측: 루프백에서 공유 포트로 가는 연결 시작(SYN)을 잡음. macOS `tcpdump`는 PKTAP 인터페이스(`-i pktap,lo0 -k NP`)에서 패킷마다 프로세스 이름과 PID를 붙일 수 있다(Apple 수정판 기능) | 실행 중 | 강하다. 짧은 연결도 잡는다 | 없음에 가깝다 | 이 머신의 `/dev/bpf*`는 `root:wheel` 전용이라 루트가 필요하다 | 보조. 루트 권한 때문에 기본값으로 두지 않는다 |
| O7 | 샌드박스 거부 기록: 차단 정책이 막은 연결 시도의 로그 | 실행 중 | 강하다 | 정책이 허용한 연결(허용 목록이 틀렸을 때) | 샌드박스 밖에서 실행하면 없음 | 2단계. 차단과 관측이 한 번에 된다. 거부 로그를 어디서 어떤 권한으로 읽는지는 확인하지 못했다 |
| O8 | JVM 내장 기록(Java Flight Recorder `jdk.SocketRead`/`jdk.SocketWrite`) | 실행 중 | 강하다 | 연결만 하고 읽기·쓰기가 없는 시도(JDK 25에는 연결 이벤트가 없음), 기본 임계값(JDK 25는 1ms)보다 짧은 입출력, 네이티브 전송 계층(Netty kqueue 등)을 쓰는 클라이언트(추정) | JVM 옵션이라 빼면 없음 | 후보. JDK 25에서 원격 호스트·주소·포트 필드가 있음을 확인했다. NIO 경로 포함 여부는 확인하지 못했다 |
| O9 | run 소유 컨테이너 쪽 기록: run 소유 Redis의 접속 클라이언트 목록, run 소유 Postgres 접속 수, run 소유 LocalStack 요청 로그 | 사후 | 강하다. 앱이 run 소유 쪽에 실제로 붙었다는 양성 증거 | 공유 쪽에 "추가로" 붙은 것은 못 본다 | 낮음(컨테이너는 실행 소유) | 1단계 필수. 단, 단독으로는 충분조건이 아니다 |
| O10 | 공유 자원 쪽 기록(공유 Redis의 클라이언트 목록 등) | 사후 | 강하다 | — | — | **게이트에서 금지.** 확인하려면 공유 자원에 접속해야 한다. 사고 조사 때 사람이 판단한다 |

### 4-2. 무엇을 조합하나

- **기동 전**은 O2, **기동 직후**는 O3로 막는다. 둘 다 하니스 안에서 돌기 때문에 에이전트가 고칠 수 있지만,
  사고 1·2 같은 실수는 확실히 잡는다.
- **실행 중과 사후**는 O5(1단계)와 O7(2단계)로 본다. 프로세스 밖이라 하니스 코드가 틀려도 관측은 남는다.
- **양성 증거**는 O9로 받는다. "공유 쪽 접속 0"은 O5·O7이 말하고, "run 소유 쪽에 실제로 붙었다"는 O9가 말한다.
  둘이 함께 있어야 "run 소유 환경만 썼다"는 문장을 쓸 수 있다.
- O1은 대조 기준(무엇이 run 소유인가)으로만 쓴다. 그리고 그 기준 자체를 아래처럼 기계가 확인한다.

### 4-3. "run 소유"를 누가 증명하나

지금 `environment.json`의 "run 소유" 표시는 모델의 선언이다. 이것을 Docker가 아는 사실과 묶는다.

1. 실행 전에 `audit-orphans.js snapshot`이 이미 컨테이너 목록을 찍는다. 이 목록에 없던 컨테이너이면서 실행
   레이블을 가진 것만 run 소유 후보다.
2. `environment.json`의 각 엔드포인트는 `containerId`를 가져야 하고, 그 ID가 위 후보에 있어야 한다.
3. 호스트는 루프백이어야 하고, 포트는 그 컨테이너가 실제로 게시한 포트(`docker port <id>` 결과)와 같아야 한다.
   run 소유 컨테이너에 대한 읽기 전용 조회라 공유 자원 접속이 아니다.
4. 이 세 가지가 맞지 않는 엔드포인트는 run 소유가 아니다. 사람이 쓴 문장이 아니라 Docker 상태와 대조한다.

이렇게 하면 RUN-7.3의 "정확한 Redis 컨테이너 ID가 run 소유로 증명된 뒤에만 `flushDb` 허용"도 같은 근거로
확인할 수 있다.

---

## 5. 차단: 모델 밖에서 막는 방법

### 5-1. 차단 수단 비교 (macOS 개발자 머신 + Docker Desktop 기준)

| ID | 수단 | 무엇을 막나 | macOS에서 현실성 | 한계 |
|---|---|---|---|---|
| B1 | 환경변수 허용 목록(`env -i` 후 필요한 것만) | 셸 프로필·IDE에서 넘어온 접속 정보와 자격증명(`SPRING_*`, `AWS_*`, 프록시 변수 등) | 바로 된다 | `application.yml`에 적힌 기본값은 못 막는다. 사고 1·2의 직접 원인은 못 막음 |
| B2 | 기본값 함정 제거(테스트 프로필에서 주소 기본값을 비워 기동 실패시키기) | 알려진 키의 기본값 | 바로 된다 | 키를 알아야 한다. 사고 2(키를 틀림)에는 무력 |
| B3 | 앱도 컨테이너로 띄워 `--internal` 네트워크에 가둠 | 다른 네트워크로 나가는 모든 연결 | Docker 문서는 "internal 네트워크의 컨테이너는 서로 통신할 수 있지만 다른 네트워크와는 통신할 수 없다"고 쓴다. Docker Desktop for Mac에서 `host.docker.internal`까지 막히는지, internal 네트워크에서 포트 게시가 되는지는 문서로 확인하지 못했다 | 지금 구조는 호스트 JVM에서 Spring 컨텍스트를 띄운다. 앱 이미지를 만들고 테스트 클라이언트도 같은 네트워크로 옮겨야 해서 변경이 크다 |
| B4 | 프로세스 샌드박스(macOS Seatbelt, `sandbox-exec`)로 테스트 명령을 감쌈 | 실행 직전에 열려 있던 포트(공유 자원) + 루프백이 아닌 모든 주소(dev·stg) | 된다고 판단. 매뉴얼(`sandbox(7)`)에 "새 프로세스는 부모의 샌드박스를 물려받는다"고 적혀 있고, `(deny network-outbound (remote ip "localhost:16379"))`와 유닉스 소켓 허용 규칙은 이 머신의 `sandbox-exec`가 문법 오류 없이 받아들였다. 실제로 연결이 막히는지는 시험하지 않았다 | Gradle 데몬이 샌드박스 밖에서 이미 떠 있으면 테스트 JVM이 그 데몬에서 갈라져 나와 샌드박스를 벗어난다. IDE에서 돌린 테스트도 벗어난다. `sandbox-exec`는 매뉴얼에 사용 중단(DEPRECATED)으로 표시돼 있다 |
| B5 | 에이전트 런타임 샌드박스(Claude Code·Codex의 명령 샌드박스) | 에이전트가 실행하는 모든 명령과 그 자식 프로세스 | Claude Code는 macOS에서 Seatbelt로 샌드박스 프록시 외의 연결을 막고 허용 도메인(`host:port` 가능)만 프록시로 통과시킨다. Codex도 macOS에서 Seatbelt를 쓴다 | Claude Code 문서 기준으로 `allowLocalBinding`을 켜면 localhost의 **모든 포트**에 연결할 수 있어 포트 단위 거부가 없다. Testcontainers가 쓰는 Docker 소켓을 열면(`allowUnixSockets`) 문서 스스로 샌드박스 우회 통로가 될 수 있다고 경고한다(5-5) |
| B6 | 루트 권한 방화벽(pf) | 루프백의 특정 포트 | sudo 필요 | 사용자 단위로 나누지 않으면 개발자의 다른 프로그램까지 막는다. 지금은 권하지 않는다 |
| B7 | 공유 자원 쪽 자격증명(로컬 공유 Redis에 비밀번호 설정 등) | 자격증명 없이 들어오는 읽기·쓰기 | 오너 환경 설정으로 된다 | TCP 연결 자체는 일어난다. 기본값에 비밀번호가 적혀 있으면 소용없다. 보조 수단 |

### 5-2. 추천 조합

**1단계부터 B1, 2단계에 B4, 3단계에 B5.** B3는 NestJS·Playwright처럼 앱이 이미 컨테이너나 별도 프로세스로
뜨는 경로에서 먼저 검토한다. B7은 오너가 자기 로컬 환경에 따로 적용할 수 있는 값싼 보조책으로 적어 둔다.

### 5-3. B4 샌드박스 정책의 모양

감싸는 스크립트(가칭 `e2e-netguard`)가 실행 직전에 정책을 만든다. 핵심은 고정된 포트 목록이 아니라
**"실행 직전에 이미 듣고 있던 포트는 모두 남의 것"**이라는 규칙이다. Testcontainers가 고르는 매핑 포트는
비어 있는 포트 중에서 정해지므로 이 목록과 겹치지 않는다.

```text
허용  Docker 소켓(유닉스 소켓)            # Testcontainers가 컨테이너를 만들고 지우는 통로
허용  루프백의 그 밖의 포트               # run 소유 컨테이너의 매핑 포트, Ryuk
거부  루프백의 "실행 직전 LISTEN 포트"     # 예: 5432, 5433, 16379, 4566 + 그 시점의 모든 리스너
거부  루프백의 오너 지정 공유 포트 목록     # 실행 중에 늦게 뜨는 공유 서비스 대비
거부  루프백이 아닌 모든 주소              # dev·stg, 사내망, 인터넷
```

사고 때의 대상은 이렇게 막힌다.

| 대상 | 막는 규칙 | 비고 |
|---|---|---|
| `localhost:5432`, `localhost:5433` | 실행 직전 LISTEN 포트 | 로컬 공유 Postgres |
| `localhost:16379` | 실행 직전 LISTEN 포트 | 사고 1·2의 공유 Redis |
| `localhost:4566` | 실행 직전 LISTEN 포트 | 사고 1의 LocalStack |
| dev·stg 호스트 | 루프백이 아닌 모든 주소 | IP를 몰라도 막힌다. DNS 조회는 될 수 있지만 연결은 거부된다 |
| `host.docker.internal:<공유 포트>` | 호스트 JVM에서는 루프백이 아닌 주소 규칙에 걸린다 | 앱이 컨테이너 안에서 돌 때는 이 규칙이 적용되지 않는다(5-4) |

정책을 적용하려면 다음이 함께 필요하다.

- **의존성 내려받기를 분리한다.** 루프백이 아닌 주소를 막으면 Gradle·Maven이 의존성을 받지 못한다. 먼저 샌드박스
  밖에서 `testClasses`(또는 Maven의 `test-compile`)까지 돌려 캐시를 채우고, 샌드박스 안에서는 오프라인 모드로
  테스트만 돌린다. Docker 이미지 내려받기는 Docker 데몬이 하므로 JVM 정책과 상관없다.
- **Gradle 데몬을 샌드박스 안에서 새로 띄운다.** `--no-daemon` 또는 실행 전용 `GRADLE_USER_HOME`을 쓰고,
  감싸는 스크립트는 테스트 JVM의 조상 프로세스가 자기 자신인지 확인한다. 아니면 기동 전에 `BLOCKED`.
- **환경변수는 허용 목록만 넘긴다(B1).** `PATH`, `HOME`, `JAVA_HOME`, Docker 접속 정보
  (`infrastructure.dockerEnvironment`), 실행 ID 정도다. `HTTP(S)_PROXY`, `AWS_*`, `SPRING_*`는 넘기지 않는다.
- **감싸는 스크립트가 영수증을 쓴다.** 정책 원문과 해시, 실행 직전 LISTEN 포트 목록, 거부된 시도, 관측된 연결,
  관측 공백(폴링이 멈춘 구간), 도구 버전을 `isolation-receipt.json`으로 남긴다. 모델은 이 파일을 쓰지 않는다.

### 5-4. 앱이 컨테이너 안에서 돌 때

NestJS·Playwright 경로처럼 앱을 컨테이너로 띄우면 앱의 연결은 Docker Desktop의 가상 머신 안에서 일어난다.
호스트의 `lsof`는 그 연결을 테스트 프로세스의 것으로 보지 못하고, 호스트 샌드박스도 적용되지 않는다. 이때는
B3(`--internal` 네트워크)가 차단 수단이고, 관측은 컨테이너 안의 연결 목록이나 run 소유 쪽 기록(O9)으로 한다.
이 경로의 세부는 2단계에서 따로 시험한다.

### 5-5. "모델이 어떻게 행동하든"의 정직한 범위

| 위협 | 1단계 | 2단계(B4) | 3단계(B5) |
|---|---|---|---|
| 실수: 기본 설정 그대로 기동(사고 1) | 기동 전 차단 | 기동 전 차단 + 연결 차단 | 같음 |
| 실수: 설정 키 오류(사고 2) | 기동 전·직후 차단 | 같음 + 연결 차단 | 같음 |
| 실수: 감싸는 스크립트 없이 실행 | 영수증이 없어 PASS 불가(INCONCLUSIVE) | 같음 | 런타임이 모든 명령에 샌드박스 적용 |
| 우회: 하니스의 관측 코드를 지움 | 소켓 관측은 남음 | 연결 차단은 남음 | 같음 |
| 우회: 영수증을 손으로 만듦 | 막지 못함 | 막지 못함(같은 사용자 권한) | 런타임 샌드박스가 연결 자체를 막음 |
| 우회: Docker 소켓으로 공유 포트에 닿는 컨테이너를 직접 띄움 | 막지 못함 | 막지 못함 | 막지 못함. Testcontainers에 Docker 소켓이 필요한 한 남는다 |

같은 사용자 계정으로 셸을 쥔 에이전트를 상대로는 2단계까지도 "실수 방지"다. 고의적 우회까지 막는 것은 에이전트가
바꿀 수 없는 층뿐인데, 여기에도 구멍이 하나 남는다. **Testcontainers를 쓰려면 Docker 소켓이 열려 있어야 하고,
Docker 소켓을 쥔 쪽은 호스트에 닿는 컨테이너를 마음대로 띄울 수 있다.** 그래서 런타임 샌드박스만으로는 완전하지
않다. 끝까지 막으려면 두 길 중 하나가 필요하다.

- **공유 자원이 없는 곳에서 돌린다.** 에이전트의 E2E 실행을 공유 자원이 없는 별도 VM, 원격 개발 컨테이너,
  CI 러너로 옮긴다.
- **공유 자원이 에이전트가 모르는 자격증명을 요구하게 한다(B7).** 연결은 일어나도 읽기·쓰기는 거절된다. 자격증명은
  저장소나 `application.yml`이 아니라 오너의 키체인·개인 환경에만 둬야 한다.

사고 3건은 모두 실수 유형이라 1~2단계로 막히지만, 판정 결과의 "확인한 것"에는 어느 층까지 적용됐는지를 함께 적는다.

---

## 6. 게이트: 어디서 무엇을 판정하나

### 6-1. 흐름

```text
[G0 준비 · 감싸는 스크립트]  LISTEN 포트 스냅샷 → 정책 생성 → 환경변수 허용 목록 → 샌드박스 안에서 테스트 명령 시작
                             → 소켓 관측 시작 → 영수증 기록 시작
[G1 기동 전 · 하니스]        Testcontainers 기동 → environment.json 작성(containerId 포함)
                             → 키 무관 설정 스캔(O2) → 위반이면 컨텍스트 기동 거부
[G2 기동 직후 · 하니스]      클라이언트 객체 관측(O3) → 위반이면 첫 시나리오 전에 중단
[G3 실행 중 · 모델 밖]       샌드박스 차단(B4), 소켓 관측(O5), 거부 기록(O7)
[G4 사후 · 스크립트]         check-isolation: environment.json 소유 대조(4-3) + 영수증 + run 소유 쪽 양성 접촉(O9)
                             → 판정 입력 `isolation`에 기록 → evaluate-run-verdict가 최종 판정
```

### 6-2. 판정 규칙

| 상황 | 판정 | 이유 코드(가칭) | 다음 행동 |
|---|---|---|---|
| 정책상 필요한 샌드박스·관측 도구를 쓸 수 없음 | `BLOCKED` | `ISOLATION_GUARD_UNAVAILABLE` | 환경을 고친 뒤 재실행 |
| `environment.json` 엔드포인트가 4-3의 소유 대조를 통과하지 못함 | `BLOCKED` | `ENDPOINT_NOT_RUN_OWNED` | 하니스 수정 |
| G1 스캔에서 run 소유가 아닌 주소 발견(허용 예외 없음) | `BLOCKED` | `PRESTART_ENDPOINT_NOT_OWNED` | 설정 수정. 아무것도 건드리지 않았음 |
| G2 클라이언트 관측에서 run 소유가 아닌 주소 | `BLOCKED` | `CLIENT_ENDPOINT_NOT_OWNED` | 같음. 첫 시나리오 전이라 데이터 접촉 없음 |
| 실행 중 샌드박스가 연결 시도를 거부함 | `BLOCKED` | `ISOLATION_ATTEMPT_DENIED` | 설정 결함. 결과는 믿을 수 없음. 공유 자원 피해는 없음 |
| 공유 대상과 실제 연결이 성립함(읽기 포함) | **`ISOLATION_BREACH`** | `SHARED_ENDPOINT_CONTACT` | 즉시 중단, 사고 보고 필수, 공유 쪽 정리는 사람이 결정 |
| 영수증 없음, 관측 공백, 정책 해시 불일치 | `INCONCLUSIVE` | `ISOLATION_EVIDENCE_MISSING` | 재실행. "공유 접속 0"이라고 쓸 수 없음 |
| 선언한 run 소유 엔드포인트에 아무도 붙지 않음 | `INCONCLUSIVE` | `OWNED_ENDPOINT_UNUSED` | 앱이 다른 곳에 붙었을 수 있음. 시나리오가 그 기능을 쓰지 않았다면 이유를 기록하고 통과 |
| 위 항목이 모두 깨끗함 | 기존 판정 그대로 | — | — |

우선순위는 `ISOLATION_BREACH > BLOCKED > INCONCLUSIVE > PARTIAL > PASS`. `ISOLATION_BREACH`는
`--diagnostic-only`로도 낮출 수 없고(RUN-18.2), 렌더러와 워크플로 요약의 맨 위에 나온다.

**왜 실제 연결만 새 판정인가.** `BLOCKED`는 "돌릴 수 없었다, 고치고 다시 돌려라"라는 뜻이다. 차단된 시도까지는
여기에 맞는다. 공유 자원에 실제로 닿은 경우는 다르다. 재실행보다 먼저 무엇이 어디에 쓰였는지 사람이 봐야 한다.
같은 `BLOCKED`로 두면 사고 2처럼 아무도 모른 채 지나간다. 오너가 이 방식(새 판정)으로 결정했다.

**1단계(관찰만)에서의 적용 범위.** 1단계에는 연결 차단이 없으므로 위 표의 행 중 일부만 판정을 바꾼다. 실제 접촉
(`SHARED_ENDPOINT_CONTACT`)은 1단계부터 `ISOLATION_BREACH`다. 일어난 일을 기록하는 것이지 막는 것이 아니기 때문이다.
나머지(`ENDPOINT_NOT_RUN_OWNED`, `PRESTART_ENDPOINT_NOT_OWNED`, `CLIENT_ENDPOINT_NOT_OWNED`,
`ISOLATION_EVIDENCE_MISSING`, `OWNED_ENDPOINT_UNUSED`)는 1단계에서 경고로만 남기고, 2단계에서 표대로 판정에 반영한다.
예외 하나를 14-1에 제안했다(실행 직전에 실제로 듣고 있는 공유 포트를 가리키는 설정은 1단계에서도 기동 거부).

### 6-3. 사고 보고 강제

`ISOLATION_BREACH`가 나오면 워크플로 출력에 다음이 없으면 완료로 치지 않는다.

- 시각 구간, 프로세스, 원격 주소와 포트, 연결 수(영수증에서 복사)
- 그 구간에 실행된 시나리오와 각 시나리오의 `Mutates` 선언(무엇을 썼을 수 있는가)
- 공유 쪽 정리가 필요한지에 대한 **사람의 결정 요청**. 게이트와 에이전트는 공유 자원에 접속해 확인하거나 지우지 않는다
- 원인 분류(기본 설정, 키 오류, 코드에 박힌 주소, 늦게 뜬 공유 서비스 등)와 재발 방지 항목

### 6-4. 허용 예외

키 무관 스캔은 쓰지 않는 설정까지 잡는다. 예외는 저장소의 검토된 파일(예: `docs/e2e-scenarios/isolation-exceptions.json`,
`known-deviations.json`과 같은 방식)에만 두고, 항목마다 키, 값의 모양, 이유, 소유자, 만료일을 적는다. 실행 중에
에이전트가 예외를 추가하지 않는다. 예외 파일 변경은 사람의 승인 대상이다.

---

## 7. 바꿀 파일 (구현 단계)

이번에는 바꾸지 않는다. 구현할 때 손댈 곳을 파일 단위로 적는다.

### 7-1. 스크립트

| 파일 | 변경 |
|---|---|
| `skills/e2e-runner/scripts/validate-run-result.js` | `environment` v2 구조 검사: `endpoints[]`마다 `kind`, `host`(루프백), `port`, `containerId`, `propertyKeys`, `positiveContactProbe` 필수. `isolation` 판정 입력 필수 |
| `skills/e2e-runner/scripts/evaluate-run-verdict.js` | `isolation` 입력을 읽어 6-2 표의 이유 코드와 `ISOLATION_BREACH`(새 종료 코드, 예: 5)를 계산. 우선순위 변경 |
| `skills/e2e-runner/scripts/assemble-run-result.js` | 하니스 관측의 `environment`를 그대로 복사하지 않고 v2 구조로 옮기며 영수증 경로를 연결 |
| 새 `skills/e2e-runner/scripts/check-isolation.js` | 4-3의 소유 대조(`audit-orphans` 스냅샷, `docker port`), 영수증 검사, O9 양성 접촉 확인. 결과를 판정 입력으로 씀 |
| 새 `skills/e2e-runner/scripts/netguard-run.sh`(또는 `.js`) | G0: LISTEN 스냅샷, 정책 생성, 환경변수 허용 목록, 샌드박스 실행, 소켓 관측, 영수증 작성 |
| 새 `skills/e2e-runner/scripts/snapshot-listeners.js` | `lsof -nP -iTCP -sTCP:LISTEN` 결과를 정규화(감싸는 스크립트와 검사 스크립트가 공유) |
| `skills/e2e-runner/scripts/audit-orphans.js` | 스냅샷 결과를 `check-isolation.js`가 읽을 수 있게 컨테이너 ID 목록을 그대로 남김(지금도 남기는지 구현 때 확인) |
| `skills/e2e-evidence-report/scripts/render-evidence-report.js` | DB 검증 쿼리의 대상이 `environment.json`의 run 소유 엔드포인트와 같은지 확인. 자유 문자열 `environment` 대신 구조 참조. `ISOLATION_BREACH` 배너 |
| `skills/test-quality-review/scripts/validate-review-report.js` | `disposable_endpoint: true`만으로 통과시키지 않고, 실행 증거가 있을 때는 영수증 참조를 요구 |

### 7-2. 참고 예제와 계약 문서

| 파일 | 변경 |
|---|---|
| 새 `skills/e2e-runner/reference/examples/EndpointGuardInitializer.java` | G1·G2 예제: 테스트 범위 초기화 훅에서 키 무관 스캔, 컨텍스트 기동 직후 클라이언트 객체 관측. `CatalogPlanRunner.java`와 같은 위치·형식 |
| `skills/e2e-runner/reference/kb/operating-contract.md` | RUN-7.1을 관측 가능한 하위 규칙으로 나눔(예: RUN-7.1a 소유 대조, 7.1b 기동 전 스캔, 7.1c 클라이언트 관측, 7.1d 샌드박스·영수증). RUN-18.1 판정표에 `ISOLATION_BREACH` 추가 |
| `skills/e2e-runner/reference/kb/test-environment-and-data.md` | `environment.json` v2 예시, "localhost는 소유가 아니다" 명시 |
| `skills/e2e-scenario-author/reference/e2e-scenario-contract.md` §5 | `environment` 내부 구조와 `isolation` 필드. `contractVersion` 2로 올림(RUN-20에 따라 세 스킬 동시 변경) |
| `skills/e2e-runner/SKILL.md` | 체크포인트 목록에 G0~G4 추가 |
| `skills/e2e-test-workflow/SKILL.md` | 3절(환경 소유자)에 감싸는 스크립트 사용, 6절 정규화 표와 우선순위에 `ISOLATION_BREACH`, 출력 계약에 사고 보고 |
| `skills/playwright-e2e/SKILL.md` | PW-0·PW-5를 영수증과 소유 대조로 확인. 앱이 컨테이너면 5-4 경로 |
| `skills/e2e-evidence-report/SKILL.md`, `reference/kb/db-state-verification.md`, `reference/evidence-schema.md` | DB 대상 확인 규칙을 스크립트 검사로 연결 |
| `agents/e2e-test-runner.md`, `agents/backend-test-author.md` | "localhost test endpoint"를 "run 소유로 확인된 매핑 엔드포인트"로 고침 |

### 7-3. 시험과 평가

| 파일 | 변경 |
|---|---|
| `skills/e2e-runner/tests/harness-pipeline.test.js` | 엔드포인트 없는 `environment`가 통과하는 지금의 기대를 뒤집음. v2 정상·위반 사례 추가 |
| `skills/e2e-runner/tests/verdict-contract.test.js` | `ISOLATION_BREACH`, 새 이유 코드, 우선순위, `--diagnostic-only` 불가 |
| 새 `skills/e2e-runner/tests/isolation-gate.test.js` | 11절의 미끼 리스너 시험을 단위 수준으로 |
| `evals/behavioral/cases/e2e-runner/`, `e2e-test-workflow/` | 새 케이스: 키를 틀린 하니스, 기본값으로 공유 포트를 가리키는 앱(미끼 포트 사용) |

### 7-4. 기존 규칙과의 관계

- **RUN-1.1, RUN-7.0, RUN-7.1**: 규칙은 그대로이고, 증명 방법을 문장에서 관측으로 바꾼다.
- **RUN-7.3**: `flushDb` 같은 넓은 정리를 허용하는 조건("정확한 컨테이너 ID가 run 소유로 증명")을 4-3으로 확인한다.
- **RUN-8**: 컨테이너 시작 증거에 더해 "공유 쪽 접촉 없음"과 "run 소유 쪽 접촉 있음"이 PASS 조건에 들어간다.
- **RUN-16.5, RUN-16.6**: 인프라·부트스트랩 증거에 영수증 경로가 추가된다.
- **RUN-18.1, RUN-18.2**: 판정표와 우회 범위가 바뀐다.
- **PW-0, PW-5**: 같은 영수증 계약을 따른다.
- **TST-2, TST-12**(`test-authoring`): 좁은 통합 테스트도 Redis·DB에 붙는다. 4단계에서 같은 감싸는 스크립트를
  `test-runner`와 pre-commit 훅에 선택적으로 붙인다. 지금 TST 규칙의 문장은 바꿀 필요가 없고, 확인 수단이 생긴다.
- **test-quality-review의 `environment_ownership`**: 자기 신고 불리언 대신 영수증 참조를 요구한다.

---

## 8. 사고 대응 시뮬레이션

### 8-1. 세 사고에 이 설계가 어떻게 반응했을까

| 사고 | 지금 게이트 | G1 키 무관 스캔 | G2 클라이언트 관측 | G3 샌드박스(2단계) | G4 사후 | 최종 판정 | 못 막는 경우 |
|---|---|---|---|---|---|---|---|
| 1. 기본 설정으로 공유 Redis·S3에 씀 | 통과(PASS 가능) | `application.yml`의 `localhost:16379`, `localhost:4566`이 run 소유 목록에 없음 → 기동 거부 | (G1에서 멈춤) | G1을 건너뛰었어도 16379·4566은 실행 직전 LISTEN 포트라 연결 거부 | 거부 기록이 영수증에 남음 | `BLOCKED` (`PRESTART_ENDPOINT_NOT_OWNED` 또는 `ISOLATION_ATTEMPT_DENIED`). 공유 쪽 쓰기 0 | 공유 서비스가 실행 직전에 꺼져 있다가 도중에 뜬 경우 LISTEN 스냅샷에 없음 → 오너 지정 공유 포트 목록이 없으면 연결 성립 → 사후 관측이 잡아 `ISOLATION_BREACH`(피해는 남음) |
| 2. 설정 키 오류로 공유 Redis에 PING·GET | 통과. 보고서는 "공유 접속 0" | 앱이 읽는 표준 키 값이 여전히 공유 주소 → 기동 거부. 하니스가 넣은 다른 접두사 키의 값은 run 소유 주소라 통과하지만 상관없음 | `RedisConnectionFactory`의 호스트·포트가 `localhost:16379` → 첫 시나리오 전 중단 | 연결 거부 | "공유 접속 0"이라는 문장은 영수증으로만 쓸 수 있음 | `BLOCKED`. 보고서가 틀린 문장을 쓸 수 없음 | Redis 클라이언트를 요청 시점에 직접 만드는 코드라면 G2가 못 봄. 1단계(관찰만)에서는 짧은 PING이 폴링 사이에 끝나면 O5도 못 봄 → 2단계의 거부 기록(O7)이 있어야 확실 |
| 3. 동시성 문제를 읽기만 하고 추정으로 끝냄 | 해당 없음 | 해당 없음 | 해당 없음 | 해당 없음 | 해당 없음 | 이 설계로는 못 막는다 | 재현 실행은 심사단·red team 설계가 다룬다. 이 게이트는 그 재현 실행을 공유 자원 걱정 없이 허용하기 위한 전제다 |

### 8-2. 이 설계가 못 막는 경우

| 경우 | 왜 못 막나 | 남는 대책 |
|---|---|---|
| 에이전트가 감싸는 스크립트 없이 테스트를 돌림 | 1~2단계 차단은 스크립트 안에서만 작동 | 영수증이 없으므로 PASS는 안 나온다. 공유 쪽 접촉 자체는 3단계(런타임 샌드박스)만 막는다 |
| 에이전트가 영수증을 손으로 만듦 | 같은 사용자 권한 | 3단계. 영수증에 정책 해시와 도구 버전을 넣어 실수로 만든 가짜는 걸리게 하지만 고의는 못 막는다 |
| IDE에서 돌린 테스트, 이미 떠 있던 Gradle 데몬 | 샌드박스 밖 프로세스 | 감싸는 스크립트가 데몬 조상 확인. IDE 실행은 범위 밖이라고 문서에 적음 |
| 앱이 컨테이너 안에서 돌며 `host.docker.internal`로 나감 | 호스트 샌드박스·`lsof` 범위 밖 | B3(`--internal`) 또는 컨테이너 안 관측(5-4) |
| 실행 도중에 뜬 공유 서비스 | LISTEN 스냅샷에 없음 | 오너 지정 공유 포트 목록, 사후 관측 |
| 공유 자원이 루프백이 아닌 사내 주소에 있고 같은 주소에 run 소유 자원도 있는 경우 | 없음(루프백 아닌 주소는 전부 거부) | 원격 Docker는 RUN-7.1이 이미 막고 있음 |
| UDP, DNS 조회 | 정책이 TCP 연결 중심 | DNS 조회 자체는 데이터 쓰기가 아니라 허용. 연결 단계에서 막힘 |

---

## 9. 오너가 정할 질문

1. ~~공유 자원에 실제로 닿은 경우를 새 판정으로 둘까요?~~ **결정: (A) 새 판정 `ISOLATION_BREACH`, 새 종료 코드 5.**
2. ~~차단을 어디까지 갈까요?~~ **결정: (A) 1단계 관찰만 → 2단계 macOS 샌드박스 차단 → 3단계 런타임 샌드박스.**
   - 남은 확인 하나였던 14-1의 "실행 직전 LISTEN 중인 공유 포트를 가리키는 설정은 1단계에서도 기동 거부"는
     **오너가 1단계에 넣기로 확정했다(2026-11-23).** 연결 차단이 아니라 기동 전 거부이고 거짓 양성이 거의 없다.
3. **1단계 "관찰만" 기간을 얼마나 둘까요?** 추천: 오너 환경의 실제 E2E 실행 20회 또는 2주 중 먼저 오는 쪽. 그동안
   거짓 양성(쓰지 않는 설정, 텔레메트리 내보내기 주소 등)을 예외 파일로 정리한다.
4. **오너 지정 공유 포트 목록을 둘까요?** 실행 직전 LISTEN 스냅샷만으로는 늦게 뜨는 서비스를 놓친다.
   추천: 사용자 설정(`vulpora.config.json` 등)에 목록을 두고 스냅샷과 합친다. 기본값은 빈 목록.
5. **로컬 공유 자원에 비밀번호를 걸까요(B7)?** 오너 환경의 일이라 vulpora가 강제하지 않는다. 추천: 공유 Redis에는
   걸어 두면 사고 2 같은 읽기 접속이 데이터까지 닿지 않는다.
6. **좁은 통합 테스트와 pre-commit 훅까지 넓힐까요?** 추천: 4단계에서 선택 사항으로. 훅은 개발자의 일상 흐름에 닿으므로
   켜고 끄는 설정을 둔다.
7. **런타임 샌드박스(3단계)를 vulpora 설치 과정에서 권할까요?** 설정 변경은 사용자가 해야 한다. 추천: 설치 안내에
   권장 설정을 적되 자동으로 바꾸지 않는다.
8. **고의적 우회까지 막는 마지막 층을 무엇으로 할까요?** Docker 소켓 때문에 런타임 샌드박스만으로는 끝까지 막히지 않는다(5-5).
   - (A) 로컬 공유 자원에 에이전트가 모르는 자격증명을 건다 — **추천(단기).** 오너 환경 설정만으로 되고 비용이 거의 없다.
   - (B) 에이전트의 E2E 실행을 공유 자원이 없는 VM·원격 개발 컨테이너·CI로 옮긴다 — 가장 확실하지만 실행 환경이 바뀐다.
   - (C) 실수 방지(1~2단계)까지만 하고 우회는 범위 밖으로 둔다 — 사고 유형에는 충분하지만 보장 문구를 낮춰야 한다.

---

## 10. 단계와 규모

| 단계 | 내용 | 판정 효과 | 규모(대략) |
|---|---|---|---|
| 1. 관찰과 기계 대조 | `environment` v2, 소유 대조(4-3), G1·G2 예제, 환경변수 허용 목록, `lsof` 관찰, `check-isolation.js`, 새 판정 `ISOLATION_BREACH`. 실제 접촉만 판정을 바꾸고 나머지 위반은 경고(6-2 끝) | PASS 문장의 근거가 관측으로 바뀜. 공유 접촉이 묻히지 않음 | PR 하나(14-1의 E1). 스크립트 3~4개 신규·수정(약 600~900줄)+시험, Java 예제 1개(약 200줄), 문서 6~8개. 1~2주 |
| 2. macOS 차단 | `netguard-run`의 샌드박스, 영수증 필수, 6-2 판정표 전부 적용, `ISOLATION_BREACH` | 사고 1·2 유형을 실행 단계에서 막음 | 감싸는 스크립트와 정책 생성기, 판정 변경, 계약 v2. 1~2주 |
| 3. 우회 방지 | 런타임 샌드박스 권장 설정, 공유 자원 자격증명 분리 안내(질문 8), Linux CI 대응(네트워크 네임스페이스 또는 `--internal` 네트워크) | 고의적 우회 대부분. Docker 소켓 경로는 자격증명 분리나 실행 장소 이전으로만 닫힘 | 설정 문서와 CI 템플릿. 런타임 기능 확인에 따라 다름 |
| 4. 범위 확장 | `test-runner`, `test-authoring`, `backend-test-author`, pre-commit 훅에 선택 적용 | 좁은 통합 테스트도 같은 보장 | 훅 템플릿 수정, 문서 |

### 위험

- **거짓 양성.** 키 무관 스캔은 쓰지 않는 설정(텔레메트리 내보내기 `localhost:4317`, 개발 도구 포트, 설정 서버 주소 등)도
  잡는다. 1단계 관찰 기간에 예외 파일로 정리하고, 예외는 만료일을 둔다.
- **개발 흐름 방해.** 샌드박스는 테스트 프로세스에만 적용되므로 개발자의 다른 프로그램은 영향이 없다(B6보다 나은 점).
  대신 첫 실행 전에 의존성 캐시를 채우는 단계가 하나 늘고, Gradle 데몬 재사용을 포기해 실행이 느려진다.
- **도구 수명.** `sandbox-exec`는 매뉴얼에 사용 중단으로 표시돼 있다. 공개 도구들이 비슷한 프로필 문법을 아직 쓰고
  있다는 점(부록 A)과 별개로, 동작이 바뀌면 2단계는 `ISOLATION_GUARD_UNAVAILABLE`로 막히고 1단계 관찰로 물러나게 만든다(조용히 통과시키지 않음).
- **관측 비용.** `lsof` 폴링은 간격이 짧을수록 비싸다. 1초 간격에서 시작해 11절 시험(T5)으로 놓침률을 재고 정한다.

---

## 11. 시험 방법 (구현 단계 시험 계획)

**원칙: 오너의 실제 공유 자원(로컬 DB·Redis·S3, dev·stg)을 시험에 쓰지 않는다.** 대신 시험이 직접 띄우는
**미끼 리스너**(접속을 기록만 하는 작은 TCP 서버)를 "공유 자원" 역할로 쓴다. 미끼는 실행 직전에 떠 있으므로
LISTEN 스냅샷에 잡히고, 접속이 오면 시각과 상대 포트를 기록한다. dev·stg 역할은 문서용 예약 주소(RFC 5737,
`192.0.2.0/24`)로 흉내 낸다.

| # | 시험 | 준비 | 기대 결과 |
|---|---|---|---|
| T1 | 기본 설정 그대로(사고 1) | 앱 설정의 Redis·S3 주소가 미끼 포트를 가리킴 | G1이 기동 거부, `BLOCKED`, 미끼 접속 0 |
| T2 | 키 오류(사고 2) | 하니스는 다른 접두사 키에 run 소유 주소를 넣고, 앱이 읽는 표준 키는 미끼 포트 | G1 또는 G2가 막음, `BLOCKED`, 미끼 접속 0 |
| T3 | G1·G2 우회 | 주소를 코드 상수로 박고 G1·G2를 끔 | 샌드박스가 거부, `ISOLATION_ATTEMPT_DENIED`, 미끼 접속 0 |
| T4 | 샌드박스 없음 + 관찰만 | T3과 같고 샌드박스를 끔 | 소켓 관측이 연결을 잡아 `ISOLATION_BREACH`, 미끼 접속 기록과 영수증이 일치 |
| T5 | 짧은 연결 | 연결→PING→종료를 50ms 안에 끝내는 클라이언트를 100회 | 폴링 간격별 놓침률 측정. 샌드박스 거부 기록은 100% 잡아야 함 |
| T6 | 늦게 뜬 공유 서비스 | 실행 시작 후 미끼를 띄움 | 오너 지정 목록 없음: 연결 성립 후 `ISOLATION_BREACH`. 목록 있음: 거부 |
| T7 | dev·stg 흉내 | 앱이 `192.0.2.10:443`으로 연결 | 루프백 아닌 주소 규칙으로 거부 |
| T8 | 감싸지 않은 실행 | 감싸는 스크립트 없이 테스트 명령 실행 | 영수증 없음 → `INCONCLUSIVE`, "공유 접속 0" 문구 금지 |
| T9 | 데몬 함정 | 샌드박스 밖에서 Gradle 데몬을 먼저 띄운 뒤 감싸는 스크립트 실행 | 조상 확인 실패로 기동 전 `BLOCKED` |
| T10 | 정상 대조군 | 모든 주소가 run 소유 | PASS, 거짓 양성 0 |
| T11 | 소유 위조 | `environment.json`에 공유 포트를 run 소유로 적음 | 4-3 대조에서 `ENDPOINT_NOT_RUN_OWNED` |
| T12 | 컨테이너 앱 경로 | 앱 컨테이너가 `host.docker.internal:<미끼 포트>`로 연결 | 5-4 경로의 차단 또는 관측이 잡는지 확인. 못 잡으면 그 사실을 문서화 |

T1~T4, T8, T10, T11은 판정 스크립트 단위 시험으로도 만든다(가짜 영수증·관측 입력). T5와 T12는 실제 실행이
필요하므로 오너 승인 아래 별도 머신이나 오너 로컬에서, 미끼만 쓰고 공유 자원이 꺼진 상태에서 돌린다.

---

## 12. 사람이 필요한 지점

- 허용 예외 파일의 추가·연장 승인(무엇이 쓰지 않는 설정인지는 사람이 판단).
- `ISOLATION_BREACH` 뒤 공유 쪽 정리 여부와 방법 결정. 에이전트는 공유 자원에 접속해 확인하거나 지우지 않는다.
- 오너 지정 공유 포트 목록과 런타임 샌드박스 설정(사용자 설정이라 에이전트가 바꾸지 않는다).
- 2단계 전환 시점 결정(관찰 기간의 거짓 양성 보고를 보고).

---

## 13. 확인하지 못한 것

- **사고 원본 기록.** 사고 때 쓰인 하니스가 vulpora의 `e2e-runner` 경로(카탈로그 하니스)였는지, 대상 저장소의 별도
  하니스였는지 확인하지 못했다. 전자라면 7절의 파일이 그대로 고칠 곳이고, 후자라면 대상 저장소 쪽에도 같은 감싸는
  스크립트와 초기화 훅이 필요하다.
- **macOS 도구의 실제 동작.** 공식 문서·매뉴얼과 문법 검사까지만 했고, 연결을 실제로 막거나 관측하는 실행은 하나도
  하지 않았다(이번 작업은 앱·서버를 띄우지 않는다). 확인 범위는 부록 A에 적었다. 특히 Seatbelt 규칙이 `127.0.0.1`과
  `::1`을 모두 막는지, 거부 로그를 어떤 권한으로 읽는지는 시험이 필요하다.
- **거짓 양성의 실제 양.** 키 무관 스캔이 실제 Spring 앱에서 몇 개를 잡을지는 1단계 관찰 전에는 모른다.
- **에이전트가 런타임 설정 파일을 고칠 수 있는지.** Claude Code 문서는 샌드박스를 느슨하게 하는 설정을 관리 설정,
  `--settings`, 사용자 파일에서만 받는 모드를 설명하지만, 기본 권한에서 에이전트가 그 파일을 편집할 수 있는지는
  경로별로 확인하지 못했다.
- **Linux CI.** 3단계의 네트워크 네임스페이스·`--internal` 방식은 설계 방향만 적었다.
- **이 머신의 JDK.** 기본 `java`는 21이고 25도 설치돼 있다. JFR 관측(O8)을 쓴다면 테스트가 실제로 어느 JDK에서
  도는지부터 확인해야 한다.

---

## 14. 구현 계획 (PR 단위)

| PR | 단계 | 내용 | 앞선 PR | 오너 답이 필요한 질문 |
|---|---|---|---|---|
| **E1** | 1. 관찰만 | 격리 증거 기록, 소유 대조, 소켓 관찰, `ISOLATION_BREACH` 판정, Java 초기화 예제(관찰 모드) | 없음 | 2의 남은 확인(14-1 예외), 3(관찰 기간), 4(공유 포트 목록) |
| E2 | 2. macOS 차단 | `netguard-run`(Seatbelt), 영수증 필수, 6-2 판정표 전체 적용, `contractVersion` 2(세 스킬 동시) | E1 + 관찰 기간 종료 | 3 |
| E3 | 3. 실행 샌드박스 | 런타임 샌드박스 권장 설정 문서, Linux CI 대응, 공유 자원 자격증명 안내 | E2 | 7, 8 |
| E4 | 4. 범위 확장 | `test-runner`, `test-authoring`, `backend-test-author`, pre-commit 훅 선택 적용 | E2 | 6 |

E2~E4는 E1이 끝난 뒤 같은 형식으로 구체화한다. 아래는 E1만 파일 단위로 적는다.

### 14-1. PR E1: 격리 관찰과 `ISOLATION_BREACH` (1단계)

- 가칭 제목: `feat(e2e): record isolation evidence and add the ISOLATION_BREACH verdict (observe mode)`
- 원칙: **기존 결과와 하위 호환.** `isolation`과 `environment` v2는 선택 필드로 들어오고, `contractVersion`은 1을 유지한다
  (RUN-20에 따라 버전 올림은 세 스킬 동시 변경이므로 E2로 미룬다). SKILL.md의 frontmatter `description`은 바꾸지 않는다
  (14-3의 탐색 토큰 예산).

#### 판정과 우선순위

```text
ISOLATION_BREACH (exit 5) > BLOCKED (3) > INCONCLUSIVE (4) > PARTIAL (2) > PASS (0)
```

- `ISOLATION_BREACH`는 `isolation.sharedContacts`가 하나 이상일 때 나온다. 다른 이유 코드가 함께 있어도 맨 위다.
- `--diagnostic-only`는 이 판정을 낮추지 못한다(RUN-18.2의 우회 조건을 그대로 두면 자동으로 그렇게 되지만, 시험으로 고정한다).
- stderr는 기존 형식 그대로 `ERROR: verdict=ISOLATION_BREACH`.
- 출력 JSON에 `isolation_verified`(불리언)와 `isolation_warnings[]`를 더한다. `humanSummary`에 다섯째 줄
  `isolation: verified | not verified (<이유>) | BREACH (<포트 목록>)`을 더한다. **`isolation_verified`가 `true`가 아니면
  보고서에 "공유 자원 접속 0"이라고 쓸 수 없다**는 규칙을 SKILL.md와 운영 계약에 넣는다(사고 2의 문장 문제).
- 1단계에서 나머지 위반은 `isolation_warnings`로만 나온다(6-2 끝). 단 아래 "기동 전 예외"는 하니스가 기동을 거부하므로
  결과적으로 `BLOCKED`가 된다.

**기동 전 예외(오너 확인 필요, 추천: 넣는다).** 키 무관 스캔(O2)과 클라이언트 관측(O3)이 찾은 주소가 **실행 직전에 실제로
듣고 있던 포트이면서 run 소유가 아니면** 1단계에서도 기동을 거부한다. 이 경우는 "쓰지 않는 설정" 같은 거짓 양성이 거의 없고
(지금 살아 있는 공유 서비스를 정확히 가리킴), 사고 1·2가 정확히 이 모양이다. 듣고 있지 않은 포트를 가리키는 설정은 경고만 한다.

#### 바꾸는 파일

| 파일 | 변경 |
|---|---|
| `skills/e2e-runner/scripts/evaluate-run-verdict.js` | 선택 입력 `isolation`의 모양 검사(잘못되면 64), `sharedContacts` → `ISOLATION_BREACH`(exit 5), 우선순위 갱신, `isolation_verified`·`isolation_warnings`·`humanSummary` 다섯째 줄 |
| `skills/e2e-runner/scripts/validate-run-result.js` | `environment.schemaVersion === 2`이면 `endpoints[]` 검사(`kind`, 루프백 `host`, 정수 `port`, `containerId`, `propertyKeys[]`). v1이나 없음은 오류가 아니라 `warnings[]`(새 출력 필드). `isolation`이 있으면 `receipt` 파일 존재와 `receiptSha256` 일치 확인 |
| `skills/e2e-runner/scripts/assemble-run-result.js` | `--isolation <isolation.json>` 인자 추가(지금의 `--orphan-audit`과 같은 방식). 하니스 `environment`는 그대로 두되 v2면 정규화. Markdown 요약에 "격리: 확인됨 / 확인 안 됨 / 위반" 한 줄 |
| 새 `skills/e2e-runner/scripts/snapshot-listeners.js` | `lsof -nP -iTCP -sTCP:LISTEN` 결과를 `{port, address, command, pid}` 목록으로 정규화. 듣는 프로세스 이름으로 "공유 자원 후보"(Docker 백엔드, DB·캐시 프로세스)와 "로컬 도구"(Gradle 데몬, IDE, JVM 디버거)를 나눔. 파싱 함수는 시험용으로 내보냄 |
| 새 `skills/e2e-runner/scripts/observe-connections.js` | 테스트 명령을 자식으로 띄우고(`-- <command...>`), 환경변수 허용 목록만 넘기며(B1), 1초 간격으로 프로세스 트리의 TCP 연결(`lsof -nP -a -iTCP -p <pids>`)과 run 레이블 컨테이너의 게시 포트(`docker ps --filter label=...`, run 소유 컨테이너만)를 기록. 종료 시 `isolation-receipt.json`(모드 `observe`, LISTEN 스냅샷, 표본 수, 최대 공백, 도구 버전) 작성. 프로세스 트리에 테스트 JVM이 없으면(Gradle 데몬 재사용) 관측 공백으로 기록 |
| 새 `skills/e2e-runner/scripts/check-isolation.js` | 영수증·관측 기록·`environment.json`·`audit-orphans` 스냅샷을 대조해 `isolation.json` 작성: `sharedContacts`(실행 전 LISTEN 중이던 공유 자원 후보 포트로의 연결, 루프백이 아닌 주소로의 연결), `ownedContacts`, `ownershipViolations`(4-3), `observerGaps`, `localToolContacts`(경고만) |
| 새 `skills/e2e-runner/reference/examples/EndpointGuardInitializer.java` | G1·G2 예제. 관찰 모드에서는 발견 사항을 `prestart-findings.json`에 쓰고, 위 "기동 전 예외"만 기동 거부. 허용 예외 파일 읽기 |
| `skills/e2e-runner/reference/kb/operating-contract.md` | RUN-7.1a(소유 대조), 7.1b(기동 전 스캔), 7.1c(클라이언트 관측), 7.1d(소켓 관찰과 영수증) 추가. RUN-17에 격리 줄, RUN-18.1 판정표에 `ISOLATION_BREACH` 행, RUN-18.2에 "격리 위반은 우회 불가". 기존 규칙 ID와 정지 조건은 바꾸지 않음(문서의 리뷰 훅 조건) |
| `skills/e2e-runner/reference/kb/test-environment-and-data.md` | `environment.json` v2 예시, "`localhost`는 소유가 아니다", 리뷰 훅 한 줄 추가 |
| `skills/e2e-runner/SKILL.md` | 체크포인트 목록에 `observe-connections.js`·`check-isolation.js` 두 줄. `description`은 그대로 |
| `skills/e2e-test-workflow/SKILL.md` | 빠른 경로 3~4단계에 관찰 래퍼와 `--isolation` 추가, 6절 우선순위와 정규화에 `ISOLATION_BREACH`, 출력 계약에 사고 보고(6-3) |
| `skills/e2e-scenario-author/reference/e2e-scenario-contract.md` §5 | `environment` v2와 `isolation`을 **선택 필드**로 기술(버전 1 유지) |
| `agents/e2e-test-runner.md` | 판정 목록에 `ISOLATION_BREACH`와 "공유 자원 접속 0"을 쓰는 조건 한 줄 |
| `skills/e2e-runner/tests/harness-pipeline.test.js` | 기존 시험(엔드포인트 없는 `environment`)은 **통과하되 경고가 나오는지**로 바꿈. 새 시험: v2 정상, v2에 루프백이 아닌 호스트 → 오류, `--isolation` 포함 조립, 위반 포함 조립 → 평가기가 `ISOLATION_BREACH` |
| `skills/e2e-runner/tests/verdict-contract.test.js` | 우선순위(위반 + `BLOCKED` 이유가 같이 있어도 `ISOLATION_BREACH`), exit 5, stderr 형식, `--diagnostic-only` 불가, 잘못된 `isolation` → 64, `isolation` 없음 → 판정은 그대로이고 `isolation_verified: false` |
| 새 `skills/e2e-runner/tests/isolation-gate.test.js` | 아래 "일부러 틀린 설정 시험"의 단위·실연결 시험 |
| `evals/behavioral/cases/e2e-runner/isolation-breach-reported.yaml` | 관측 결과에 위반이 있을 때 에이전트가 "공유 접속 0"이라고 쓰지 않고 사고 보고를 내는지(`must_not_claim`) |

E1에서 **바꾸지 않는 것**: `playwright-e2e`, `e2e-evidence-report`, `test-quality-review`, `backend-test-author`(E2·E4로 미룸),
CI 워크플로, `install/manifest.txt`(새 스킬이 없고 스크립트는 기존 `e2e-runner` 안에 있음).

#### 일부러 틀린 설정으로 게이트를 시험하는 방법

오너의 공유 자원은 쓰지 않는다. "공유 자원" 역할은 시험이 직접 띄우는 **미끼 리스너**(Node `net.createServer`를
`127.0.0.1:0`에 띄워 접속을 기록만 함)가 맡는다.

| 층 | 시험 | 어디서 | 기대 |
|---|---|---|---|
| 단위 | 합성 `lsof` 출력·LISTEN 스냅샷·컨테이너 목록을 넣어 `check-isolation.js` 실행: (a) 미끼 포트로의 연결, (b) 정상 run 소유 포트만, (c) 루프백이 아닌 `192.0.2.10`, (d) Gradle 데몬 포트(로컬 도구), (e) 테스트 JVM 없음, (f) `environment`에 공유 포트를 run 소유로 적음 | CI(모든 OS) | (a)(c) `sharedContacts`, (b) 깨끗함, (d) 경고만, (e) `observerGaps`, (f) `ownershipViolations` |
| 실연결 | 미끼 리스너를 띄운 뒤 `observe-connections.js -- node client.js`로 미끼에 연결→짧게 쓰기→닫기. 연결 유지 시간을 2초, 200ms, 20ms로 바꿔 반복 | CI(macOS, Linux). Docker 불필요, 시험이 만든 소켓만 씀 | 2초는 반드시 잡힘. 200ms·20ms는 놓침률을 기록만(1초 폴링의 한계를 수치로 남김. 2단계 차단의 근거) |
| 판정 | 위 결과로 조립한 실행 결과를 `validate-run-result.js`·`evaluate-run-verdict.js`에 넣음 | CI | 위반 → `ISOLATION_BREACH`, exit 5 |
| JVM·Spring(사고 재연) | `evals/behavioral/fixtures/repos/sample-spring`의 시험 사본에서 (1) Redis 호스트·포트를 미끼 포트로 둔 기본 설정, (2) 하니스는 다른 접두사 키에 run 소유 주소를 넣고 앱이 읽는 표준 키는 미끼를 가리키는 설정(사고 2), (3) 정상 설정 | 오너 머신, 오너 승인 아래. 공유 서비스를 끄고 미끼만 띄움. CI에서는 `NOT_RUN`으로 기록 | (1)(2) 기동 전 예외로 거부(`BLOCKED`) 또는 관찰이 미끼 접촉을 잡아 `ISOLATION_BREACH`. (3) PASS, 경고 0 |

실연결 시험이 `lsof`를 찾지 못하면 조용히 건너뛰지 않고 이유를 적은 명시적 실패로 둔다. 표준 GitHub 우분투 러너에
`lsof`가 있는지는 확인하지 못했으므로, 없으면 이 PR에서 CI의 apt 설치 줄에 추가한다(CI 수정이 필요해지는 유일한 경우).

#### 저장소 기존 검사를 통과시키는 방법

| 검사 | 영향 | 통과 방법 |
|---|---|---|
| `npm test`(`install/test-npm-package.sh`), 스킬별 `tests/` | 새 시험 추가 | 위 시험 전부 실행. 기존 정지 조건·규칙 ID 문자열을 지우지 않음 |
| `npm run check:release`(`install/check-npm-package.sh`), `install/test-release-inventory.sh` | 새 스크립트·예제가 패키지에 들어감, 문서 링크 | 새 파일이 `skills/` 아래라 `package.json`의 `files`에 이미 포함. 문서의 로컬 링크는 패키지 안 경로만 사용 |
| `install/test-public-release-neutrality.sh` | 예제·시험의 문자열 | 서비스 이름·사내 호스트·개인 경로 금지. 예제는 `Order`/`Member` 같은 일반 이름, 주소는 `127.0.0.1`과 RFC 5737 예약 주소만 |
| `install/test-claude-skill-port.sh`, skill-updater 규칙 | SKILL.md 수정 | frontmatter는 `name`·`description`만, `description` 불변, 본문 500줄 미만, 새 링크는 스킬 안 경로. KB 수정 시 frontmatter(`title`, `source`, `last_fetched`, `skills`)와 `## 리뷰 훅` 유지, INDEX에서 찾을 수 있게 |
| 토큰 예산(`install/test-token-load-coverage.sh`, `evals/token-efficiency/measure-skills.py --check`) | SKILL.md 본문 증가 | 늘어나는 내용은 운영 계약(reference)으로 보내고 SKILL.md에는 체크포인트 두 줄만. 측정이 기준선을 넘으면 기준선 갱신이 아니라 본문을 줄임 |
| `install/test-qa-runner-contract.sh`, `skills/e2e-test-workflow/tests/contract.test.sh` | 에이전트·워크플로 문구를 grep | 기존 문구를 지우지 않고 추가만. 시험이 판정 목록을 고정하고 있으면 그 시험에 `ISOLATION_BREACH`를 더함 |
| `evals/behavioral/run-behavioral-evals.sh --validate` | 새 행동 평가 케이스 | 필수 필드와 matcher 규칙(STANDARD §5) 준수 |

#### 롤백과 위험

- **롤백**: PR 병합 커밋 하나를 되돌리면 끝난다. 새 필드가 모두 선택 필드이고 `contractVersion`이 그대로라, 되돌린 뒤에도
  그 사이에 만든 실행 결과는 기존 검증기를 통과한다(모르는 필드는 무시). 관찰 래퍼를 쓰던 하니스 호출은 래퍼 없이 원래 명령으로
  돌아가면 된다.
- **위험 1: 새 종료 코드 5.** 이 값을 모르는 호출자는 "알 수 없는 실패"로 처리한다. 실패 쪽으로 닫히므로 안전하지만,
  종료 코드를 표로 매핑하는 CI 스크립트가 있다면 그쪽 수정이 필요하다.
- **위험 2: 로컬 도구 연결의 거짓 위반.** 테스트 프로세스 트리가 실행 전부터 떠 있던 Gradle 데몬, IDE, 디버거 포트에 붙는 일은
  정상이다. `snapshot-listeners.js`가 듣는 프로세스로 분류해 경고로만 남기지만, 분류 목록이 틀리면 거짓 `ISOLATION_BREACH`가
  나온다. 관찰 기간에 분류 목록을 다듬는다.
- **위험 3: 놓침.** 1초 폴링은 짧은 연결을 놓친다(실연결 시험으로 수치화). 1단계의 "공유 접촉 없음"은 "관찰 범위 안에서
  없음"이고, 보고서 문구도 그렇게 쓴다.
- **위험 4: Gradle 데몬.** 데몬을 재사용하면 테스트 JVM이 관찰 트리 밖에 있어 관측 공백이 된다. 1단계에서는 경고지만, 이 경고가
  잦으면 "확인 안 됨" 결과가 쌓인다. 래퍼 사용 안내에 `--no-daemon`을 적는다.
- **위험 5: 기동 전 예외의 오작동.** Java 예제가 대상 저장소의 설정 구조를 잘못 읽으면 정상 실행을 거부할 수 있다. 허용 예외
  파일과 끄는 스위치(관찰 전용 모드)를 함께 둔다.

### 14-2. E1 이후의 순서

- 관찰 기간(9절 질문 3, 추천: 실제 실행 20회 또는 2주) 동안 경고·위반·관측 공백을 모은다. 이 기록이 E2의 예외 파일과 분류 목록이 된다.
- E2는 `contractVersion` 2로 올리는 세 스킬 동시 변경이다(RUN-20). `playwright-e2e`, `e2e-evidence-report`, `test-quality-review`의
  영수증 연결도 여기서 한다.

### 14-5. E1 구현에서 설계와 달라진 곳 (2026-11-23)

구현하면서 설계 문장과 다르게 정한 것을 모았다. 이유를 함께 적는다.

| 설계 | 구현 | 이유 |
|---|---|---|
| 14-1: 기동 전 거부를 Java 초기화 예제가 한다 | 규칙은 Node 스크립트 `check-prestart.js` 하나에 있고, Java 예제 `EndpointGuardInitializer`는 값을 모아 이 스크립트를 부른다. 거부는 종료 코드 3과 `BLOCKED`(`PRESTART_ENDPOINT_NOT_OWNED`, 클라이언트 단계는 `CLIENT_ENDPOINT_NOT_OWNED`) | 같은 규칙을 Java와 Node에 두 번 쓰면 어긋난다. Node 쪽은 스프링 없이 시험된다. 스프링 연결 코드는 JDK만으로 컴파일되는 예제라 주석 속 조각으로 두었다 |
| 6-2: 공유 자원 후보만 위반 | LISTEN 목록에 있던 포트 중 **로컬 도구(Gradle 데몬, IDE 등)로 분류되지 않은 것은 모두 공유 접촉**이다. 분류는 `shared-resource`, `local-tool`, `unknown` 셋이고 `unknown`도 위반이다 | 이름으로 알아보지 못하는 프로세스를 통과시키면 구멍이 된다. E2의 "실행 직전 LISTEN 포트는 모두 남의 것" 규칙과도 맞는다. 분류가 틀리면 거짓 위반이 나는 위험(위험 2)은 그대로 있고 관찰 기간에 다듬는다 |
| T6: 늦게 뜬 공유 서비스는 목록이 없어도 연결 후 `ISOLATION_BREACH` | 오너 지정 포트(`observe-connections.js --shared-port`)가 있으면 위반, 없으면 어디에도 속하지 않는 접촉(`UNATTRIBUTED_CONTACT`)으로 기록하고 `isolation_verified`를 false로 둔다 | 실행 중에 뜬 포트의 주인은 소켓만으로 알 수 없다. 테스트가 쓰는 Ryuk 같은 보조 컨테이너를 위반으로 오인할 수 있어서 Ryuk 이미지는 따로 알아본다. 오너 지정 목록의 저장 위치(질문 4)가 아직 없어 `vulpora.config.json`은 건드리지 않고 명령줄 인자로만 받는다 |
| 14-1: `validate-run-result.js`가 소유 대조까지 | 형태 위반(루프백이 아닌 호스트, 정수가 아닌 포트, `containerId` 없음, 영수증 해시 불일치)은 **오류(exit 1)**, Docker 상태와의 소유 대조 실패는 **경고**(`warnings[]`)와 판정 쪽 `isolation_verified: false` | 6-2의 1단계 적용 범위("나머지 위반은 경고")를 따랐다. E2에서 오류로 올린다 |
| 6-4: 허용 예외 파일 | 위치는 인자(`--exceptions`)이고 권장 경로는 `docs/e2e-scenarios/isolation-exceptions.json`. 항목은 `id`, `match`(호스트·포트 중 하나 이상), `reason`, `owner`, `expires` 필수, 만료·누락은 무시하고 거부를 유지한다. 적용된 예외는 결과에 기록되고 `isolation_verified`를 false로 만든다 | 오너 결정 3의 "허용 목록을 사람이 명시하고 기록"을 구현한 모양이다 |
| 위험 5: 끄는 스위치 | `--mode warn`(Java는 `-Dvulpora.isolation.prestart=warn`)이 있다. 기본값이 아니고, 쓰면 `PRESTART_REFUSAL_SUPPRESSED`가 기록되고 `isolation_verified`가 false가 된다 | 스위치가 조용한 우회가 되지 않게 흔적을 남긴다 |
| 14-1: 래퍼는 도구가 없어도 관찰 공백으로 진행 | `lsof`를 쓸 수 없으면 **명령을 실행하지 않는다**(exit 71, `ISOLATION_GUARD_UNAVAILABLE`). `--allow-unobserved`를 줄 때만 공백으로 기록하고 실행한다 | 기동 전 거부도 LISTEN 목록에 기대므로 목록이 없으면 안전하게 닫는다 |
| 6-2 / 위험 | 루프백이 아닌 주소 접촉은 위반이다. 의존성 내려받기도 이에 걸린다 | 설계 그대로다. 실행 전에 의존성을 받아 두거나 오프라인 모드로 돌려야 한다. 사람이 허용한 주소는 `check-isolation.js --allow-remote`로 기록하며 허용도 `isolation_verified`를 false로 둔다 |
| 14-1: 평가기 출력 | `isolation_verified`, `isolation_warnings`, 다섯째 줄 외에 위반 때 `secondaryReasons`(아래 우선순위에 가려진 사유)를 낸다 | 사고 보고에 가려진 사유가 필요하다 |
| 11절: JVM·Spring 사고 재연(`sample-spring` 시험 사본) | 하지 않았다(`NOT_RUN`). 대신 JDK만으로 컴파일한 Java 가드를 미끼 포트로 시험했다 | 이번 작업은 앱·서버를 띄우지 않는다 |
| 14-1: `audit-orphans.js` 수정 | 수정하지 않았다 | 스냅샷이 이미 전체 컨테이너 ID(`--no-trunc`)를 남긴다 |

**구현 검토(sonnet 리뷰어 1명)에서 나온 것 중 고친 것과 남긴 것.**

- 고친 것: URL 비밀번호 속 `@`가 호스트를 가리던 문제, `127.1`·`localhost.`·십진 정수·`::ffff:7f00:1` 같은 변형 표기, `server.address`+`server.port`
  (앱 자신의 바인드)를 거부하던 오탐, 디버그 에이전트가 붙은 데이터 서비스가 로컬 도구로 분류되던 문제(`jdwp`는 약한 단서로 낮춤)와
  `code-server`가 편집기로 분류되던 문제, 실행 전부터 있던 레이블 컨테이너를 run 소유로 보던 문제, 값에 `=`가 든 레이블, 빈 스캔·시계 재정의·클라이언트 스캔
  누락을 `isolation_verified`에 반영, 격리 기록이 영수증과 어긋나는데 `verified`라고 하는 경우를 검증기가 오류로 처리, 영수증 경로가 기록 폴더 밖을 가리키는 경우와
  `sharedContacts` 없는 기록을 조립 단계에서 거부.
- 남긴 것(알려진 한계): 같은 사용자 권한으로 영수증과 기록을 함께 위조하는 경우(설계 8-2, 3단계 이후), `lsof`가 현재 사용자의 프로세스만 보여 다른 사용자(root)의
  리스너는 목록에 없는 점(스냅샷의 `scope`에 적음), 유닉스 소켓·UDP 경로, 호스트 키만 있고 포트가 어디에도 없는 설정(라이브러리 기본 포트는 소켓 관찰이 맡음),
  `/etc/hosts`나 DNS 이름으로 로컬을 가리키는 값(원격 호스트 경고로만 나옴), Linux에서 run 소유 컨테이너의 브리지 IP로 직접 붙는 경로(거짓 위반 가능),
  호스트 쪽 `tcp://` Docker 데몬(RUN-7.1이 이미 막음), `environment.json`에 공유 포트를 run 소유로 적으면 기동 전 스캔은 통과하지만 소켓 관찰이 그 접촉을 공유 접촉으로
  잡고 소유 대조가 `ENDPOINT_NOT_RUN_OWNED` 경고를 남긴다(E2에서 기동 전 단계에도 Docker 대조를 넣는다).

**`ISOLATION_BREACH`와 기존 판정 우선순위의 호환.** 기존 시험이 고정한 `BLOCKED > INCONCLUSIVE > PARTIAL > PASS`와 그 종료 코드
(3, 4, 2, 0)와 stderr 형식, `--diagnostic-only`의 좁은 조건은 그대로이고 그 위에 `ISOLATION_BREACH`(5)만 얹었다. `isolation` 입력이
없는 결과는 판정이 바뀌지 않는다. 이를 모르는 호출자는 5를 0이 아닌 알 수 없는 실패로 본다.

---

## 부록 A. 문서·매뉴얼로 확인한 사실

모두 2026-11-23에 읽었다. "문법만 확인"은 이 머신의 `sandbox-exec`에 프로필을 넣고 `/usr/bin/true`를 실행해 오류가
없는 것까지만 봤다는 뜻이다. 아무 연결도 하지 않았다.

| 항목 | 확인한 내용 | 출처 | 확신 |
|---|---|---|---|
| `--internal` 네트워크 | "Containers on an internal network may communicate between each other, but not with any other network" | docs.docker.com, `docker network create` 참조 | 인터넷 차단은 중간. Docker Desktop의 호스트 접근 차단·포트 게시는 미확인 |
| Docker Desktop 포트 게시 | 게시된 포트는 Docker Desktop 백엔드 프로세스가 호스트에서 듣는다. `-p` 기본 바인딩은 `0.0.0.0` | docs.docker.com, Docker Desktop networking | 높음. 호스트 `lsof`에는 JVM이 아니라 백엔드 프로세스가 듣는 쪽으로 보인다 |
| `sandbox-exec` 상태 | 매뉴얼에 DEPRECATED 표시. `sandbox(7)`: "New processes inherit the sandbox of their parent." | macOS 매뉴얼 | 높음 |
| Seatbelt 포트 거부 문법 | `(deny network-outbound (remote ip "localhost:16379"))`, `(allow network-outbound (remote unix-socket))` 문법 통과 | 이 머신에서 문법만 확인. Trail of Bits·zerobox의 공개 프로필도 비슷한 문법 사용 | 문법은 중간, 실제 차단은 미확인 |
| Claude Code 샌드박스 | macOS에서 Seatbelt가 샌드박스 프록시 외 연결을 막음. 허용 도메인에 `host:port` 가능. `allowLocalBinding`은 localhost 전 포트 연결 허용. `allowUnixSockets`는 우회 통로가 될 수 있다는 경고 | code.claude.com 문서(sandboxing) | 높음 |
| Claude Code PreToolUse 훅 | Bash 명령 문자열을 받아 종료 코드 2 또는 거부 결정으로 막을 수 있다. 자식 프로세스가 하는 일은 보지 못한다 | code.claude.com 문서(hooks) | 높음 |
| Codex 샌드박스 | macOS에서 Seatbelt 사용 | OpenAI Codex 문서 | Seatbelt는 높음. workspace-write의 네트워크 기본 차단은 검색 요약으로만 봐서 중간 |
| macOS `tcpdump -k` | PKTAP 메타데이터로 프로세스 이름(N)·PID(P) 출력. "This is an Apple modification." | `man tcpdump` | 높음. 권한은 `/dev/bpf*`가 `root:wheel`이라 루트 필요로 판단 |
| JFR 소켓 이벤트 | JDK 25.0.2의 `jdk.SocketRead`/`jdk.SocketWrite`에 원격 호스트·주소·포트 필드. 기본 임계값 1ms. `jdk.SocketConnect`는 없음 | 이 머신의 `jfr metadata`, JDK `default.jfc` | JDK 25 기준 높음. NIO·네이티브 전송 계층은 미확인 |
| Actuator 값 가림 | `/env`, `/configprops` 값은 기본으로 모두 `******`. HTTP 기본 노출은 `health`뿐 | docs.spring.io, Actuator endpoints | 높음 |
| Redis `CLIENT LIST` | 접속 클라이언트의 주소, 마지막 명령, 클라이언트 라이브러리 이름·버전 등 | redis.io 명령 문서 | 높음. Docker Desktop 안에서는 주소가 VM 쪽으로 보일 것이라는 점은 추정 |
| LocalStack 요청 로그 | INFO 수준에서 `AWS <service>.<operation> => <status>` 형식으로 요청마다 기록 | docs.localstack.cloud, logging | 중간. 요청한 프로세스는 알 수 없음 |
