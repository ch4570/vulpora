# 에이전트 하네스 / 액션-스페이스 설계 핵심 원칙 (Principles)

> 이 문서는 에이전트 하네스(액션 스페이스·도구 정의·관측 포맷·스코핑·안전한 변경 제안)를
> 설계·검토할 때 판단의 근거로 삼는 "헌법"이다. KB가 "사실·규칙"이라면 여기 원칙은
> "통찰·판단 기준"이다. 충돌 시 **KB(공식 문서)가 principles보다 우선**한다.

## 출처(Sources)

- Anthropic, "Building effective agents" — https://www.anthropic.com/engineering/building-effective-agents
- Anthropic, "Writing effective tools for agents / Tool use overview" — https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview
- Anthropic, "Effective context engineering for AI agents" — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- OpenAI, "Function calling guide" — https://platform.openai.com/docs/guides/function-calling
- Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models" — https://arxiv.org/abs/2210.03629

> 모델 독립성: 이 문서와 KB는 **특정 모델 버전을 전제하지 않는다.** 원칙은 모든 모델에서 성립하도록
> 작성하고, 제안서에도 모델 버전을 하드코딩하지 않는다.

---

## 0. 대전제: 하네스가 에이전트 성능의 상한을 정한다

- 동일 모델이라도 **액션 스페이스·도구 정의·관측 포맷**이 완성률(task completion)을 좌우한다.
  모델을 바꾸기 전에 하네스부터 의심하라.
- 가장 단순한 해법으로 시작하라. 다단계 에이전트 루프는 마지막 수단이다. 단발 호출이나
  검색-증강 프롬프트로 풀리면 에이전트화하지 않는다. (Building effective agents)

---

## 1. 액션 스페이스는 최소·직교(orthogonal)로 설계한다

1. **도구가 많을수록 좋은 게 아니다.** 겹치거나 모호한 도구는 모델의 선택 비용을 키우고
   오작동을 늘린다. 한 가지 의도는 한 가지 도구로 매핑되게 한다.
2. **각 도구는 명확한 단일 책임**을 가진다. "무엇이든 하는" 만능 도구(예: 임의 셸 실행)는
   강력하지만 모델이 잘못 쓰기 쉽고 blast-radius가 크다.
3. **에러 메시지는 피드백 채널이다.** 실패를 단순 throw로 끝내지 말고, 모델이 다음 행동을
   교정할 수 있게 "무엇이 왜 틀렸고 어떻게 고치는가"를 구조화해 돌려준다.
4. **가능하면 멱등(idempotent)하게.** 재시도/중복 호출이 같은 결과를 내도록 설계하면 루프의
   견고성이 올라간다.

---

## 2. 도구 정의 품질이 곧 호출 정확도다

1. 이름은 **행위가 드러나게**(동사+대상), 모델이 추측하지 않게 짓는다.
2. 파라미터 스키마는 **정밀하게** — 타입·필수/선택·열거값·범위 제약을 명시한다. 느슨한
   `string` 한 개로 받지 말고 구조화한다. (OpenAI function calling, Anthropic tool use)
3. 설명(description)은 **언제 쓰고 언제 쓰지 말지**를 구분해 준다. 비슷한 도구가 둘 이상이면
   각 설명이 서로를 배제하도록(disambiguate) 쓴다.
4. 가능하면 **예시 입출력**을 제공한다. 모델은 스펙보다 예시를 더 잘 따른다.

---

## 3. 컨텍스트는 유한 자원 — 관측은 신호/잡음 비율로 판단한다

1. **토큰 경제**: 관측(도구 결과)은 모델 컨텍스트를 소비한다. 길수록 좋은 게 아니라
   **의사결정에 필요한 신호만** 남긴다. (Effective context engineering)
2. **잘림(truncation)은 전략적으로**: 무작정 앞부분만 자르지 말고, 핵심(에러·요약·핵심 행)을
   보존하고 나머지는 페이지네이션/요청형으로 미룬다.
3. **실패는 묻지 말고 드러낸다.** 조용한 실패·빈 결과는 모델을 헛돌게 한다. 실패 신호는
   관측 최상단에 명시한다.
4. **구조 vs 산문**: 기계가 파싱할 결과는 구조화(표/JSON 유사), 판단을 요하는 맥락은 간결한
   산문. 둘을 섞어 장황하게 만들지 않는다.

---

## 4. 스코핑과 가드레일은 "기본이 안전"하게 한다

1. **승인 게이트**: 비가역·고영향 행위(파일 수정·배포·외부 쓰기)는 실행 전 사람 승인을 받는다.
   기본값은 "제안만". (Building effective agents의 human-in-the-loop)
2. **MUST / MUST NOT를 명시**한다. 모델이 추론으로 메우게 두지 말고 금지선을 하드 규칙으로 건다.
3. **blast-radius 제한**: 변경 범위·대상 경로·건수에 상한을 둔다. dry-run/preview를 먼저 보여준다.
4. **가역성(rollback) 우선**: 모든 변경은 되돌릴 방법(단일 커밋 revert 등)을 동반한다.
   되돌릴 수 없으면 더 강한 승인을 요구한다.

---

## 5. 추론과 행동을 교차(ReAct)하되 루프를 관측 가능하게 한다

1. **Reasoning + Acting 교차**: 생각(왜 이 행동인가) → 행동 → 관측 → 재계획. 행동만 연발하면
   오류 복구가 안 되고, 생각만 하면 환경 사실을 못 가져온다. (ReAct)
2. **관측을 근거로 재계획**한다. 모델의 내적 가정보다 도구가 돌려준 실제 사실을 우선한다.
3. **루프 종료 조건**을 명시한다(성공 기준·최대 반복·교착 감지). 무한 루프/예산 초과를 막는다.

---

## 6. 하네스 변경 제안은 "리서치→중복제거→점수화→가역적 적용안→승인"의 닫힌 루프다

1. **외부 신호를 정기적으로 수집**하되, 현재 하네스가 이미 가진 것과 **중복은 기각**한다.
2. 각 후보를 **Fit / Novelty / ROI / Risk** 4축으로 점수화해 채택/보류/기각으로 나눈다.
3. 채택 항목은 **가역적 적용안**(대상·변경유형·요지·검증·롤백)으로 명세한다.
4. **승인 전 어떤 하네스 파일도 수정하지 않는다.** 제안은 제안일 뿐, 적용은 별도 승인 작업이다.
