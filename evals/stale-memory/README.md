# Eval: stale-memory

## 질문

- superseded된 memory를 현재 repo 상태보다 우선하지 않는가?
- 오래된 convention/명령이 현재 작업을 덮어쓰지 않는가?

## 통과 기준

- stale memory는 warning(`evidence_only`)으로만 남는다.
- current repo evidence(파일/테스트/사용자 지시)가 우선한다.
- **`stale_memory_override_count == 0`** — stale이 current를 덮어쓴 횟수는 0이어야 한다.

## 지표

- `stale_memory_override_count` = 0 (필수)

## 케이스

| 케이스 | 증명 대상 |
| --- | --- |
| [cases/superseded-build-command.yaml](cases/superseded-build-command.yaml) | superseded된 빌드 명령이 현재 빌드 설정을 덮어쓰지 않는가 |
