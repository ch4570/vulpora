---
title: SKILL.md 구조 & frontmatter 규약
source: ../../../../STANDARD.md
last_fetched: 2026-07-16
skills: [skill-updater]
---

# KB: SKILL.md 구조 & frontmatter 규약

근거: 이 저장소 `STANDARD.md`(§1 레이아웃, §2 파일 규약) + Agent Skills specification과 best
practices(https://agentskills.io/specification,
https://agentskills.io/skill-creation/best-practices).

## frontmatter 필수 필드
| 필드 | 규칙 |
|------|------|
| `name` | **kebab-case**, 스킬 **디렉터리명과 동일**해야 함. |
| `description` | 한 문단. "무엇인지 + **명시적 use-when 트리거**" 둘 다 포함. |

```yaml
---
name: order-export
description: Exports Order records to CSV with a stable schema. Use when asked to dump,
  export, or back up orders for reporting or migration.
---
```

- `name`이 디렉터리명과 다르면 로드/라우팅이 깨진다.
- `description`은 **라우팅 신호**다. 트리거 동사(create/export/review/fix 등)와 대상 명사를
  사용자 표현에 맞춰 넣는다. 내부 모듈명·도메인 용어가 아니라 외부 신호로 쓴다.

## 본문 구조 (권장 골격)
1. 한 줄 목적과 가장 짧은 기본 절차.
2. 필요한 분기, output, verification.
3. `reference/principles.md`와 `reference/kb/INDEX.md`의 직접 링크와 topic loading trigger.
4. 정확하거나 **명시적 제네릭**인 예시와 점검 checklist.

## 작성 규약
- 언어: `STANDARD.md`의 provider/locale-neutral 원칙을 따른다. 사용자와 대상 repository의 언어를
  우선하고 기존 문서의 불필요한 전면 번역보다 의미·trigger·runtime 호환성을 보존한다.
- source package는 `skills/<id>/`에 두고 runtime별 설치 경로를 본문에 SSOT처럼 하드코딩하지 않는다.
- 본문이 500줄에 접근하면 core workflow만 남기고 상세 사실과 variant를 on-demand reference로 분리한다.
- 코드/명령 예시는 **실제 타입·API와 일치**하거나 일반 엔티티(`Order`/`Member`/`Article`)로
  **명시적 제네릭** 표기. 존재하지 않는 저장소 API를 지어내지 않는다.
- 빌드/도구 명령은 특정 도구에 고정하지 말고 **빌드시스템 자동감지**(gradle/maven/npm/pnpm/yarn)
  로 일반화한다. Git provider·CLI·base branch·assignee/reviewer는 repository 증거나 명시적 project
  policy로 해소하고 공용 skill에 하드코딩하지 않는다.
- 바인딩 overlay(`AGENTS.md`/`CLAUDE.md`)와 모순 금지. 저장소 고유 예외는 인라인 명시.

## 흔한 실수
- description에 "무엇"만 있고 "언제"가 없음 → 호출되지 않음.
- `name` ≠ 디렉터리명 → 미로딩.
- 도메인 결합 예시(특정 서비스·비즈니스 도메인 등)를 그대로 둠 → 이식성 상실.

## 리뷰 훅
- [ ] `name`이 kebab-case이고 디렉터리명과 정확히 일치하는가.
- [ ] `description`에 "무엇 + use-when 트리거"가 모두 있는가.
- [ ] 트리거가 사용자의 실제 표현(자연어)에 맞는가(내부 용어 아님).
- [ ] 예시가 실제 API와 일치하거나 명시적 제네릭인가(지어낸 API 없음).
- [ ] 빌드/플랫폼 명령이 자동감지되고 provider·사용자·base branch를 하드코딩하지 않았는가.
- [ ] principles와 INDEX 진입점 및 task별 topic loading trigger가 있는가.
- [ ] source path와 runtime 설치 path를 구분하고 있는가.
