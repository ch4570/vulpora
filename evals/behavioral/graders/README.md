# behavioral graders

behavioral eval의 **결정적(deterministic) 채점기**. LLM 채점이 아니라 텍스트/정책 신호 기반이며 외부 의존성이 없다.

| grader | 역할 |
|---|---|
| `deterministic-text.sh` | 에이전트 출력 텍스트를 케이스의 `expected.must_find`/`must_not_claim`로 채점 → `outcome_score`(0~1) + 실패 신호. must_not_claim 위반 시 outcome 0으로 강등. |
| `trace-policy.sh` | `redact`(비밀/토큰/개인경로/자격증명 마스킹), `hash`(산출물 sha256 — 내용 비보존), `scrub-temp`(임시 디렉터리 안전 삭제). |

## 한계(정직 고지)
- `deterministic-text.sh` 는 **키워드 신호** 채점이다. 의미적 정확성(LLM 판단)은 평가하지 못한다 — 회귀 탐지·하한선 용도다.
- 더 정교한 채점(예: 산출물 구조 검증, 다관점 LLM 심사)은 향후 grader로 추가할 수 있게 분리해 두었다.
