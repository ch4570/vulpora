# git-flow Knowledge Base — 색인 (INDEX)

> Conventional Commits 표준 / Git(git-scm) / GitLab Docs / glab Docs를 distill한 인용 가능한 KB.
> 각 파일 frontmatter에 `source`(공식 URL)·`last_fetched`·`skills`를 담는다.
> **사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 지적 시 KB의 `source`를 근거로 인용한다.

## 작업 유형 → 읽을 KB

| KB | 다룸 |
|----|------|
| [operating-contract](operating-contract.md) | work branch, commit, push, GitLab MR 전체 실행 계약 |

### 브랜치/시작 (branch setup)
| KB | 다룸 |
|----|------|
| [branching-model](branching-model.md) | master/develop/feature/release, 보호 브랜치, 머지 흐름 |

### 커밋 (commit authoring)
| KB | 다룸 |
|----|------|
| [conventional-commits](conventional-commits.md) | type/scope/`!`/BREAKING CHANGE, SemVer 매핑, 형식 규칙 |
| [secret-guard-pre-push](secret-guard-pre-push.md) | 비밀 파일 가드, pre-push 위생, 명시적 staging |

### 푸시/MR (push & merge request)
| KB | 다룸 |
|----|------|
| [glab-mr-workflow](glab-mr-workflow.md) | glab/REST/push-option, assignee·reviewer `@me`, 인스턴스 비종속 |
| [code-review-gates](code-review-gates.md) | 승인 규칙, reviewer/approval, 머지 차단 조건 |
| [ci-green-before-merge](ci-green-before-merge.md) | 파이프라인 상태, merge when pipeline succeeds, 머지 게이트 |

## 원칙 문서와의 관계
- 상위 판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**한다.

## 갱신
- 각 파일 `last_fetched` 기준. GitLab/glab/Git 버전 변화 시 `source` URL을 다시 fetch해 갱신.
- TODO(차기): rebase/squash 정책, signed commits(GPG/SSH), MR 템플릿 변수, GitLab approval rules 세부.
