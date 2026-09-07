---
title: 트리아지 신호 (Pass 1) — 핫스팟 스캔
source: 본 스킬 워크플로 Pass 1(grep 휴리스틱)
last_fetched: 2026-06-24
skills: [kotlin-spring-review]
---

# 트리아지 신호 (Pass 1) — 핫스팟 식별용 저비용 스캔

> 2-pass 워크플로의 **Pass 1**에서 사용. 변경 파일에서 고위험 신호를 grep으로 빠르게 추출해
> **풀 리뷰가 필요한 핫스팟만** 골라낸다. 이 단계에선 레퍼런스를 깊게 읽지 않는다.

## 사용법
```bash
# 1) 스코프: 변경 파일 목록 (diff-우선)
cd <repo> && git diff --name-only            # 워킹트리
# git diff --name-only <base>...HEAD          # PR

# 2) 변경된 .kt 파일에만 신호 grep (예시: 워킹트리)
FILES=$(git diff --name-only -- '*.kt')
```
신호가 1개라도 잡힌 파일 = **핫스팟** → Pass 2에서 풀 리뷰 + 해당 레퍼런스 로딩.
신호 0 + 사소한 diff(문서/포맷) → 조기 APPROVE.

## 위험 신호 grep 패턴 (심각도 가중 / 라우팅)

| 신호 (grep) | 의미 | 가중 | Pass2 레퍼런스 |
|---|---|---|---|
| `!!` | 무방비 non-null 단언 | 🟠 | kotlin-idioms |
| `\bvar\b` in `@Service`/`@Component`/`@Repository` 파일 | 싱글톤 빈 가변 상태(레이스) | 🔴 | kotlin-idioms, spring |
| `@Transactional` | 트랜잭션 경계/자기호출/readOnly | 🟠 | spring |
| `GlobalScope` | 비구조적 동시성 | 🔴 | kotlin-idioms |
| `runBlocking` | 요청 경로 블로킹 | 🟠 | kotlin-idioms |
| `Dispatchers.Default` 근처 `jdbc`/`http`/`Thread.sleep` | 잘못된 디스패처 블로킹 | 🟠 | kotlin-idioms |
| `createQuery(`/`"SELECT ` + `+` 문자열 연결 | SQL 인젝션 | 🔴 | spring |
| `@Value` 하드코딩 비밀스러운 문자열 / `password`/`secret`/`token` 리터럴 | 시크릿 노출 | 🔴 | spring |
| `@Autowired` (필드/세터) | 필드 주입 | 🟠 | spring |
| `@Component`/`@Service` **신규 추가** (diff `+` 라인) | 빈 와이어링/스캔 누출 | 🟠 | architecture, spring |
| `: <Entity>` 반환 / `ResponseEntity<...Entity>` / 컨트롤러가 `@Entity` 반환 | 엔티티 직접 노출 | 🟠 | architecture, spring |
| `import jakarta.persistence`/`org.springframework`/`com.fasterxml` in `domain/` | 도메인 프레임워크 의존 | 🔴 | architecture |
| `Double`/`Float` + `price`/`amount`/`money`/`cost` | 금전 부동소수 | 🔴 | clean-code, functional-jvm |
| `java.util.Date`/`Calendar`/`SimpleDateFormat` | 구식 날짜 API | 🟠 | functional-jvm |
| `Optional<` in `.kt` | Kotlin에서 Optional | 🟠 | functional-jvm |
| `HashMap`/`mutableMapOf` as 필드 (공유 캐시) | 비스레드세이프 공유 | 🟠 | functional-jvm, clean-code |
| `catch (e: Exception)` / 빈 `catch {` | 광범위/삼킴 예외 | 🟠 | clean-code |
| `when (` without `else` 인근 `sealed` / `is ` 반복 | 다형성 후보 | 🟡 | kotlin-idioms |
| `fun .* :.*\{[\s\S]{1500,}` (초대형 함수/파일) | SRP/크기 | 🟡 | clean-code |

> 패턴은 휴리스틱이다 — 매칭 = "핫스팟 후보"일 뿐, 확정 결함이 아니다. Pass 2에서 맥락으로 판정.

## 예시 (워킹트리 변경 .kt에 핵심 신호만)
```bash
git diff --name-only -- '*.kt' | while read f; do
  [ -f "$f" ] || continue
  hits=$(grep -nE '!!|GlobalScope|runBlocking|@Transactional|@Autowired|Optional<|catch \(e: Exception\)' "$f")
  newbeans=$(git diff -- "$f" | grep -nE '^\+.*@(Component|Service|Repository)')
  [ -n "$hits$newbeans" ] && { echo "== HOTSPOT: $f =="; echo "$hits"; echo "$newbeans"; }
done
```

## 조기 종료 기준 (Pass 2 생략)
- 변경이 문서/주석/포맷/테스트 리소스 한정 **그리고** 위 신호 0건 → 간단 APPROVE.
- 단, `build.gradle(.kts)`·`settings.gradle.kts`·`@Configuration`·`AutoConfiguration.imports`·
  `application*.yml` 변경은 **신호가 없어도** 와이어링/설정 영향이 크므로 Pass 2(architecture/spring)로.

## 리뷰 훅
- [ ] 스코프를 diff-우선으로 확정했는가 (변경 파일 + 직접 영향 호출부).
- [ ] 변경된 `.kt`에 위 grep 신호를 스캔해 핫스팟 목록을 만들었는가.
- [ ] 핫스팟 0 + 사소한 diff(문서/포맷)면 조기 APPROVE로 종료했는가.
- [ ] 빌드 스크립트(`build.gradle(.kts)`/`pom.xml`/`build.gradle`)·`@Configuration`·`AutoConfiguration.imports`·`application*.yml` 변경은 신호가 없어도 Pass 2로 보냈는가.
