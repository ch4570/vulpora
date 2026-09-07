# 에이전트 하네스 Knowledge Base — 색인 (INDEX)

> 에이전트 하네스(액션 스페이스·도구 정의·관측 포맷·스코핑·안전한 변경 제안)에 관한 인용 가능한 KB.
> 각 파일은 frontmatter에 `source`(공식 문서 URL)·`last_fetched`·`skills`를 담는다.
> **사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 지적 시 KB의 `source`를 근거로 인용한다.

## 작업 유형 → 읽을 KB

### 하네스 트렌드 제안 / 정기 리뷰 (harness-propose 본 절차)
| KB | 다룸 |
|----|------|
| [proposing-changes-safely](proposing-changes-safely.md) | 리서치→중복제거→4축 점수화→가역적 적용안→승인 |
| [scoping-guardrails](scoping-guardrails.md) | 승인 게이트·MUST/MUST NOT·blast-radius·dry-run·롤백 |

### 액션 스페이스 / 도구 설계 검토
| KB | 다룸 |
|----|------|
| [action-space-design](action-space-design.md) | 최소·직교 도구, 중복/모호 제거, 에러=피드백, 멱등성 |
| [tool-definitions](tool-definitions.md) | 이름·정밀 파라미터 스키마·설명 disambiguation·예시·구조화 에러 |

### 컨텍스트 / 관측 품질 검토
| KB | 다룸 |
|----|------|
| [observation-formatting](observation-formatting.md) | 토큰 경제·잘림 전략·신호/잡음·구조 vs 산문·실패 노출 |

## 각 KB 한 줄 요약
| KB | 한 줄 요약 |
|----|-----------|
| [action-space-design](action-space-design.md) | 행동 집합을 최소·직교로 설계하고 에러를 피드백 채널로 쓴다. |
| [tool-definitions](tool-definitions.md) | 이름·스키마·설명·예시·구조화 에러로 호출 정확도를 높인다. |
| [observation-formatting](observation-formatting.md) | 관측은 신호만 남기고 잘림·실패를 명시해 컨텍스트를 아낀다. |
| [scoping-guardrails](scoping-guardrails.md) | 기본 안전·승인 게이트·blast-radius·롤백으로 위험을 통제한다. |
| [proposing-changes-safely](proposing-changes-safely.md) | 트렌드를 4축 점수화해 가역적 적용안으로 만들고 승인받는다. |

## 원칙 문서와의 관계
- 상위 통찰·판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**이다.
- 충돌 시 **KB(공식 문서)가 우선**하며, principles는 상위 판단 맥락을 보탠다.

## 갱신
- 각 파일 `last_fetched` 기준. 출처(공식 문서)는 개정이 잦으므로 분기/반기로 재fetch해 갱신한다.
- **모델 독립성**: 어떤 KB도 특정 모델 버전을 전제하지 않는다. 버전 종속 사실이 들어오면 일반 규칙으로 재작성한다.
- TODO(차기 KB 후보): 멀티에이전트 오케스트레이션(워크플로 vs 에이전트)·평가/이밸 하네스(eval-driven)·메모리/리트리벌 설계·프롬프트-도구 일관성 검증.
