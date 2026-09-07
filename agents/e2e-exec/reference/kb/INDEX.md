# E2E 실행 Knowledge Base — 색인 (INDEX)

> **Playwright 공식 문서**와 테스트 데이터 관리 실무를 distill한 인용 가능한 KB. 각 파일은
> frontmatter에 `title`·`source`(원문 URL)·`last_fetched`·`skills`를 담는다.
> **사용법**: 작업 단계에 맞는 KB 파일을 먼저 읽고, 그 "리뷰 훅"으로 점검하며,
> 지적·결정 시 KB의 `source` URL을 근거로 인용한다. (예: "Playwright `test-retries` 기준 …")

## 작업 단계 → 읽을 KB

| 단계 | KB | 다룸 |
|----|----|------|
| 시나리오 수령·실행 흐름 | [e2e-execution-workflow](e2e-execution-workflow.md) | 수령→준비→실행→수집 흐름, 빌드/프레임워크 자동감지 |
| **데이터 클렌징(핵심)** | [test-data-lifecycle](test-data-lifecycle.md) | setup/seed·teardown, 트랜잭션 롤백 vs 명시 삭제, 격리·멱등, 정리 검증, 고아 데이터 방지 |
| flaky 처리 | [flaky-stability](flaky-stability.md) | flaky 원인·격리/쿼런틴, 결정적 대기(고정 sleep 금지), 재시도 정책 |
| 픽스처·환경 | [fixtures-environment](fixtures-environment.md) | 픽스처/환경 분리(운영 금지), 시드 데이터, 외부 의존성 모킹/스텁 |
| 결과·아티팩트 | [reporting-artifacts](reporting-artifacts.md) | 스크린샷/비디오/trace, 실패 재현, run JSON 기반 리포트 |

## 원칙 문서와의 관계
- 상위 원칙·통찰은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**하며, principles는 실무 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. Playwright 메이저 업데이트 시 `source` URL을 다시 fetch해 갱신.
- TODO(차기): 컴포넌트 테스트, 시각 회귀(스냅샷), 인증 상태 재사용(storageState), 병렬 샤딩 KB 추가 여지.
