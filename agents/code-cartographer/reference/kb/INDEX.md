# Code Cartographer Knowledge Base — 색인 (INDEX)

> Mermaid 공식 문서를 distill한 인용 가능한 KB와 가독성 규약. 각 파일은 frontmatter에
> `title`·`source`(원문 URL)·`last_fetched`·`consumers`를 담는다.
> **사용법**: 작업 단계(다이어그램 타입 선택 → 문법 작성 → 가독성 점검)에 맞는 KB를 먼저 읽고,
> 그 "리뷰 훅"으로 자기 점검하며, 문법 근거를 댈 때 KB의 `source` URL을 인용한다.

## 작업 단계 → 읽을 KB

### 정적 추적과 앵커
| KB | 다룸 |
|----|------|
| [behavior-to-diagram-type](behavior-to-diagram-type.md) | 대상 행동에 맞는 flowchart/sequence/state 선택 |
| [static-tracing-method](static-tracing-method.md) | 진입점부터 분기·루프·예외까지 정적으로 추적하는 절차 |
| [code-anchoring-fileline](code-anchoring-fileline.md) | 모든 노드를 검증된 `path:line` 근거에 연결하는 방법 |

### 다이어그램 문법 (산출물 작성)
| KB | 다룸 |
|----|------|
| [mermaid-flowchart-syntax](mermaid-flowchart-syntax.md) | flowchart 문법: 방향(TD/LR), 노드 모양, 엣지·조건 라벨, subgraph, `click` 지시문 |
| [mermaid-sequence-syntax](mermaid-sequence-syntax.md) | sequenceDiagram 문법: participant·alias, 동기/비동기 화살표, activation, alt/opt/loop, note |
| [mermaid-state-syntax](mermaid-state-syntax.md) | stateDiagram-v2 문법: 상태·전이, `[*]` 시작/종료, 전이 조건 라벨, 복합 상태 |

### 가독성 (모든 산출의 최종 점검)
| KB | 다룸 |
|----|------|
| [diagram-readability](diagram-readability.md) | 노드 수 예산, 라벨 작성, subgraph 그룹화, 방향 일관성, 색/스타일 절제, 분리 기준, 앵커 범례 포맷 |

## 원칙 문서와의 관계
- 상위 원칙(정적 도출·가독성·앵커 필수·발명 금지·결정론)은 `../principles.md`(헌법).
- KB는 그 원칙을 구현하는 **공식 문법 근거·세부 규칙**. 충돌 시 **KB(공식 문서)가 우선**한다.
- 추적·앵커·다이어그램 선택 절차와 출력 문법은 모두 이 번들에 있어 에이전트가 독립적으로 실행할 수 있다.

## 갱신
- 각 파일 `last_fetched` 기준. Mermaid 메이저 변경 시 `source` URL을 다시 fetch해 갱신.
- TODO(차기): class diagram 문법 KB(타입 관계 시각화), C4/architecture 다이어그램 KB, 큰 흐름의 다단 분할 패턴 KB.
