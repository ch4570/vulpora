# behavioral fixtures — repos

behavioral eval 케이스의 `fixture_repo` 가 가리키는 **대상 저장소** 자리다.

- 여기 있는 `sample-*` 는 러너의 `--validate`(경로 존재 검사)와 시연을 위한 **최소 generic 스켈레톤**이다.
  특정 회사/서비스/실제 레포 구조에 묶이지 않게 일반 엔티티(Member/Order/Article)만 쓴다.
- **실제 성능 측정**은 이 자리에 평가하려는 진짜 저장소(또는 그 축소본)를 두고
  `VULPORA_BEHAVIORAL_RUNNER_CMD` 어댑터로 런타임을 호출해서 한다(behavioral/README 참고).
- fixture 저장소는 **읽기 대상**이다. 러너는 fixture에 쓰기/파괴 작업을 하지 않는다.

## 교체 방법
1. `fixtures/repos/<name>/` 에 대상 코드를 둔다(또는 심볼릭/축소본).
2. 케이스의 `fixture_repo: fixtures/repos/<name>` 를 맞춘다.
3. `bash ../../run-behavioral-evals.sh --validate` 로 경로/구조를 확인한다.
