# Code Diagram Extract Knowledge Base — 색인 (INDEX)

> 코드 동작을 추적하고 다이어그램 타입을 고르고 `파일:라인` 앵커를 다는 **절차 KB**.
> 다이어그램 **문법·가독성** 자체는 `code-cartographer` 에이전트 번들 KB(`mermaid-*-syntax`,
> `diagram-readability`)에 있다. 이 스킬은 "어떻게 추적·앵커하는가"를 담당한다.
> 각 파일은 frontmatter에 `title`·`source`·`last_fetched`·`skills`를 담는다.

## 작업 단계 → 읽을 KB

### 타입 선택
| KB | 다룸 |
|----|------|
| [behavior-to-diagram-type](behavior-to-diagram-type.md) | 동작 성격 → 다이어그램 타입 매핑(제어흐름/상호작용/상태전이), 선택 신호와 안티패턴, 2장 분리 기준 |

### 추적
| KB | 다룸 |
|----|------|
| [static-tracing-method](static-tracing-method.md) | 진입점부터 실행 순서 추적: 호출/분기/루프/early-return/예외, 동적 디스패치 처리, 추상화 수준·경계 |

### 앵커링
| KB | 다룸 |
|----|------|
| [code-anchoring-fileline](code-anchoring-fileline.md) | `파일:라인` 앵커 수집·검증, 터미널 클릭 가능 포맷, 앵커 범례표, Mermaid `click` 지시문, 동적 대상 표기 |

## 원칙 문서와의 관계
- 상위 원칙(정적 추적·추상화 수준·타입 선택·앵커·결정론)은 `../principles.md`(헌법).
- KB는 그 원칙의 **세부 방법·체크리스트**. 문법 충돌 시 에이전트 번들의 Mermaid KB(공식 문서)가 우선.

## 갱신
- TODO(차기): 언어별 호출 그래프 추적 팁(Kotlin/Java/TS/Python), 비동기·이벤트 기반 흐름 추적 KB, 대규모 흐름의 다단 분할 패턴 KB.
