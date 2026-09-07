# 지식 추출/영속화 핵심 원칙 (Principles)

> 이 문서는 작업에서 재사용 가능한 교훈을 뽑아 **영구 지식/규칙/메모리**로 남기는 일의
> 판단 기준("헌법")이다. KB가 "사실·규칙"이라면 principles는 "통찰·판단 기준"이다.
> 충돌 시 **KB(공식 문서)가 principles보다 우선**한다.

> **출처(Sources)**
> - Anthropic, *Effective context engineering for AI agents*
>   (https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
> - Anthropic, *Claude Code — Memory* (https://docs.anthropic.com/en/docs/claude-code/memory)
> - Diátaxis — 문서 유형 체계 (https://diataxis.fr/)
> - Andy Matuschak, *Evergreen notes* (https://notes.andymatuschak.org/Evergreen_notes)
> - Google, *Documentation Best Practices*
>   (https://google.github.io/styleguide/docguide/best_practices.html)
> - Google SRE Book — *Postmortem Culture: Learning from Failure*
>   (https://sre.google/sre-book/postmortem-culture/)

---

## 0. 대전제: 컨텍스트는 유한하다 — 최소 고신호만 남긴다

영속화하는 모든 토큰은 미래 세션의 컨텍스트 예산을 소비한다. 목표는 "다 적기"가 아니라
**재발견 비용을 없앨 최소한의 고신호 집합**이다. 남기는 이득(재발견 회피)이 남기는 비용
(미래 컨텍스트 오염)을 넘을 때만 남긴다.

## 1. 신호 게이트: 비자명·재사용·내구

세 관문을 **모두** 통과해야 영속화한다. 코드/문서만으로 금방 알 수 있거나(자명), 이번 한 번만
쓰이거나(비재사용), 곧 거짓이 될(비내구) 정보는 잡음이다. → `kb/signal-vs-noise.md`.

## 2. 중복은 정보가 아니라 부채다

이미 `AGENTS.md`/`CLAUDE.md`/스킬/git 이력/`.claude/knowledge/`/공식문서에 있는 것은 남기지
않는다. 쓰기 전 dedup 검색이 의무다. 진실의 출처는 하나여야 한다(SSOT).

## 3. 성격에 맞는 저장소로 라우팅한다

- **규범(MUST/MUST NOT)** → 거버닝 문서(`AGENTS.md`)나 소유 스킬. 지식 노트에 묻으면 강제력이 없다.
- **사실·맥락** → `.claude/knowledge/`(팀 SSOT) 또는 메모리(개인).
- 규범을 지식으로, 지식을 규범으로 위장하면 둘 다 약해진다. → `kb/memory-vs-skill-vs-rule.md`.

## 4. 공유 범위를 의식한다: 팀 SSOT vs 개인 메모리

팀이 재발견을 피해야 할 것은 팀 SSOT에, "내가 자주 잊는 것"은 개인 메모리에. 개인 습관으로
팀 정본을 오염시키지 않는다.

## 5. write-once 품질: 쓰는 순간 evergreen하게

한 노트 = 한 개념(원자성). 제목은 개념/주장, 머리말에 **출처(provenance)와 날짜**. 갱신은
제자리에서(update-in-place), 복제 금지. → `kb/curated-notes.md`.

## 6. 노트 유형을 섞지 않는다 (Diátaxis)

설명(explanation), 방법(how-to), 참조(reference)는 목적이 다르다. 한 노트에 뒤섞지 말고
유형에 맞는 형태로 쓴다. 결정 근거는 설명, 절차는 how-to, 사실 표는 reference.

## 7. 교훈은 근본 원인과 "왜"까지 내려간다 (blameless)

증상이 아니라 근본 원인, *무엇*이 아니라 *왜*를 남긴다. 비난이 아니라 "무엇이/왜 그렇게
되었나"에 집중한다. 코드에 안 남는 결정 근거가 가장 먼저 잊히므로 우선 보존한다.
→ `kb/lesson-extraction.md`.

## 8. 근거 없는 단정 금지

모든 영속 단정에는 근거(공식문서 URL·대화/PR 출처·책장)가 붙는다. 추측은 "가설"로 표시하거나
검증 후 남긴다.

## 9. 발견 가능해야 지식이다

남긴 노트는 색인(`README.md`/`INDEX.md`)에 등록한다. 찾을 수 없는 노트는 없는 것과 같다.

## 10. 승인 없이는 쓰지 않는다

추출 인사이트와 제안 대상을 먼저 보여주고, **사용자가 승인한 것만** 반영한다. 지식은 맥락을
보강할 뿐 규칙을 덮어쓰지 않는다.
