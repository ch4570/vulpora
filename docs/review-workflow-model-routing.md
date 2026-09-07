# Review workflow model routing

통합 review workflow는 primary 세션의 모델을 specialist에게 상속하지 않는다. 각 pass가 portable
`frugal`·`standard`·`frontier` profile과 `reasoning_effort`를 선언하고, current Codex 또는 Claude Code
runtime이 dispatch 직전에 selectable model catalog에서 정확한 모델을 해소한다.

## 공통 dispatch 계약

모든 model-backed pass는 다음 값을 명시한다.

- `model_selection: explicit-native-override`
- `fork_turns: none`
- exact `model`과 exact `reasoning_effort`
- route resolution source와 requested/observed model
- `inheritance_used: false`

Runtime이 명시적 override를 지원하지 않거나 요구 profile에 맞는 모델이 없으면 pass는
`ROUTE_UNAVAILABLE`이다. 비싼 primary model 상속이나 provider 간 model ID 복사는 fallback이 아니다.
Deterministic lint·compile·test·schema 검사는 모델을 쓰지 않는다.

## Rule volume is not a frontier signal

리뷰 룰과 스킬 수가 많다는 사실만으로 `frontier`를 선택하지 않는다. 비용과 품질을 같이
악화시키는 주요 원인은 대체로 모델 등급이 아니라 한 pass에 무관한 규칙, 전체 저장소,
다른 reviewer의 raw transcript까지 함께 넣는 context overload다. 기본 실행 형태는 다음과 같다.

1. diff, changed symbol, build metadata를 deterministic tool로 추출한다.
2. reviewer별 `applicability manifest`를 만들어 활성 rule family와 제외 근거를 기록한다.
3. 모든 pass에 공통으로 필요한 작은 evidence capsule과 해당 lane의 rule/evidence만 전달한다.
4. 기계적·국소적 pass는 `frugal/low`, semantic correctness와 종합은 `standard/medium`에서
   시작한다.
5. 독립 verifier가 근거를 기각하거나 확인된 위험이 floor를 넘을 때만 해당 lane 하나를
   한 단계 올린다.

현재 runtime catalog에 해당 모델이 selectable로 노출된 경우의 **비구속적 예시**는 다음과
같다. 이 표는 provider model ID를 frozen plan에 하드코딩하라는 뜻이 아니며, 실제 선택은
dispatch 직전 capability catalog와 behavioral eval 결과로 해소한다.

| portable profile | 적합한 역할 | 현재 모델 family 예시 |
|---|---|---|
| `frugal/low` | style, idiom, pattern-fit, narrow rule check | Luna / Haiku |
| `standard/medium` | framework correctness, evidence gate, reconciliation | Terra / Sonnet |
| `frontier/high` | confirmed auth/authority, irreversible data, public-contract conflict | Sol / Opus |

따라서 일반 코드 리뷰의 소유자와 종합기는 `standard/medium`이 기본이다. `frontier`는 리뷰
스킬이 많아서가 아니라 실제 risk floor 또는 검증된 capability miss 때문에만 사용한다.

## Proving a cheaper route

모델 family의 적합성은 인상이 아니라 같은 frozen fixture에 대한 비교로 승격시킨다. 최소한
다음을 profile별로 측정한다.

- CRITICAL/HIGH miss rate와 unsupported-finding rate
- `path:line`, root cause, command evidence 충족률
- dissent 보존과 duplicate precision
- route/inheritance 계약 준수율
- token, latency, retry, escalation rate

`frugal` 결과가 품질 floor를 넘지 못하면 그 lane만 `standard`로 고정한다. `standard`의 위험
케이스 miss가 확인될 때만 해당 risk class에 `frontier` floor를 둔다. 단순 timeout이나 장문
prompt 소화 실패는 상위 모델 근거가 아니라 scope/context slicing 실패다.

## Workflow defaults

| workflow | 저비용 pass | standard pass | frontier floor |
|---|---|---|---|
| architecture review | bounded structure/catalog lookup | ordinary boundary review | public contract, irreversible boundary decision |
| backend code review | style/idiom and narrow checks | correctness, API, test review | security, authorization, destructive data path |
| Java + Spring review | OOP + pattern fit: `frugal/low` | Java/Spring correctness: `standard/medium` | confirmed transaction/security/public-API escalation |
| Kotlin + Spring review | style, refactoring catalog | framework correctness, OOP, pattern fit | security/transaction/public contract |
| OpenSearch review | mappings/query-shape lookup | correctness and operations | irreversible index/migration or security boundary |
| PostgreSQL review | schema/style lookup | query, migration, concurrency review | destructive migration, privilege, data-loss risk |

Tier escalation은 evidence verifier가 해당 pass의 증거를 기각하거나 실제 risk가 profile을 초과할 때 한 번만
허용한다. 인증, quota, timeout, tool 부재, scope 위반은 더 비싼 모델을 살 이유가 아니다.

## Java + Spring three-lane workflow

[`java-spring-review-workflow`](../skills/java-spring-review-workflow/SKILL.md)는 같은 frozen revision을 대상으로
정확히 세 child를 동시에 실행한다.

| lane | dependency | route | 책임 |
|---|---|---|---|
| 1 | `agent:java-reviewer` | `standard/medium` | Java/JVM + Spring transaction, proxy, JPA, MVC, test evidence |
| 2 | `oop-design-review` | `frugal/low` | 책임, 캡슐화, 결합도, dependency direction |
| 3 | `design-pattern-apply` | `frugal/low` | pattern fit, simpler alternative, over-design cost |

세 lane 중 하나라도 실패·timeout·stale·route mismatch면 workflow는 `INCOMPLETE`다. Primary는 child finding의
실제 location과 command evidence를 다시 확인하고, 같은 location/symbol과 같은 root cause일 때만 중복을
합친다. 의견 충돌은 consensus로 꾸미지 않고 dissent로 보존한다.
