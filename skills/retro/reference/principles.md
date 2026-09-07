# 회고 / 포스트모템 핵심 원칙 (Principles)

> 이 문서는 회고(retrospective)와 비난 없는 포스트모템(blameless postmortem)에 관한 공식 레퍼런스를
> distill한 실무 원칙 모음이다. `/retro` 스킬이 판단의 근거로 삼는 "헌법" 역할을 한다.
> KB가 "사실·규칙"이라면 이 문서는 "통찰·판단 기준"이며, 충돌 시 **KB(공식 문서)가 우선**한다.

> **출처(Sources)**
> - Google SRE Book, "Postmortem Culture: Learning from Failure" — https://sre.google/sre-book/postmortem-culture/
> - Google SRE Workbook, "Postmortem Culture" — https://sre.google/workbook/postmortem-culture/
> - Atlassian, "Incident postmortem" / "5 Whys" — https://www.atlassian.com/incident-management/postmortem , https://www.atlassian.com/team-playbook/plays/5-whys
> - Atlassian Team Playbook, "Retrospective" — https://www.atlassian.com/team-playbook/plays/retrospective
> - Scrum Guide(2020), "Sprint Retrospective" — https://scrumguides.org/scrum-guide.html
> - Norman L. Kerth, *Project Retrospectives: A Handbook for Team Reviews* (Dorset House, 2001) — Prime Directive

---

## 0. 대전제: 회고의 목적은 기록이 아니라 변화다

- 회고·포스트모템의 산출물은 **추적 가능한 개선 행동**이다. 잘 쓰인 문서라도 액션 아이템이
  실행되지 않으면 가치가 없다(SRE: "행동으로 이어지지 않는 포스트모템은 실패다").
- "같은 실수를 반복하지 않는다"가 성공 기준이다. 일기·자기변호·책임 회피는 안티패턴이다.

---

## 1. 비난 없음(Blameless)이 전제 조건이다

Google SRE "Postmortem Culture" + Atlassian.

1. **사람이 아니라 시스템을 본다.** 장애·실수가 났다는 것은 "그 상황에서 그 행동이 합리적으로
   보였다"는 뜻이다. 비난은 정보를 숨기게 만들어 원인 파악을 막는다.
2. **심리적 안전(psychological safety)** 이 없으면 솔직한 회고는 불가능하다. 보복 없이
   실패를 드러낼 수 있어야 진짜 원인이 표면화된다.
3. Kerth의 **Prime Directive**: "당시 알던 것, 가진 기술, 자원, 상황을 고려하면 모두가
   자신이 할 수 있는 최선을 다했다고 이해하고 진심으로 믿는다."

---

## 2. 사실과 해석을 분리한다

- 먼저 **타임라인(언제 무엇이 일어났나)** 을 사실로 재구성한다. git log/diff, 로그, 커밋
  타임스탬프 등 **증거 기반**으로 적는다(KB: timeline-evidence).
- "왜"는 그 다음이다. 사실 수집 전에 원인을 단정하면 확증편향에 빠진다.
- 해석·추정은 사실과 명확히 구분해 표기한다("추정:", "가설:").

---

## 3. 근본원인은 보통 하나가 아니다

Atlassian 5 Whys + SRE.

- **5 Whys**는 표면 증상에서 더 깊은 원인으로 내려가는 도구지만, "단일 근본원인"으로
  과단순화하는 함정이 있다. 복잡한 사고는 보통 **여러 기여 요인(contributing factors)** 의
  결합이다.
- "기여 원인"과 "근본 원인"을 구분하되, 하나만 고치고 끝내지 않는다.
- 사람의 실수를 근본원인으로 적는 순간 분석은 멈춘다. "왜 그 실수가 가능했는가(시스템·가드레일
  부재)"로 한 단계 더 내려간다.

---

## 4. 회고 형식은 목적에 맞춰 고른다

Atlassian Retrospective + Scrum Guide.

- Keep/Problem/Try, Start/Stop/Continue, 4Ls, Mad/Sad/Glad 등은 모두 **"잘된 것·아픈 것·
  바꿀 것"을 끌어내는 프레임**이다(KB: retro-frameworks). 정답은 없고 맥락이 정한다.
- 좋은 회고는 (1) 무대 설정 → (2) 데이터 수집 → (3) 통찰 도출 → (4) 행동 결정 →
  (5) 마무리의 흐름을 가진다.
- 스크럼: 스프린트마다 회고를 열고, 개선 1~2개를 다음 스프린트 백로그에 넣는다.

---

## 5. 발견은 SMART한 액션 아이템으로 바꾼다

Atlassian + SRE.

- 모든 개선은 **소유자(owner)·기한(due)·검증 가능 기준**을 가진다. 이 셋이 없으면 "절대
  일어나지 않는 액션 아이템"이 된다(KB: action-item-tracking).
- 액션 아이템은 추적 시스템(이슈 트래커)에 올려 가시화하고, 다음 회고에서 진행 상태를
  점검한다.
- 한 번에 너무 많이 시도하지 않는다. 실행 가능한 소수에 집중한다.

---

## 6. 포스트모템을 언제 쓸지 합의된 트리거를 둔다

Google SRE.

- 사용자 영향이 일정 수준 이상, 데이터 손실, 온콜 개입 필요, 해결 시간 초과, 모니터링이
  못 잡은 장애 등 **사전 정의된 트리거**에서 포스트모템을 작성한다(KB: blameless-postmortem).
- "포스트모템을 쓰는 것이 처벌"이 되어선 안 된다 — 그러면 트리거를 회피하게 된다.

---

## 7. 회고 산출물은 공유되고 재사용된다

- 포스트모템·회고 문서는 팀에 공개·검토되어 조직 학습 자산이 된다.
- 반복되는 마찰은 일회성 수정이 아니라 **영구적 하네스 변경**(규칙·스킬·에이전트·지식)으로
  승격한다. `/retro` 스킬의 "하네스 개선 제안"이 이 역할을 한다.
