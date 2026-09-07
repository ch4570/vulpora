# 토큰 효율 설계 재검토 — 2026-09-07

## 무엇을 잘못 최적화했나

이전 개선은 모델 단가와 명시적인 작업 프롬프트 길이를 줄였지만, 완료까지 누적되는 입력과 도구 왕복을
충분히 관측하지 않았다. 작게 분리한 세션도 런타임 문맥을 다시 갖고 시작하며, 추가 도구 왕복에서 입력을
다시 처리할 수 있다. 짧은 최종 답변, 작은 capsule, 낮은 모델 단가는 총토큰 절감과 각각 다른 지표다.

[보존된 라우팅 실험](../evals/token-efficiency/results/routing-ab-2026-09-07.json)은 전체 하네스를 설치한
실험이 아니다. 프로젝트 하네스 없이 진입 라우터만 시험했다. 따라서 이 결과를 근거로 전체 하네스의
중복 지침이 7.8% 증가를 일으켰다고 단정하는 설명은 성립하지 않는다. 과거 결과는 수정하지 않는다.

| 항목 | Terra 고정 | 자동 라우팅 | 차이 |
|---|---:|---:|---:|
| 입력 | 188,878 | 203,246 | +14,368 |
| 그중 캐시 입력 | 149,504 | 149,504 | 0 |
| 출력 | 5,665 | 6,537 | +872 |
| 입력+출력 | 194,543 | 209,783 | +15,240 |

총 증가분의 94.3%가 입력 증가다. 캐시 입력은 입력의 부분집합이고 reasoning은 출력에 다시 더하지 않는다.
자동 경로 입력은 전체의 96.9%다. 네 문제는 모두 첫 시도에 통과했고, 수리 호출은 없었다.

| 문제 | 총토큰 차이 | 고정 / 자동 명령 실행 수 | 자동 모델 |
|---|---:|---:|---|
| 유한한 양수 | −6,406 | 2 / 2 | Luna |
| Query 인코딩 | +3,881 | 2 / 3 | Luna |
| LRU | +960 | 2 / 2 | Terra |
| 비동기 retry | +16,805 | 2 / 3 | Terra |

`retry`는 같은 모델·effort·과제인데 한 번의 실행에서 16,805토큰이 더 들었다. 이것이 순증가보다 크다.
명령 수 증가와 입력 증가는 함께 관측되지만, 명령 이벤트가 provider 요청 하나와 같지는 않다.
기존 보고서에는 명령 해시와 참조 파일, 최종 usage가 있고, 도구 출력별 크기나 provider 요청별 입력은 없다.
원본 스트림을 보관하지 않았으므로 이제 와서 정확한 replay 비용을 복원할 수 없다.

## 비교한 실제 구현과 채택 범위

가재코드는 `Yeachan-Heo/gajae-code`, 우로보로스는 `Q00/ouroboros`의 다음 고정 커밋을 읽었다.
플러그인 설치나 외부 프로젝트 코드 실행은 하지 않았다.

