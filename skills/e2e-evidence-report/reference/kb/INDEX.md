# e2e-evidence-report KB index

| 작업 신호 | 읽을 KB | 다룸 |
|---|---|---|
| 브라우저 케이스 녹화·스크린샷, Playwright 설정 overlay, 증거 파일 위치 | [media-evidence](media-evidence.md) | `video`·`screenshot` 옵션, 저장 시점, overlay 경로 기준 |
| 케이스 결과 데이터 확인, DB assertion 작성, 읽기 전용 조회 | [db-state-verification](db-state-verification.md) | run-owned DB 한정, 읽기 전용 트랜잭션, 식별자 범위, 행 상한 |

## KB 한 줄 요약

| KB | 요약 |
|---|---|
| [media-evidence](media-evidence.md) | 저장소 설정은 그대로 두고 run 전용 overlay로 모든 케이스를 녹화·캡처하며, 영상은 context 종료 시 저장된다 |
| [db-state-verification](db-state-verification.md) | 케이스 정리 전에 run-owned DB에서 케이스 식별자로 범위를 좁힌 읽기 전용 조회로 결과 행을 확인한다 |
