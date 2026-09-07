# Current code contract

이 파일은 합성 저장소의 현재 코드와 테스트가 보장하는 동작을 요약한다.

## Order record retention

- 승인된 `Order` 기록은 생성일로부터 30일 동안 보관한다.
- 만료 기록은 매일 실행되는 정리 작업이 삭제한다.
- 테스트 `OrderRetentionPolicyTest`가 30일 경계를 검증한다.

## Request timeout

- 현재 클라이언트 요청 제한 시간은 5초다.
- 테스트 `ClientTimeoutConfigTest`가 5초 설정을 검증한다.
- 과거 30초 제한 시간은 더 이상 현재 동작이 아니다.
