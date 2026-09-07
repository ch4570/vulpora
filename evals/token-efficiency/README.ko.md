# 스킬 토큰 효율 검증

한국어 · [English](README.md) · [평가 문서](../README.md)

스킬 검색용 metadata, 진입 본문, 실제 작업에 필요한 참조 묶음을 나눠 측정합니다.
**tiktoken 0.14.0의 `o200k_base` 인코딩**을 사용합니다. 이 인코딩에 대한 정확한 수치이며,
제공자의 과금 토큰이나 런타임이 실제로 읽은 문맥을 측정한 값은 아닙니다. 도구는 모델을 호출하지 않습니다.

## 선택적으로 측정하기

Python 3.9+와 별도 환경에 설치한 tokenizer가 필요합니다. Vulpora 설치기나 npm 의존성에는
추가하지 않았습니다. 최초 tokenizer 실행은 인코딩 데이터를 내려받을 수 있고, 이후에는 캐시를 사용합니다.

```sh
python3 -m venv .vulpora/token-audit-venv
.vulpora/token-audit-venv/bin/python -m pip install -r evals/token-efficiency/requirements.txt
TIKTOKEN_CACHE_DIR=.vulpora/tokenizer-cache .vulpora/token-audit-venv/bin/python evals/token-efficiency/measure-skills.py --baseline evals/token-efficiency/baseline.json --check --output .vulpora/token-efficiency.json
```

결과 JSON에는 62개 스킬, 본문·frontmatter·discovery 각각의 토큰, 파일 hash, 선택된 참조,
변경 전후 차이와 선택적 budget 검사 결과가 들어갑니다. 파일 누락·중복, tokenizer 버전 불일치,
비교 시나리오 변경은 조용히 제외하지 않고 오류로 처리합니다. `--check`는 예산 초과 시 exit 1,
잘못된 입력은 exit 2를 반환합니다. 예산을 적용하지 않고 측정하려면 `--check`를 생략합니다.

[load-scenarios.json](load-scenarios.json)이 변경 전후 읽을 파일과 시나리오별 예산을 명시합니다.
이는 선언된 소스 로딩 계약입니다. 런타임이 실제로 그 경로를 따랐다는 증거는 아닙니다.
새 작업 분기를 추가할 때 필요한 참조도 함께 등록해야 합니다. 본문에서 참조로 옮긴 내용도
선택된 작업에서 읽는다면 측정에 포함합니다.

## 변경 전후 기록

[이식 가능한 기준값](baseline.json)은 최적화 전 소스의 식별자를 Vulpora로 정규화한 뒤 측정했습니다.
파일 해시는 정규화한 바이트의 값입니다. 원본 개발 스냅샷은 비공개로 보존하며 공개 저장소에는
측정 기록만 포함합니다.
파일은 저장소 상대 경로와 SHA-256으로 식별합니다. 각 선택 파일은 한 번씩 합산하며,
런타임 포장 문구·프로젝트 증거·도구 결과·출력 토큰·반복 읽기는 양쪽 모두 제외합니다.

전체 스킬의 정규화된 discovery metadata는 **4,869 → 4,205토큰**입니다.
`name: ID`와 정규화한 `description: TEXT`를 측정했으며 런타임·plugin 포장 문구는 제외했습니다.

| 선택한 작업 | 이전 | 이후 | 감소율 |
|---|---:|---:|---:|
| `test-authoring-junit` | 9,647 | 4,067 | 57.84% |
| `test-authoring-jpa` | 10,351 | 4,771 | 53.91% |
| `test-authoring-agentic-change` | 11,614 | 6,034 | 48.05% |
| `schema-doc-standard` | 4,008 | 3,343 | 16.59% |
| `schema-doc-with-examples` | 4,008 | 4,064 | -1.40% |
| `e2e-author-spring` | 12,510 | 8,539 | 31.74% |
| `e2e-render-single` | 12,895 | 9,352 | 27.48% |
| `e2e-render-trend` | 12,895 | 9,844 | 23.66% |
| `e2e-runner-owned-suite` | 14,493 | 11,110 | 23.34% |
| `git-flow-branch-only` | 10,857 | 1,077 | 90.08% |
| `git-flow-publication` | 10,018 | 7,798 | 22.16% |

스키마 예제를 실제로 읽는 경로는 참조의 안내문과 라우팅 포인터만큼 소폭 증가합니다.
이를 절감으로 계산하지 않았습니다. 표는 이번 변경 시점의 기록이며, 현재 작업 트리의 값은
위 명령으로 다시 측정할 수 있습니다.

## 적용한 설계

- [테스트 작성](../../skills/test-authoring/SKILL.md)의 TST/PST 정의를 유지하고 프레임워크와
  테스트 대상에 맞는 문서만 직접 읽습니다. 근거 설명과 INDEX는 필요할 때 읽으며,
  INDEX에서 반복하던 요약 표를 하나의 라우팅 표로 합쳤습니다.
