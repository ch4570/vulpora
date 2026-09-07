# Skill Authoring Knowledge Base — 색인 (INDEX)

> 스킬 저작·유지 주제를 정식 표준/공식 문서로 distill한 인용 가능한 KB. 1차 출처는 이 저장소의
> `STANDARD.md`와 구축 가이드(구조·범용화·설치 계약)이며, 외부 표준(Agent Skills, SemVer, Keep a Changelog,
> Diátaxis)으로 보강한다. 각 파일은 frontmatter에 `source`·`last_fetched`·`skills`를 담는다.
> **사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 지적 시 `source`를 근거로 인용한다.

## 작업 유형 → 읽을 KB

### 새 스킬 작성 / SKILL.md 편집
| KB | 다룸 |
|----|------|
| [skill-md-conventions](skill-md-conventions.md) | frontmatter(`name` kebab=디렉터리, `description` what+use-when), 본문 골격, 정확/제네릭 예시 |
| [splitting-skills](splitting-skills.md) | 단일 책임, 분리 vs 통합 신호, description 중첩→오라우팅 |

### 스킬 변경 / 릴리스 관리
| KB | 다룸 |
|----|------|
| [versioning-change-mgmt](versioning-change-mgmt.md) | SemVer식 등급(MAJOR/MINOR/PATCH), 하위호환, deprecation, changelog, 리뷰 게이트 |
| [source-install-tracking](source-install-tracking.md) | source package와 설치본 분리, manifest·INDEX same-change 동기화 |

### KB 유지 / 신선도
| KB | 다룸 |
|----|------|
| [kb-freshness](kb-freshness.md) | `last_fetched` 케이던스, 공식 소스 재-fetch, 낡은 KB 제거, INDEX 유지, `## 리뷰 훅` 의무 |

## 각 KB 한 줄 요약
- **skill-md-conventions** — SKILL.md가 갖춰야 할 구조와 frontmatter 규약.
- **splitting-skills** — 언제 스킬을 쪼개고 언제 합치는가의 판단 기준.
- **versioning-change-mgmt** — 스킬 변경의 호환성 등급화와 변경 기록·게이트.
- **source-install-tracking** — 원본 package, manifest, runtime 설치본, 설치 증거의 책임을 분리.
- **kb-freshness** — reference KB를 최신·정확하게 유지하는 운영 규칙.

## 원칙 문서와의 관계
- 상위 판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **표준·공식 문서 근거와 세부 규칙**.
- 충돌 시 **KB(공식 문서/표준)가 principles보다 우선**한다.

## 갱신
- 각 파일 `last_fetched` 기준. 1차 출처 `STANDARD.md`나 외부 표준(SemVer/Keep a Changelog/
  Anthropic Skills/Diátaxis)이 개정되면 해당 KB의 `source`를 다시 확인해 갱신한다.
- TODO(차기 KB 후보): 스킬 테스트/검증 절차, 다중 에이전트 간 스킬 공유 규약, references/*.md 분할 가이드.