| 프로젝트와 소스 | 확인한 동작 | Vulpora 판단 |
|---|---|---|
| [Gajae 구조화된 읽기](https://github.com/Yeachan-Heo/gajae-code/blob/f238c66de513d9a8b1b8d2544d413bd04e1c43db/packages/coding-agent/src/tools/read.ts#L2908-L2951) | 지원되는 읽기를 구조 요약으로 제공하고 상세 복구 경로 안내 | 작은 정확한 소스를 미리 전달하는 제한된 방법부터 측정. AST 요약·도구 교체는 추가하지 않음 |
| [Gajae 출력 보관](https://github.com/Yeachan-Heo/gajae-code/blob/f238c66de513d9a8b1b8d2544d413bd04e1c43db/packages/coding-agent/src/tools/bash.ts#L291-L335), [이전 출력 정리](https://github.com/Yeachan-Heo/gajae-code/blob/f238c66de513d9a8b1b8d2544d413bd04e1c43db/packages/agent/src/compaction/pruning.ts#L1-L99) | 제한된 출력과 복구 가능한 파일 참조, 오래된 읽기 결과 정리 | 작업 모델에 도달하기 전에 줄여야 함. 외부 runner가 JSONL을 받은 뒤 줄이는 것으로 작업자 토큰이 줄었다고 주장하지 않음 |
| [Gajae 스킬 공개 범위](https://github.com/Yeachan-Heo/gajae-code/blob/f238c66de513d9a8b1b8d2544d413bd04e1c43db/packages/coding-agent/src/extensibility/skills.ts#L557-L584) | 메타데이터 안내와 필요한 본문 주입 구분 | 기존 Vulpora 분기별 참조 로딩 유지. 전역 런타임 문맥을 capsule 크기로 오인하지 않음 |
| [Ouroboros 단계별 검증](https://github.com/Q00/ouroboros/blob/1fc754e7b7599b3df057660bcc6af37241183766/src/ouroboros/evaluation/pipeline.py#L95-L242) | 기계적 검사 실패 시 중단, 이후 의미 평가와 조건부 합의 | 이번 실험은 기존 결정적 검사·oracle·mutation을 유지. 매번 유료 판정 모델을 추가하지 않음 |
| [Ouroboros 라우팅](https://github.com/Q00/ouroboros/blob/1fc754e7b7599b3df057660bcc6af37241183766/src/ouroboros/orchestrator/model_routing.py#L430-L498) | 신뢰 조건이 있는 분해된 작업의 등급 조절, reasoning 깊이와 모델 등급 구분 | 기존 Luna→Terra 품질 실패 상향, 위험 하한, 예산 제한 유지. 작은 표본에 맞춰 retry 모델을 하향하지 않음 |
| [Ouroboros 수렴](https://github.com/Q00/ouroboros/blob/1fc754e7b7599b3df057660bcc6af37241183766/src/ouroboros/evolution/convergence.py#L94-L136) | 첫 세대의 검증된 성공에서도 종료 가능 | 성공한 작업 재실행은 성능 반복 측정에서만 수행. 제품의 수리 루프는 통과 즉시 종료 |

Ouroboros의 [문맥 예산 통합](https://github.com/Q00/ouroboros/blob/1fc754e7b7599b3df057660bcc6af37241183766/src/ouroboros/orchestrator/parallel_executor.py#L7590-L7655)은 일부 profile에 적용되며 실패하면
기존 prompt로 돌아가는 경로를 명시한다. 이를 모든 실행의 강제 토큰 상한으로 설명하지 않는다.

## 이번 구현

- **소스 문맥 선택:** `contextMode: "inline"`이면 최대 네 파일의 온전한 시작 소스를 최대 4,096바이트로
  묶는다. 파일 해시와 absent 상태를 보존하고, 전체 prompt 상한도 지킨다. 큰 파일·바이너리·넓은 scope는
  기본 targeted read로 돌아간다. 저장소 지침과 검증은 생략하지 않는다. 기본값은 실측 후 판단한다.
- **기존 문맥 보존:** 소스 묶음이 없는 기존 capsule의 prompt 직렬화를 유지한다. [공식 캐시 문서](https://developers.openai.com/api/docs/guides/prompt-caching)는
  prefix 변경이 캐시 재사용을 줄일 수 있음을 설명한다. 문자열을 짧게 바꾸기만 하면 비용도 줄어든다고 가정하지 않는다.
- **설명 가능한 관측:** 실행·평가 runner가 완료된 명령, 메시지, 변경 이벤트와 바이트 수, 제한된 반복 명령
  해시를 기록한다. 알려지지 않은 이벤트 이름이나 원문은 저장하지 않는다. 바이트와 청구 토큰을 구분한다.
- **통제된 비교:** 같은 난이도 라우팅·검사·수리 한도로 `read`와 `inline`을 반복 비교한다. 성공한 호출만
  골라 쓰지 않으며 실패·수리도 전부 합산한다. 전체 하네스 효과나 일반적인 모델 우열로 확대 해석하지 않는다.

새 비교 조건과 판정은 [실험 규약](../evals/token-efficiency/CONTEXT-EVAL.md)에 기록한다.

## 첫 실험에서 기각한 가설

[소스 사전 전달 비교](../evals/token-efficiency/results/context-ab-2026-09-07.json)는 두 문제를 각 방식으로
두 번씩 풀었다. 두 방식 모두 4/4개 작업을 첫 시도에 통과했지만, `read` 216,149토큰에서 `inline`
227,270토큰으로 **5.15% 증가**했다. API 표준 단가의 기본 비용 시나리오는 $0.15047 → $0.14542였으나,
총토큰 절감 기준은 통과하지 못했다. 비용 감소와 토큰 감소를 같은 성과로 취급하지 않는다.
8개 최종 패치는 원본 fixture에서 독립적으로 재구성하고 같은 oracle·회귀 검사를 다시 통과했다.
실패한 최적화도 소스와 보고서를 커밋 `5768542`에 보존했다.

## 두 번째 변경: 편집과 검증의 역할 분리

작은 작업에도 모델이 소스 읽기, 편집, 명령 실행, 출력 확인을 반복하게 한 구조를 바꿨다.
`workerMode: "edit-proposal"`은 온전한 작은 소스를 받은 모델이 편집안 한 번을 반환하게 한다.
하네스가 원본 해시·변경 범위·크기를 검증하고 파일에 적용한다. 부모가 결정적 검사를 수행하며,
실패한 검사 이름만 다음 시도에 전달한다. 검증 통과 후 추가 모델 판정 호출은 없다.

모델을 무조건 낮추지 않는다. 기존 난이도 분류와 위험 하한, Luna → Terra 상향 규칙은 그대로다.
새 모드는 낮은 위험의 구현·테스트·문서 작업, 최대 네 파일과 4,096바이트 소스에 한정된 명시적 선택이다.
넓은 저장소 탐색이나 아키텍처 작업은 기존 작업자 실행이 필요하다. 파일 적용 자체는 성공 판정이 아니며
결과의 `verification: NOT_VERIFIED`를 유지한다.

새 [비교 규약](../evals/token-efficiency/PROPOSAL-EVAL.md)은 양쪽 모두 실제 `session.prepare/run`을 쓴다.
두 문제 × 두 방식 × 두 반복으로 같은 요구사항과 라우팅, 독립 검사, 공유 예산을 적용한다.
소스 전달·도구 제한·반환 형식·적용 주체를 함께 바꾸는 실험이다. 개별 요소의 인과 효과나 전체 설치형
하네스의 절감률을 분리해 주장할 수 없다.

최초 호출 비교는 [실행 오류](../evals/token-efficiency/results/proposal-ab-2026-09-07.json)로 중단됐다.
대조 작업의 54,500토큰은 관측됐고 실패한 편집안 호출 1개의 사용량은 미확인이다. 원래 예산 예약을
그대로 두고 미확인을 0으로 계산하지 않았다. 출력 스키마 상수의 누락된 `type`을 추가하고
[Structured Outputs 제약](https://developers.openai.com/api/docs/guides/structured-outputs)에 대한 계약 검사를
보강했다. 기존 오류 스트림은 원문이 없어 정확한 서버 거절 원인을 입증할 수 없다. 후속 실행부터는
제한된 오류 분류를 남기며, 제공자 코드와 메시지 패턴에 따른 추정을 구분한다.
