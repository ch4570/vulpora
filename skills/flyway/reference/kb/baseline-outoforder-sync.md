---
title: Baseline / Out-of-order / 로컬 DB 동기화
source: https://documentation.red-gate.com/fd
last_fetched: 2026-06-24
skills: [flyway]
---

# KB: Baseline / Out-of-order / 동기화

> 근거: Flyway 문서(Baseline, Out of order migrations, Info/Validate, Migrate).

## Baseline (기존 DB 편입)
- 이미 객체가 있는 DB에 Flyway를 처음 도입할 때 `baseline`으로 **기준선 버전**을 긋는다.
- baseline 버전 **이하**의 마이그레이션은 적용하지 않는다(이미 있다고 간주).
- 신규/빈 DB에는 baseline이 불필요(처음부터 마이그레이션으로 구축).

## Out-of-order
- 기본은 버전 **오름차순**으로만 적용. 더 낮은 버전이 뒤늦게 추가되면 기본 설정에선 건너뛴다.
- `outOfOrder=true`면 뒤늦은 낮은 버전도 적용 — 단 환경마다 적용 **순서가 달라질 수 있어**
  재현성 리스크. 협업 충돌 해소용으로만 신중히.

## 상태 확인 / 동기화
- `info`: 각 마이그레이션의 상태(Pending/Success/...)와 버전 표.
- `validate`: 적용된 마이그레이션의 **체크섬·순서 일치** 확인(불변성 위반 탐지).
- 흐름: 로컬에서 작성 → `info`/`validate` → 적용 → CI/운영에 같은 파일로 전파.
- 환경별 차이는 별도 폴더(`ci/dev/local/`)의 **오버라이드 전용**으로만; 공통 변경은 공통 폴더.

## 빌드시스템 자동감지(검증 명령)
| 마커 | info | validate |
|------|------|----------|
| `gradlew`/`build.gradle(.kts)` | `./gradlew flywayInfo` | `./gradlew flywayValidate` |
| `pom.xml` | `mvn flyway:info` | `mvn flyway:validate` |
| `package.json`(lock으로 PM 판별) | `<pm> run flyway:info`/`npx flyway info` | `<pm> run flyway:validate`/`npx flyway validate` |
| standalone CLI | `flyway info` | `flyway validate` |

## 리뷰 훅
- [ ] 기존 DB 편입이면 baseline을 긋고 그 이하 버전을 적용 대상에서 뺐는가.
- [ ] `outOfOrder`를 켰다면 재현성 리스크를 인지하고 충돌 해소 목적에 한정했는가.
- [ ] 적용 전 `info`/`validate`로 상태·체크섬 일치를 확인했는가.
- [ ] 공통 변경을 공통 폴더에, 환경 차이만 오버라이드 폴더에 두었는가.
- [ ] 검증 명령을 빌드시스템 자동감지로(특정 도구 고정 없이) 실행했는가.
