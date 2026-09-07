---
title: 물리적 빌드 모듈과 논리적 경계 구분
source: https://docs.gradle.org/current/userguide/multi_project_builds.html
last_fetched: 2026-08-11
consumers: [application-architect]
owner: application-architect
source_type: official
sources:
  - uri: https://docs.gradle.org/current/userguide/multi_project_builds.html
    version: current
    locator: Multi-Project Builds / Project dependencies
  - uri: https://maven.apache.org/guides/mini/guide-multiple-modules.html
    version: current
    locator: The Reactor / Sorting
last_verified: 2026-08-11
verified_by: Vulpora maintainers
review_after: 2026-11-11
status: verified
evals: [application-architect.multi-module-boundary-review.v1]
revalidate_on: [source-version-change, eval-failure, build-tool-major-change]
---

# 물리적 빌드 모듈과 논리적 경계 구분

## 리뷰 훅

- [ ] Gradle included project 또는 Maven `<module>` 목록과 실제 artifact/source set을 분리해 기록했는가.
- [ ] project dependency와 external dependency edge를 build file에서 직접 확인했는가.
- [ ] build module 수만으로 bounded context, service, 독립 배포 단위를 단정하지 않았는가.
- [ ] 한 artifact로 합쳐지는 모듈과 별도 process/deployment인 단위를 구분했는가.
- [ ] generated code, test fixtures, BOM/parent/aggregator를 business module로 오인하지 않았는가.
- [ ] build graph와 source import가 어긋나는 compileOnly/reflection/runtime coupling도 확인했는가.

## 근거와 적용

Gradle multi-project build의 project는 root build 아래 포함된 빌드 구성 단위이며 project dependency로
서로의 output에 의존할 수 있다. Maven reactor는 선언된 module을 수집해 project dependency 등으로
빌드 순서를 정한다. 둘 다 **빌드 조립과 dependency의 물리적 증거**이지 도메인 경계나 독립 배포의
정의가 아니다.

따라서 리뷰에서는 다음 축을 별도로 만든다.

| 축 | 관찰 증거 | 답하는 질문 |
|---|---|---|
| source | import/package/type reference | 누가 누구의 어떤 타입을 아는가 |
| build | Gradle/Maven dependency edge | 어떤 project가 compile/runtime에 필요한가 |
| artifact | jar/image/package output | 무엇이 함께 조립되는가 |
| runtime | process/container/config | 무엇이 함께 실행되는가 |
| deployment | manifest/pipeline/release | 무엇이 독립적으로 출시되는가 |
| logical | language/invariant/API/data owner | 무엇이 함께 변해야 하는가 |

하나의 logical module이 여러 build project로 나뉠 수도 있고, 여러 logical module이 한 project와 한
artifact 안에 있을 수도 있다. 불일치는 자동 결함이 아니라 비용·가시성·빌드 시간·소유권을 비교할 신호다.

## 과설계 방지

단일 build module이라도 package visibility와 명시적 API, 독립 테스트로 충분히 경계를 지킬 수 있다.
반대로 작은 코드베이스를 project로 세분하면 build configuration과 cross-module fixture 비용만 늘 수 있다.
새 project 권고는 확인된 변경 독립성, 접근 통제, 빌드/소유권 이익이 있을 때만 낸다.
