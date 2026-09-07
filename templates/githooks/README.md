# githooks — 팀 공유 git 훅 (범용 템플릿)

git 으로 추적되는 공유 훅 디렉터리다. 다른 레포에 복사해서 쓰는 것을 전제로 한 **범용 템플릿**이다.

## 설치 (대상 레포에 도입할 때)

```bash
# 1) 이 디렉터리(githooks/)와 ../scripts/agent-memory-gate.sh 를 대상 레포 루트에 복사
#    예: 대상레포/.githooks/ , 대상레포/scripts/agent-memory-gate.sh
# 2) 훅 디렉터리 활성화 (클론마다 1회)
git config core.hooksPath .githooks
# 3) 실행권한
chmod +x .githooks/pre-commit .githooks/pre-push scripts/agent-memory-gate.sh
```

> 활성화 확인: `git config core.hooksPath` 가 `.githooks` 를 출력하면 적용됨.
> 빌드 라이프사이클에 묶지 않는다(루트 빌드에 git 부수효과를 주지 않기 위함) — 클론마다 1회 명시 실행.

CLI에서는 `vulpora setup --runtime codex --scope project --target . githooks`로
hooks와 의존 gate를 함께 설치한다(`--runtime claude-code`도 가능).
gate의 canonical 설치 경로는 런타임과 무관한 `scripts/agent-memory-gate.sh`다.
구버전 `.codex/scripts`, `.claude/scripts`, `.opencode/scripts`는 정확히 하나만 있을 때
fallback으로 찾는다. `gate-path.sh`를 포함한 hooks 디렉터리 전체를 설치해야 한다.
누락, 모호한 경로, symlink gate, exit 0만 반환하는 낡은 no-op gate는
`INCONCLUSIVE`와 nonzero 종료로 차단된다.

gate는 매 실행 `status=PASS|FAIL|NOT_RUN|INCONCLUSIVE`와 `scanned_files=N`을
출력한다. hooks와 CI는 nonempty PASS receipt를 확인한다. 기본 빈 스캔은
`NOT_RUN`, exit 2다. `--allow-empty`를 명시한 경우에만 exit 0이 가능하며
상태는 계속 `NOT_RUN`이다. hooks는 빈 staging/삭제 전용 push를 허용하기 위해
이 예외를 명시적으로 사용한다. pre-commit은 staged paths, pre-push는 현재
추적 경로와 전송 범위의 모든 커밋 경로를 NUL 형식으로 검사한다. 따라서
커밋 후 지운 로그도 전송 전에 차단한다.

## pre-commit

커밋 전 두 가지를 강제한다.

1. **시크릿 가드(하드 차단).** 스테이징된 변경에서 자격증명/키를 감지하면 커밋을 막는다 —
   `*.key`/`*.pem`/`*.p12`/`*.jks`/`*.keystore`·`id_rsa*` 확장자, `.env`(단 `.env.example` 허용),
   비소스 파일의 `credential*`/`*secret*`/`*token*` 이름, staged diff 의 개인키 헤더·AWS Access Key ID 패턴.
   (`*/test/*`·`testFixtures`·`fixtures` 픽스처와 소스·문서 파일명은 오탐 방지로 부분일치 검사에서 제외.)
2. **테스트 게이트(빌드시스템 자동감지).** 변경에 코드가 있으면 빌드시스템을 감지해 좁은 테스트를 실행한다:
   - **Gradle**: 변경 파일에서 가장 가까운 `build.gradle(.kts)` 디렉터리를 모듈로 보고 `:module:test` 실행(없으면 `test`).
   - **Maven**: `mvn -q test`.
   - **Node**(package.json): lock 파일로 npm/pnpm/yarn 판별 후 `test` 스크립트 실행.
   - **Go**: `go test ./...`. **Rust**: `cargo test`.
   - 비코드 변경(.md/.claude/docs/설정)만이면 건너뛴다. 인식 못 한 빌드시스템도 건너뛴다.

### 참고
- 통합 테스트가 로컬 DB/인프라 의존으로 "missing table" 류 실패를 내면 코드 문제가 아닐 수 있다 —
  로컬 스키마/마이그레이션을 동기화한 뒤 다시 커밋한다.
- 우회(`--no-verify`/`--amend`)는 지양. 정말 필요한 환경 예외에서만 의식적으로 사용한다.

## pre-push

원격 전송 직전 **휘발성 산출물(raw log/transcript/agent-runtime)이 git 에 추적되는지** 막는다.
공용 게이트 `scripts/agent-memory-gate.sh` 를 호출하며, **LLM·네트워크 의존 없이** 즉시·오프라인 동작한다.

- 의도적 분리: "메모리 큐레이션이 끝났는가" 는 보지 **않는다**. 오직 "금지 산출물이 추적되는가" 만 본다.
- 에이전트 hook(tool call)과 git pre-push(사람 직접 push)의 **2중 방어선**이다.
- raw log/transcript 는 애초에 repo 밖(`~/.agent-runtime/<hash>/`)에 두는 게 정석. 이 게이트는 방어선.
- 차단되면: `git rm --cached <파일>` + `.gitignore` 확인. 정말 예외면 `git push --no-verify`.
