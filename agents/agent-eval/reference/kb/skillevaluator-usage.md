---
title: NVIDIA SkillEvaluator tier 선택과 증거 계약
source: https://github.com/NVIDIA/SkillEvaluator/tree/3bfba44e754be87073b2344233f9569b06509ce1
last_fetched: 2026-09-01
consumers: [agent-evaluator]
---

# SkillEvaluator 사용 계약

NVIDIA SkillEvaluator v0.2.1의 audited commit
`3bfba44e754be87073b2344233f9569b06509ce1`을 선택형 보조 평가기로 사용한다. 프로젝트 dependency나
vendored source로 넣지 않는다. plugin-shipped `scripts/run-skillevaluator.sh`는 설치된 `skillevaluator`만
호출하고 결과를 기본적으로 임시 디렉터리에 격리한다.

## tier 선택

| mode | 목적 | 선행 조건 | 판정 |
|---|---|---|
| `tier1` | schema·PII·license·quality·Unicode·script lint | 설치된 CLI | 기본 merge 보조 게이트 |
| `security` | Tier 1 + SkillSpector·Bandit·Semgrep·Gitleaks 기반 보안/코드 무결성 | 모든 scanner | 하나라도 incomplete면 non-pass |
| `tier2` | 한 skill 내부 의미 중복 | chat + embedding provider | provider 부재를 pass로 쓰지 않음 |
| `tier3` | 실제 agent with/without-skill 비교 | provider·agent credential·sandbox·eval dataset | `doctor` 통과 후 실행 |

실행은 `${CLAUDE_PLUGIN_ROOT}/skills/agent-eval/scripts/run-skillevaluator.sh`를 사용한다.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/agent-eval/scripts/run-skillevaluator.sh" skills/<name>
bash "${CLAUDE_PLUGIN_ROOT}/skills/agent-eval/scripts/run-skillevaluator.sh" --catalog skills
bash "${CLAUDE_PLUGIN_ROOT}/skills/agent-eval/scripts/run-skillevaluator.sh" --mode security skills/<name>
bash "${CLAUDE_PLUGIN_ROOT}/skills/agent-eval/scripts/run-skillevaluator.sh" --mode tier3 --agents codex --env-mode docker skills/<name>
```

Upstream `validate --full`은 사용하지 않는다. v0.2.1에서 Tier 3가 advisory이고 `--full`/`--autopilot`은
target 아래 `evals/evals.json`을 생성할 수 있다. 필요한 tier를 독립 실행하고 각 exit/status를 따로 판정한다.

`--catalog`은 direct child `SKILL.md`를 가진 source catalog 전체를 keyless Tier 1 또는 security mode로
검사한다. provider·agent·sandbox가 필요한 Tier 2/3는 개별 skill만 지원한다.

## 호환 정책

Vulpora skill frontmatter는 Codex/OpenAI 계약에 따라 `name`과 `description`만 요구한다. 따라서
`config/skillevaluator-policy.yaml`은 upstream external profile의 author 누락을 LOW로 낮춘다. 기존
`reference/` 디렉터리는 `SKILLEVALUATOR_SCHEMA_ALLOWED_DIRS=reference`로 명시한다. 이 두 호환 예외를
일반 finding 억제나 보안 severity 하향에 재사용하지 않는다.

## 증거 해석

- exit `0/1/2/3`을 각각 성공/검증 실패/설정 오류/런타임 오류로 보존한다.
- `overall_status=incomplete`, scanner/provider/sandbox 누락, Tier 3 task-source 오류는 PASS가 아니다.
- JSON/Markdown/BENCHMARK는 도구의 원시 증거다. HIGH/CRITICAL은 실제 location을 열어 intent를
  트리아지하고 Vulpora scorecard 결론을 별도로 낸다.
- API key, agent credential, raw trajectory를 저장소나 보고서에 복사하지 않는다.
- Tier 3는 experimental이며 hosted model 또는 managed sandbox 비용이 생길 수 있다.
- `--version` 검사는 `0.2.1` 계약 드리프트를 막지만 binary provenance의 암호학적 증명은 아니다.
  설치 기록에서 pinned commit URL을 함께 확인한다.

## 리뷰 훅

- [ ] release commit이 고정되어 있고 upstream 변경을 무심코 따라가지 않는가?
- [ ] output이 저장소 밖에 격리되었는가?
- [ ] 선택한 tier의 scanner/provider/agent/sandbox 증거가 완전한가?
- [ ] HIGH/CRITICAL을 실제 line context로 트리아지했는가?
- [ ] 기존 deterministic·behavioral eval을 대체했다고 과대 주장하지 않는가?
- [ ] upstream `--full`/autopilot로 target dataset을 자동 생성하지 않았는가?
