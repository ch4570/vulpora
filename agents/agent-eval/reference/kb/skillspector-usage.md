---
title: SkillSpector 사용·오탐 트리아지
source: https://github.com/nvidia/skillspector
last_fetched: 2026-06-24
consumers: [agent-evaluator]
---

# SkillSpector — 실행·해석·트리아지 (D5)

[NVIDIA SkillSpector](https://github.com/nvidia/skillspector): AI 에이전트 스킬용 보안 스캐너. 68 패턴/17 카테고리(프롬프트 인젝션·데이터 유출·공급망·권한상승·위험코드·시스템프롬프트 유출·메모리 오염·MCP 보안 등). 위험점수 0–100(LOW≤20 / MED≤50 / HIGH≤80 / CRITICAL>80) + 권고(SAFE/CAUTION/DO_NOT_INSTALL).

## 설치
```bash
uv tool install git+https://github.com/NVIDIA/skillspector.git   # 또는 docker build
skillspector --version
```

## 실행
```bash
# 정적만(키 불필요, 결정적·빠름·오탐 많음)
skillspector scan <경로> --no-llm --format json -o report.json
# 스킬 모음 디렉터리(각 SKILL.md 하위) 개별 스캔
skillspector scan skills --recursive --no-llm
# LLM 의미분석 포함(오탐↓, 키 필요): ANTHROPIC_API_KEY + SKILLSPECTOR_PROVIDER=anthropic
SKILLSPECTOR_PROVIDER=anthropic skillspector scan <경로> --format markdown -o report.md
```
- 입력: 디렉터리 / `SKILL.md` / `.md` / zip / Git URL.
- 출력 JSON 키: `risk_assessment`(`risk_score`,`severity`,`recommendation`), `issues[]`(`id`,`category`,`pattern`,`severity`,`confidence`,`location.{file,start_line}`,`finding`,`explanation`,`remediation`).
- 종료코드: 0=safe/caution, 1=do_not_install, 2=error.

## ⚠️ 정적 스캔 오탐 패턴 (반드시 트리아지)
`--no-llm` 은 문자열/패턴 매칭이라 **문맥을 모른다.** 각 finding의 `location` 라인을 **열어** 의도를 판정한다:

| 오탐 유형 | 매칭 예 | 실제 의도 | 판정 |
|---|---|---|---|
| **금지 체크리스트** | `--no-verify`/`--force`/`--allow-empty` 가 "Tool Misuse" HIGH | "이 플래그를 **쓰지 마라**"는 금지 문장 | 오탐 → 기각/LOW |
| **정식 API 호출** | `curl -X POST` 가 "Data Exfiltration" | 문서화된 REST(예: GitLab MR 생성) | 오탐 → 기각 |
| **설정 지식 경로 읽기** | `grep .claude/knowledge/` 가 "Agent Snooping" HIGH | 자격증명이 아닌 **지식 하위 디렉터리** 로딩 | 저위험 → LOW (단, `.claude/` 광역 grep은 narrow 권고) |
| **메타 기능** | skill-updater의 "Prompt Injection"/"Snooping" | 스킬을 읽고 갱신하는 본래 기능 | 기능상 예상 → 정책 게이트 권고 |

**실탐 신호(남겨야 할 것)**: 외부로 **비밀/토큰/PII 전송**, 난독화 코드, `eval`/`exec`/동적 import, 핀 안 된 원격 코드 실행, 알려진 CVE(OSV), 숨은 지시(프롬프트 인젝션) — 근거 라인에 실제 그 행위가 있을 때.

## 보고 규칙
- 점수를 **그대로 옮기지 않는다.** "정적 HIGH n건 중 m건 오탐(근거), 실탐 k건" 형태로 트리아지 표를 낸다.
- 정적만 돌렸으면 "LLM 의미분석 미실행"을 명시(principles §9).

## 리뷰 훅
- [ ] `skillspector scan` 을 실제로 돌렸는가(점수·issues 확보)?
- [ ] **모든** HIGH/CRITICAL finding의 근거 라인을 열어 의도 판정했는가?
- [ ] 오탐(금지문맥/정식API/설정읽기)을 분리하고 사유를 적었는가?
- [ ] 실탐(비밀전송·난독화·RCE·CVE·숨은지시)만 HIGH/CRITICAL로 남겼는가?
- [ ] 정적/LLM 실행 범위를 정직하게 고지했는가?
