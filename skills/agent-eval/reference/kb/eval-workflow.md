---
title: 평가 실측 명령 워크플로
source: ../../../../STANDARD.md
last_fetched: 2026-06-24
skills: [agent-eval, agent-evaluator]
---

# 평가 실측 — D1/D3 명령 (추측 금지, grep/ls로 확인)

대상 경로를 `T`(예: `agents/<name>.md` 또는 `skills/<name>`)로 둔다.

## 구조 정합 (D1)
```bash
# 에이전트: 정의 + 번들 동시 확인
ls agents/<name>.md && find agents/<bundle> -type f | sort
# 스킬
find skills/<name> -type f | sort
# 필수 구성요소 존재?
test -f agents/<bundle>/SOUL.md && echo SOUL ok
test -f agents/<bundle>/reference/principles.md && echo principles ok
test -f agents/<bundle>/reference/kb/INDEX.md && echo INDEX ok
```

## 프론트매터·리뷰 훅
```bash
# model 하드코딩 금지
grep -rn '^model:' agents/<name>.md agents/<bundle> skills/<name> && echo "VIOLATION: model hardcoded"
# 모든 KB에 리뷰 훅 존재?
for f in $(find <T> -path '*/reference/kb/*.md'); do
  grep -q '## 리뷰 훅' "$f" || echo "MISSING 리뷰 훅: $f"
done
# KB frontmatter 필수키
for f in $(find <T> -path '*/reference/kb/*.md'); do
  for k in title source last_fetched skills; do grep -q "^$k:" "$f" || echo "MISSING $k: $f"; done
done
```

## 범용성 (D3)
```bash
# 평가 대상 조직의 도메인 토큰으로 교체(서비스/제품명·내부 모듈·업종 용어 — STANDARD §3)
grep -rniIE '<service>|<internal-module>|<industry-term>' <T> \
  && echo "CHECK: 도메인 토큰 의심(문맥 확인)" || echo "universality OK"
```

## tools 적정성
```bash
# 선언된 tools 확인 → 절차상 필요한 최소 집합인지 사람이 판정
grep -n '^tools:' agents/<name>.md
```

## 등록·게이트
```bash
grep -E "\| <name> \|" install/manifest.txt || echo "NOT registered in manifest"
bash install/check-manifest.sh   # 정합 0 / 드리프트 1
# skill 대상의 keyless Tier 1 보조 게이트(설치된 skillevaluator 필요)
AGENT_EVAL_SKILL_ROOT=<로드된 agent-eval/SKILL.md의 directory>
bash "$AGENT_EVAL_SKILL_ROOT/scripts/run-skillevaluator.sh" skills/<name>
```

## 리뷰 훅
- [ ] 번들 필수 파일(SOUL/principles/kb/INDEX) 존재를 `ls`/`test` 로 확인?
- [ ] `model:` 하드코딩 grep 0?
- [ ] 모든 KB에 `## 리뷰 훅` + 필수 frontmatter 4키?
- [ ] 금지 토큰 grep 0 hit?
- [ ] manifest 등록 + check-manifest 통과?
- [ ] skill 대상이면 SkillEvaluator tier/status/report path와 incomplete 여부를 기록했는가?
