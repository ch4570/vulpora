# templates — 다른 레포에 복사해서 쓰는 범용 템플릿

특정 서비스·도메인에 묶이지 않은 실행용 자산을 모아둔다. 필요한 것만 골라 대상 레포로 복사한다.

## 구성

```text
templates/
├── commands/            # Claude Code 슬래시 커맨드 (대상 레포의 .claude/commands/ 로 복사)
│   ├── ship.md          # /ship — commit→push→MR→review→CI 대기 자동화, merge는 사용자 수행 (glab)
│   └── branch.md        # /branch — 통합 브랜치 기반 작업 브랜치 생성
├── githooks/            # 팀 공유 git 훅 (대상 레포의 .githooks/ 로 복사)
│   ├── pre-commit       # 시크릿 가드 + 빌드시스템 자동감지 테스트 게이트
│   ├── pre-push         # 휘발성 산출물 유출 차단 (agent-memory-gate 호출)
│   └── README.md        # 훅 설치/동작 설명
└── scripts/
    └── agent-memory-gate.sh   # pre-push 가 호출하는 오프라인 게이트 (대상 레포의 scripts/ 로 복사)
```

## 적용 방법

### 슬래시 커맨드
```bash
mkdir -p <대상레포>/.claude/commands
cp templates/commands/ship.md   <대상레포>/.claude/commands/
cp templates/commands/branch.md <대상레포>/.claude/commands/
```
- `ship.md`/`branch.md`는 **glab(GitLab)** 기준. 인스턴스·사용자명을 하드코딩하지 않고 `@me`·인증 컨텍스트를 따른다.
- `ship`의 코드 리뷰 단계는 설치된 리뷰 에이전트를 호출한다.

### git 훅
`templates/githooks/README.md`의 설치 절차를 따른다(요약):
```bash
cp -R templates/githooks <대상레포>/.githooks
cp templates/scripts/agent-memory-gate.sh <대상레포>/scripts/
cd <대상레포> && git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/pre-push scripts/agent-memory-gate.sh
```

## 규약
- 언어: **한국어**. git 플랫폼: **glab(GitLab)**. 빌드 게이트: **빌드시스템 자동감지**(gradle/maven/npm·pnpm·yarn/go/cargo).
- 도메인 결합 없음(범용). 대상 레포 고유 규칙은 별도 오버레이로 추가한다.
