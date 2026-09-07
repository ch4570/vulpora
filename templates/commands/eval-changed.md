---
description: 변경된(diff 기준) 에이전트의 behavioral 평가만 실행. 새 에이전트 추가·기존 에이전트 수정 시 영향 받는 케이스만 골라 평가한다.
argument-hint: "[--run] [BASE_REF]   (예: --run origin/master)"
allowed-tools: Bash
---

# /eval-changed — 변경된 에이전트만 평가 (diff 기준)

이 저장소에서 **이번 변경(diff)이 건드린 에이전트의 behavioral 케이스만** 골라 평가한다.
전체 케이스를 매번 돌리지 않는다. 내부적으로 `evals/behavioral/run-changed.sh`를 호출한다.
모든 출력은 **한국어**.

## 인자 해석

`$ARGUMENTS`를 공백 단위로 파싱한다.

- `--run` : 어댑터(`VULPORA_BEHAVIORAL_RUNNER_CMD`)가 있으면 실제 에이전트를 실행해 채점. 없으면 정적 검증만.
- 첫 번째 비-플래그 토큰 = **BASE_REF**(예: `origin/master`, `master`). 주면 `BASE_REF...HEAD` 커밋 변경도 감지 범위에 더한다.
- 인자가 없으면: 워킹트리+staged 변경만 보고 `--validate`(정적 검증).

## 절차

1. 저장소 루트를 찾는다: `ROOT=$(git rev-parse --show-toplevel)`. git 저장소가 아니면 중단하고 알린다.
2. `$ROOT/evals/behavioral/run-changed.sh`가 있는지 확인. 없으면 "behavioral 평가 러너 없음"을 알리고 중단.
3. 인자를 그대로 전달해 실행한다. 한 번의 `Bash` 호출로 끝낸다(러너가 내부에서 변경 감지·매핑·필터·채점까지 수행):
   ```bash
   bash "$ROOT/evals/behavioral/run-changed.sh" $ARGUMENTS
   ```
   - `--run`을 줬는데 어댑터가 없으면 러너가 자동으로 검증만 수행한다(파괴적 호출 없음).
4. 러너 출력을 그대로 보여준 뒤, 한국어로 한 줄 요약한다:
   - 감지된 변경 파일 수 / 매핑된 대상 자산 / PASS·FAIL·SKIP 카운트.
   - **FAIL이 있으면** 실패한 케이스 id와 `failure_signals`(러너가 출력하면)를 1~2줄로 짚는다.
   - **대상 자산 0건**(변경이 에이전트에 매핑 안 됨, 예: `evals/`·`docs/`만 변경)이면 "평가 대상 없음 — 통과"로 보고. 실패 아님.

## 동작 메모 (러너가 알아서 하는 것)

- 변경 감지: 워킹트리(`git diff`) + staged(`git diff --cached`) + (BASE_REF 주면)`BASE_REF...HEAD`의 합집합.
- 변경 경로 → 자산 매핑:
  - `agents/<name>.md` → 자산 `<name>` (정의 직접 변경)
  - `agents/<dir>/…`(번들 SOUL·reference·kb) → 그 디렉터리명을 본문에서 참조하는 `agents/*.md`의 자산
  - 예) `agents/schema-doc/**`를 바꾸면 그 번들을 쓰는 `schema-cartographer`가 자동 대상이 된다.
- 실제 LLM 실행은 `--run` + `VULPORA_BEHAVIORAL_RUNNER_CMD` 어댑터가 있을 때만. 기본은 정적 검증(파괴적 명령 미실행).

## 예시

```bash
# 워킹트리 변경 기준, 정적 검증
bash "$ROOT/evals/behavioral/run-changed.sh"

# master 대비 커밋 변경까지 포함 + 실제 실행(어댑터 있을 때)
bash "$ROOT/evals/behavioral/run-changed.sh" --run origin/master
```

## 마지막 보고 형식

```
🧪 /eval-changed
- 변경 파일: <n>개 → 대상 자산: <assets | 없음>
- 결과: <pass>/<n> PASS, <fail> FAIL, <skip> SKIP  (<검증 | 어댑터 실행>)
- (FAIL 시) 실패: <case-id> — <한 줄 신호>
```