- [스키마 문서](../../skills/schema-doc-extract/SKILL.md)와
  [E2E 카탈로그](../../skills/e2e-scenario-author/SKILL.md)는 출력·검증 계약을 유지하고,
  구체적인 출력 예제가 필요할 때만 예제 파일을 읽습니다. E2E 진입점 추출 문서는 명시적으로 선택합니다.
- [E2E 보고서](../../skills/e2e-report-renderer/SKILL.md)의 REN-18..21은 추세·비교 모드에서만 읽습니다.
  입력 완료 여부, 마스킹, XSS, 스키마와 출력 규칙은 본문에 유지합니다. HTML 템플릿과 공유 보고서 계약은
  변경 전후 모두 합산했습니다.
- [E2E 실행](../../skills/e2e-runner/SKILL.md)은 전체 RUN 계약과 단일 실행 소유자를 유지합니다.
  환경·HTTP·비동기·산출물 문서는 작업 조건으로 선택하고, 근거 설명과 INDEX를 매번 읽지 않습니다.
- [Git 흐름](../../skills/git-flow/SKILL.md)은 구현 전 branch 준비와 기존 작업의 공개 절차를 분리합니다.
  Branch 준비는 target/default `develop`, dirty tree, base 누락·분기, fast-forward-only 규칙을 지키고
  commit·push·MR 없이 끝납니다. 공개 요청은 전체 공개 계약을 읽습니다.
- 과도하게 긴 검색용 설명을 줄였습니다. 스킬 ID, 입력과 본문의 실행 계약은 유지하며 목록은 62개입니다.

## 다음 변경의 기준값 만들기

```sh
TIKTOKEN_CACHE_DIR=.vulpora/tokenizer-cache .vulpora/token-audit-venv/bin/python evals/token-efficiency/measure-skills.py --output .vulpora/before-next-edit.json
```

수정 후 이 파일을 `--baseline`으로 전달하면 비교할 수 있습니다. 초기 기준값의 원본 재생성에는
비공개 개발 스냅샷이 필요합니다. 현재 공개 소스는 위의 고정 tokenizer로 다시 측정할 수 있습니다.

## 독립 세션 실측

2026-09-07에 Codex CLI 0.153.4로 작은 fixture 두 개를 실행했습니다. 아래 모델·추론 값은
**요청한 설정**이며 제공자 내부의 실제 모델 식별을 인증한 값은 아닙니다. 두 세션 모두 후보 결과를
반환했고, 상위 세션이 별도로 검증했습니다. 읽기 작업은 정확한 설정값과 파일 보존을 확인했습니다.
구현 작업은 소스 파일 하나만 수정했으며, 테스트 파일을 보존한 채 기존 실패 테스트가 통과했습니다.

| 작업 | 요청 모델 / 추론 | 캡슐 바이트 | 부모 반환 바이트 | 누적 입력 토큰 | 입력에 포함된 캐시 | 출력 토큰 |
|---|---|---:|---:|---:|---:|---:|
| 설정값 읽기·검토 | `gpt-5.6-luna` / `low` | 1,454 | 1,595 | 23,314 | 11,008 | 331 |
| 작은 구현 수정 | `gpt-5.6-terra` / `medium` | 1,613 | 1,678 | 56,037 | 39,168 | 617 |

누적 입력에는 런타임 지침과 반복되는 문맥 등 작업자의 모델 호출 입력이 포함됩니다. 캡슐 자체의
토큰 수나 상위 세션의 문맥 크기가 아닙니다. 사용량은 최종 최상위 `turn.completed` 이벤트에서
관측했습니다. 캐시 입력은 이미 입력 토큰에 포함되어 있습니다. 보고된 추론 토큰은 각각 25와 54이며
별도로 보존하고 다시 더하지 않았습니다. 상위 대화는 전달하지 않았고 원본 런타임 이벤트는
폐기했습니다. 이 결과는 실행 방식의 동작을 확인하며 총 토큰·요금 절감을 입증하지는 않습니다.

**작은 조회와 수정은 직접 처리합니다.** 조사·도구 출력이 크고 독립적으로 수행·검증할 수 있는
작업에 새 세션을 우선 사용합니다. 예산에는 작업자의 입력·출력과 상위 세션의 통합·검증을 함께
포함해야 합니다. 반환 JSON이 작아도 작업자의 전체 사용량은 클 수 있습니다. 준비 단계의 토큰
추정치는 라우팅 조건이며 실제 사용량의 강제 상한이 아닙니다. 병렬 실행을 늘리기 전에 관측 사용량을
확인하세요. 실행 제한은 [독립 세션 계약](../../skills/start-task/reference/kb/independent-sessions.md)에 있습니다.
