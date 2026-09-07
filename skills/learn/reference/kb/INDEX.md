# 지식 추출/영속화 Knowledge Base — 색인 (INDEX)

> `/learn`(작업에서 재사용 교훈을 뽑아 영속화)의 인용 가능한 KB. 각 파일은 frontmatter에
> `title`·`source`(권위 출처 URL)·`last_fetched`·`skills`를 담는다.
> **사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 판단의 근거로
> KB의 `source`를 인용한다.

## 작업 유형 → 읽을 KB

### 1. 무엇을 남길지 판단 (선별)
| KB | 다룸 |
|----|------|
| [signal-vs-noise](signal-vs-noise.md) | 비자명·재사용·내구 3관문, 잡음의 전형, 원자성, 컨텍스트 비용 |

### 2. 어디에 둘지 결정 (라우팅)
| KB | 다룸 |
|----|------|
| [memory-vs-skill-vs-rule](memory-vs-skill-vs-rule.md) | 지식 vs 규칙(MUST) vs 메모리, 팀 SSOT vs 개인, Claude Code 메모리 계층 |

### 3. 어떻게 쓸지 (노트 품질)
| KB | 다룸 |
|----|------|
| [curated-notes](curated-notes.md) | write-once, 제목/출처/날짜, dedup, 제자리 갱신, 원자성, 안티패턴 |

### 4. 세션에서 무엇을 끌어낼지 (교훈 추출)
| KB | 다룸 |
|----|------|
| [lesson-extraction](lesson-extraction.md) | 근본 원인, 결정 근거(why), gotcha, blameless, 일회성→내구 산출물 변환 |

## 한 줄 요약
- **signal-vs-noise**: 영속화할 가치가 있는지(신호) vs 컨텍스트만 오염시키는지(잡음)를 가르는 3관문.
- **memory-vs-skill-vs-rule**: 인사이트의 성격(사실/규범)·공유 범위(팀/개인)에 맞는 저장소 라우팅.
- **curated-notes**: 한 번 잘 써서 오래 사는 evergreen 노트의 메타·작업 규약.
- **lesson-extraction**: 세션의 일회성 발견을 근본 원인·근거까지 캐서 내구 산출물로 전환.

## 원칙 문서와의 관계
- 상위 통찰·판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **공식/표준 출처 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**하며, principles는 통찰을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. 출처 문서(Anthropic context engineering / Claude Code Memory /
  Diátaxis / Evergreen notes / Google docguide / SRE postmortem)가 개정되면 `source`를 다시 fetch해 갱신.
- TODO(차기 KB 후보): 지식 노트의 stale/폐기(라이프사이클) 관리, 색인·링크 구조 설계,
  추출 자동화 vs 사람 큐레이션 경계, 컨텍스트 압축/요약 전략.
