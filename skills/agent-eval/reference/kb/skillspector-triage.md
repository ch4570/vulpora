---
title: SkillSpector 실행·트리아지
source: https://github.com/nvidia/skillspector
last_fetched: 2026-06-24
skills: [agent-eval, agent-evaluator]
---

# SkillSpector 실행 + 트리아지 (D5)

## 실행
```bash
uv tool install git+https://github.com/NVIDIA/skillspector.git   # 1회
# 정적(키 불필요)
SS_REPORT="$(mktemp "${TMPDIR:-/tmp}/vulpora-skillspector.XXXXXX.json")" || exit 1
trap 'rm -f "$SS_REPORT"' EXIT HUP INT TERM
skillspector scan <경로> --no-llm --format json -o "$SS_REPORT"
# 스킬 모음 일괄
skillspector scan skills --recursive --no-llm
# LLM 포함(오탐↓): export ANTHROPIC_API_KEY=...; SKILLSPECTOR_PROVIDER=anthropic
```
JSON: `risk_assessment.{risk_score,severity,recommendation}`, `issues[].{id,category,pattern,severity,confidence,location.{file,start_line},finding,explanation,remediation}`.

## 근거 라인 열기
```bash
python3 -c "import json,sys;d=json.load(open(sys.argv[1]));[print(i['severity'],i['category'],i['pattern'],i['location']) for i in d['issues']]" "$SS_REPORT"
sed -n '<line>p' <대상파일>     # 각 HIGH/CRITICAL의 실제 문맥 확인
```

## 트리아지 표(필수 산출물)
| finding(id/pattern) | SkillSpector 심각도 | 근거 라인 | 의도 | 판정 |
|---|---|---|---|---|
| 예: TM1 Tool Param Abuse | HIGH | `No --force used without...`(금지 체크리스트) | 금지 문장 | **오탐 → 기각** |
| 예: E1 External Transmission | MED | `curl -X POST` GitLab MR API | 정식 API | **오탐 → 기각** |
| 예: AS1 .claude 접근 | HIGH | `grep .claude/knowledge/` | 지식 로딩(비밀 아님) | **저위험 → LOW** |
| 예: 비밀 토큰 외부 전송 | HIGH | 실제 토큰 POST | 유출 | **실탐 → 유지 HIGH** |

**오탐 분리 기준**: 위험 플래그가 **금지/체크리스트/정식문서API/설정지식읽기** 문맥이면 기각·강등.
**실탐 유지 기준**: 비밀/PII 외부전송, 난독화, `eval/exec`, 핀 안 된 RCE, OSV CVE, 숨은 지시가 **근거 라인에 실제** 존재.

## 리뷰 훅
- [ ] skillspector 를 실제 실행해 JSON 확보?
- [ ] 모든 HIGH/CRITICAL의 `location` 라인을 `sed` 로 열어 판정?
- [ ] 트리아지 표(오탐/실탐+사유)를 산출?
- [ ] 점수를 전재하지 않고 트리아지 후 재산정?
- [ ] 정적/LLM 실행 범위 고지?
