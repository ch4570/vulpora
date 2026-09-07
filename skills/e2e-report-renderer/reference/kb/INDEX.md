# E2E Report Renderer Knowledge Base — 색인 (INDEX)

> 테스트 리포트 렌더링에 필요한 외부 표준·공식 문서(JUnit XML, WCAG, OWASP, Playwright,
> Allure 등)를 distill한 인용 가능한 KB. 각 파일은 frontmatter에 `source`(원문 URL)·
> `last_fetched`·`skills`를 담는다.
> **사용법**: 작업(렌더 모드/검토 항목)에 맞는 KB를 먼저 읽고, 그 "리뷰 훅"으로 점검하며,
> 지적할 때 KB의 `source` URL을 근거로 인용한다. (예: "OWASP XSS Prevention 기준 …")

## 작업 유형 → 읽을 KB

### 리포트 구조 설계 / 집계 검증
| KB | 다룸 |
|----|------|
| [test-report-structure](test-report-structure.md) | 요약 카드/결과 표/실패 상세/리스크 구성, JUnit XML 스키마(testsuite/testcase/failure), pass·fail·skipped 집계, 합산 무결성 |

### 추세(trend) / 비교(compare) 모드
| KB | 다룸 |
|----|------|
| [result-aggregation-and-trends](result-aggregation-and-trends.md) | 다수 run 집계, 시간축 pass rate 추세, 플레이키 정의, 두 run 델타 비교, 교차 카탈로그 처리 |

### 실패 아티팩트 임베드
| KB | 다룸 |
|----|------|
| [artifacts-screenshots-traces](artifacts-screenshots-traces.md) | 스크린샷/트레이스/로그/네트워크 아티팩트, 첨부 vs 인라인, Playwright trace·Allure attachment 개념, 부재 시 열화 |

### 가독성 / 접근성 검토
| KB | 다룸 |
|----|------|
| [readable-failure-reporting](readable-failure-reporting.md) | 기대 vs 실제, 증거 링크, 색각 안전(색+글리프), WCAG AA 대비, 명확한 메시지, ARIA |

### 보안 (단일 HTML)
| KB | 다룸 |
|----|------|
| [self-contained-html-security](self-contained-html-security.md) | 외부 리소스 0, XSS 방지(`textContent`/이스케이프), JSON 인라인 시 `</` 이스케이프, CSP 관점, 신뢰 못 할 캡처 데이터 처리 |

## SKILL.md `REN-n` 규칙과의 매핑

| 영역 | 관련 KB | 관련 REN |
|------|---------|----------|
| 입력 검증·집계 무결 | test-report-structure | REN-1, REN-5, REN-12 |
| 추세·비교·플레이키 | result-aggregation-and-trends | REN-4, REN-18, REN-19, REN-20, REN-21 |
| 아티팩트 인라인·열화 | artifacts-screenshots-traces | REN-8, REN-14, REN-22 |
| 색+글리프·대비·한국어 | readable-failure-reporting | REN-10, REN-11, REN-11.1, REN-12 |
| 외부리소스 0·XSS·마스킹 | self-contained-html-security | REN-6, REN-7, REN-7.1, REN-9, REN-13 |

## 원칙 문서와의 관계
- 상위 통찰·판단 기준은 `../principles.md`(헌법). KB는 그 원칙의 **공식 문서 근거·세부 규칙**.
- 충돌 시 **KB(공식 문서)가 우선**하고, principles는 통찰을 보탠다. 공통 운영 규범은 `SKILL.md`의 `REN-n`이며,
  REN-18..21은 [comparison-modes](../comparison-modes.md)가 정의한다.

## 갱신
- 각 파일 `last_fetched` 기준. 외부 표준(WCAG 버전, OWASP 치트시트, Playwright/Allure 문서)
  개정 시 `source` URL을 다시 fetch해 갱신한다.
- TODO(차기 후보): SARIF/OpenTelemetry 테스트 시그널, 인쇄(print) 스타일 시트 접근성,
  대용량 리포트의 가상 스크롤(virtualized table) KB 추가 여지.
