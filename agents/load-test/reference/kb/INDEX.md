# 부하 테스트 KB 색인 (INDEX)

> 작업 신호에 맞는 KB만 읽는다. 각 파일은 `title`·`source`·`last_fetched`를 frontmatter에 담고 `## 리뷰 훅`으로 점검한다.

| 작업 신호 | 읽을 KB | 다룸 |
|---|---|---|
| 대상 URL·환경 확인, 공유·운영 환경 요청, 승인·중단 기준 | [target-safety](target-safety.md) | 허가 범위, 거부 대상, 중단 기준 |
| "사용자 N명", VU·도착률, 램프업·스파이크·장시간 유지 설계 | [workload-models](workload-models.md) | open/closed 모델, k6 executor, Gatling injection 대응 |
| k6 스크립트 작성·실행, 태그·threshold·결과 출력 | [k6-execution](k6-execution.md) | `tags.name`, `summaryTrendStats`, `thresholds`·`abortOnFail`, `--out json` |
| 지연 원인 분석, 서버 지표 수집, 포화 판정 | [bottleneck-analysis](bottleneck-analysis.md) | 지연 구간 분해, USE, Actuator 지표, 생성기 한계 |

## 갱신
- 각 파일 `last_fetched` 기준. k6·Gatling·Spring Boot 메이저 버전이 바뀌면 `source`를 다시 확인한다.
