# Task Splitter 핵심 원칙

> **Sources**
> - Vulpora `docs/agent-mcp-design-rules.md` §5.1, 오케스트레이션 규칙
> - ISO/IEC/IEEE 29148:2018, requirements traceability
> - Project Management Institute, Practice Standard for Work Breakdown Structures

1. **결과와 검증을 함께 분해한다.** 각 task는 objective뿐 아니라 그 결과를 증명할 acceptance test를 가진다.
2. **의존성을 최소화하되 숨기지 않는다.** 선행 산출물·공유 state·겹치는 write scope는 명시적 edge다.
3. **한 owner, 한 bounded scope.** task는 한 역할이 독립적으로 완료하고 보고할 수 있어야 한다.
4. **병렬성은 증명 대상이다.** 같은 wave는 dependency가 없고 write scope가 분리될 때만 성립한다.
5. **추적성을 보존한다.** 명세 요구→인수기준→task→검증 결과를 역추적할 수 있어야 한다.
6. **권한은 분할돼도 늘지 않는다.** task authority의 합집합도 parent authority ceiling을 넘을 수 없다.
7. **작은 작업을 과분해하지 않는다.** 조정 비용이 검증·소유권 이득보다 크면 하나의 task로 둔다.
8. **싼 검증부터, 필요한 판단만 비싼 모델로 보낸다.** 결정적 명령에는 모델을 쓰지 않고 각 LLM task는
   독립적으로 가장 낮은 충분 profile에서 시작한다.
9. **실행 context를 격리한다.** Codex·Claude Code의 native child에 전체 transcript 대신 bounded
   handoff를 보내고 structured result만 회수한다. Child의 재위임은 허용하지 않는다.
10. **요구와 선택을 분리한다.** Frozen task에는 capability·complexity·risk·reasoning·상대 budget·policy만
    기록하고 구체 provider/model route는 trusted runtime의 dispatch receipt에만 둔다.
11. **역할을 먼저, 모델을 나중에 고른다.** Observable outcome에 맞는 owner role을 정한 뒤 task별
    complexity와 risk로 profile을 고른다. 한 profile을 모든 child에 복사하지 않는다.
12. **분해 품질을 감사한다.** AC→contract→evidence 지도를 만들고 vague objective, horizontal slice,
    raw-prose dependency, coordination-only task와 fake parallelism이 0건일 때만 ready로 판정한다.
