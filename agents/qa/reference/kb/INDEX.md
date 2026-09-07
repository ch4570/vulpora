# QA 테스트 설계 Knowledge Base — 색인 (INDEX)

> 테스트 설계 기법·전략·산출물 규약을 **표준 문서(ISTQB/Gherkin/Fowler)** 와 내부 규약으로
> distill한 인용 가능한 KB. 각 파일은 frontmatter에 `title`·`source`·`last_fetched`·`skills`를 담고
> 본문에 **`## 리뷰 훅`**(체크리스트)을 갖는다.
> **사용법**: 작업 유형에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며, 단정 시 `source`를 근거로 인용한다.

## 작업 유형 → 읽을 KB

### 케이스 도출 (요구/변경에서 케이스 뽑기)
| KB | 다룸 |
|----|------|
| [test-design-techniques](test-design-techniques.md) | 동등분할(EP)·경계값(BVA)·결정표·상태전이·페어와이즈, 적용 예시 |
| [acceptance-criteria-gherkin](acceptance-criteria-gherkin.md) | 인수기준, Given-When-Then, 시나리오 아웃라인·Examples |

### 전략 수립 (무엇을 어느 레벨에서)
| KB | 다룸 |
|----|------|
| [test-strategy-pyramid](test-strategy-pyramid.md) | 단위/통합/E2E 비율, 피라미드/트로피, 레벨 선택 규칙 |
| [risk-coverage](risk-coverage.md) | 위험 기반 우선순위(영향×발생가능성), 커버리지 종류, P0/P1/P2 |

### 산출물 작성 (파일로 명세화·인계)
| KB | 다룸 |
|----|------|
| [test-case-spec-format](test-case-spec-format.md) | 케이스 표(ID·전제·입력·단계·기대결과·우선순위·유형·레벨), 추적성 매트릭스 |
| [acceptance-criteria-gherkin](acceptance-criteria-gherkin.md) | 실행 에이전트에 넘길 Gherkin 시나리오 형식 |

## 협업 스킬·에이전트와의 관계
- 단위/슬라이스 테스트 형식은 프로젝트의 기존 프레임워크 관례를 재사용한다.
- 프로젝트 전역 E2E 카탈로그가 있으면 그 규약을 따른다(자체 카탈로그 신설 금지).
- 실행 가능한 시나리오는 실행 에이전트 **`e2e-test-runner`** 에 인계한다(이 에이전트는 실행하지 않는다).

## 원칙 문서와의 관계
- 상위 통찰·판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **표준 문서 근거·세부 규칙**.
- 충돌 시 **KB(표준 문서)가 principles보다 우선**한다.

## 갱신
- 각 파일 `last_fetched` 기준. ISTQB 신택스 개정·Gherkin/Fowler 문서 변경 시 `source`를 다시 확인해 갱신.
- TODO(차기): 화이트박스 커버리지(구문/분기/MC-DC), 탐색적 테스팅 세션 차터, 성능/부하 테스트 설계, 변이(mutation) 테스트 KB 추가 여지.
